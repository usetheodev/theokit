# Plan: Pluggable Storage — `StorageManager` Singleton

> **Version 1.0** — TheoKit hoje tem 4 interfaces pluggable independentes (`ConversationStorageLike`, `JobBackend`, `UsageStorageAdapter`, `RateLimitStorageAdapter`) mas falta um **lifecycle manager unificado** que (a) cache pools/clients, (b) coordene drain em SIGTERM, (c) separe "server config" de "database config" (padrão Encore), (d) deixe TheoCloud slottar como backend único via `theo.config.ts > storage`. Este plano implementa `StorageManager` singleton conforme §9 do reference doc `.claude/knowledge-base/reference/pluggable-storage-managed-pg-redis.md`, refatora `PostgresConversationStorage` + `PostgresJobBackend` para receber pools do manager, e estende o SIGTERM handler em `start.ts` para drenar o manager após `Agent.registry.evictAll()`. Resultado esperado: TheoCloud (e qualquer deploy self-host com managed PG/Redis) configura todos os adapters via um único bloco em `theo.config.ts`, com graceful shutdown coordenado.

## Context

Hoje cada adapter pluggable é cabeado piecemeal:

- **`PostgresConversationStorage`** (`tests/fixtures/conversation-postgres/storage.ts:30`) recebe `pool: PoolLike` direto no construtor — user precisa instanciar `pg.Pool` em userland e gerenciar lifecycle.
- **`PostgresJobBackend`** (`packages/theo/src/server/jobs/job-backend-postgres.ts:30-49`) idem — `PoolLike` interface local, user passa pool externo.
- **`InMemoryUsageStorage`** (`packages/theo/src/server/cost/usage-storage-memory.ts`) não tem dispose hook.
- **`RateLimitStorageAdapter`** (`packages/theo/src/server/rate-limit/rate-limit-store.ts`) idem — sem coordenação.

Nenhum desses pools fecha em SIGTERM. O `start.ts:418-447` só evicta agents:

```ts
// start.ts:425-446
void (async () => {
  const sdk = (await import('@usetheo/sdk').catch(() => null)) as { ... }
  if (sdk?.Agent?.registry?.evictAll !== undefined) {
    await sdk.Agent.registry.evictAll()
  }
  // ...
  server.close(() => { process.exit(0) })
  setTimeout(() => { process.exit(0) }, 25_000).unref()
})()
```

**Evidências:**

- Reference doc `.claude/knowledge-base/reference/pluggable-storage-managed-pg-redis.md` §9 (lines 520-858) — implementation guide completo com 4 fases de rollout, 8-10 cenários de teste, lista de arquivos.
- Reference doc §4 (lines 404-440) — 6 padrões convergentes (lazy singleton cache, server-vs-DB separation, strategy pattern, graceful shutdown wait, test-mode swap, connector factory) — todos cabíveis em uma única abstração.
- Reference doc §8 (lines 505-518) — edge cases conhecidos: Encore Manager DCL race (`manager_internal.go:96-115`), Nitro dev override (`config/resolvers/database.ts:5-20`), Rails adapter lookup ambiguity (`queue_adapter.rb:39-44`).
- Roadmap macro (`CLAUDE.md` Ecosystem § linha "TheoCloud") — `JobBackend`, `UsageStorageAdapter`, `RateLimitStorageAdapter` "already designed *for it*" — falta o manager que unifica.
- ADR-0002 (`docs/adr/0002-job-backend-interface-neutral-contract.md`) — precedente para "pluggable interface neutra ao platform". `StorageManager` extends esse padrão.

## Objective

**Done = TheoCloud (e qualquer self-host) configura PG + Redis para todos os 4 adapters via um único bloco `theo.config.ts > storage`, com pools cached e drain coordenado em SIGTERM.**

Metas mensuráveis:

1. `getStorageManager()` retorna singleton estável across imports.
2. `theo.config.ts > storage` aceita `servers`, `databases`, `redis` records via Zod schema.
3. `usePostgres(dbName, factory)` cria pool 1x e cacheia; chamadas concorrentes invocam factory exatamente 1x.
4. `useRedis(serverName, factory)` mesmo padrão.
5. `dispose()` drena registered adapters + PG pools + Redis clients em paralelo; idempotente; falhas individuais não bloqueiam.
6. `start.ts` SIGTERM chama `manager.dispose()` após `Agent.registry.evictAll()` (ordem: agents primeiro, storage depois).
7. `PostgresConversationStorage` + `PostgresJobBackend` refatorados para receber pool do manager (BC preservada via overload).
8. Fixture `tests/fixtures/storage-manager-recipe/` prova o wire end-to-end.
9. Concept doc `docs/concepts/storage-manager.md` documenta o padrão + matrix por deploy target.
10. `pnpm test` ≥ 2730 tests; `pnpm typecheck` 0 errors; `pnpm lint` 0 warnings; `pnpm check:deps` 0 violations.

## ADRs

### D1 — Singleton por processo, NÃO por request
- **Decisão:** `getStorageManager()` retorna 1 instância por processo Node.js. Pools são cached na instância.
- **Rationale:** PG pool é caro de criar (~50-200ms TCP + TLS); o overhead amortiza só quando reutilizado entre requests. Encore (`manager_internal.go:21-31`), Nitro (`runtime/internal/database.ts:1-17`), Fastify (`docs/Guides/Database.md`) — todos usam singleton. Per-request seria inviável.
- **Consequences:** ✅ Pool warming, throughput estável. ⚠️ Estado compartilhado entre testes — exige `__resetForTests()`. ⚠️ Não suporta multi-tenancy per-request (out of scope, ver §5 / §10 #5 do reference doc).

### D2 — Factory pattern para drivers (NÃO hard-import `pg`/`ioredis`)
- **Decisão:** `usePostgres(dbName, factory)` e `useRedis(serverName, factory)` recebem factory function que cria o pool. TheoKit NÃO importa `pg` ou `ioredis` no core.
- **Rationale:** Forçar `pg` como peer dep impacta usuários in-memory-only (templates default, dev). Factory mantém drivers como deps opcionais. Custo: 5 linhas de boilerplate no userland. Encore (Go) hard-imports `pgx`; Nitro (`virtual/database.ts:1-9`) usa connector factory — escolhemos Nitro porque TheoKit também é dual-runtime (Node/Edge).
- **Consequences:** ✅ Bundle TheoKit não infla. ✅ Drivers opcionais. ⚠️ 5 linhas extras no userland — mitigado por recipe em `tests/fixtures/storage-manager-recipe/`.

### D3 — `configure()` honrado UMA vez por processo
- **Decisão:** Segunda chamada a `configure()` emite warn e ignora. Reset apenas via `__resetForTests()`.
- **Rationale:** Mirroring do padrão `configureAgentRegistryOnce` (já em `packages/theo/src/server/agent/configure-agent-registry.ts:42-64`). Evita conflito quando user code chama configure manualmente + framework também chama em start.ts.
- **Consequences:** ✅ Previsibilidade. ✅ Framework wins (theo.config.ts authoritative). ⚠️ Hot-reload em dev exige `__resetForTests()` no Vite plugin (fora deste plano).

### D4 — `StorageConfig` mora em `theo.config.ts > storage`
- **Decisão:** Schema Zod adicionado em `packages/theo/src/config/schema.ts` ao lado de `cache`, `agents`, `security`.
- **Rationale:** Co-localização com outras configs do framework. Encore (TS) define recursos co-localizados com código (`new SQLDatabase('users')` em runtime — não funciona em TheoKit por causa do Vite bundler). Rails separa em `config/database.yml`. TheoKit já tem `theo.config.ts` como home — manter consistência. Schema ≤ 80 LOC → cabe; revisita se crescer (open question §10 #2 do reference doc).
- **Consequences:** ✅ Um único loader (`loadConfig`). ✅ Discoverable. ⚠️ `theo.config.ts` cresce.

### D5 — `dispose()` drena em paralelo, NÃO espera in-flight queries
- **Decisão:** `dispose()` chama `dispose()` em adapters + `pool.end()` + `redis.quit()` em paralelo via `Promise.all`. Não espera queries em vôo.
- **Rationale:** Plataforma LB (K8s preStop, Vercel/CF/Render drain) já tirou o pod de rotação ANTES do SIGTERM chegar. Igual ao trade-off documentado em EC-13 da Phase 6 do plano de security-hardening (`docs/plans/security-hardening-2026-plan.md` se existir, ou comportamento atual de `start.ts:412-415`). Encore espera (`<-OutstandingTasks.Done()`) mas TheoKit não tem outstanding-task counter framework-wide.
- **Consequences:** ✅ Shutdown rápido (< 25s force-exit). ⚠️ Query em vôo é abortada — aceito (LB drenou).

### D6 — `register(adapter)` é opt-in para participar do drain
- **Decisão:** Adapters declaram `{ name: string, dispose(): Promise<void> }` e chamam `manager.register(this)`. Manager mantém `Set<StorageAdapter>` e drena no `dispose()`.
- **Rationale:** Permite adapters in-memory (sem PG/Redis) participarem do shutdown (flush stats, persistir estado). `InMemoryUsageStorage` poderia escrever stats em disk; `RateLimitStorageAdapter` poderia logar overflow.
- **Consequences:** ✅ Extensível. ✅ Errors swallowed (não bloqueia shutdown — mirroring Encore pattern). ⚠️ User esquece de chamar `register` → adapter não drena — documentado no concept doc.

### D7 — `PoolLike` extraído para `server/storage/storage-types.ts`
- **Decisão:** A interface `PoolLike` que hoje vive em `server/jobs/job-backend-postgres.ts:30` é exportada de `server/storage/storage-types.ts` e re-exportada por `server/jobs/job-backend-postgres.ts` para BC.
- **Rationale:** Múltiplos adapters precisam do mesmo shape — evita duplicação. Mover é não-quebrante.
- **Consequences:** ✅ DRY. ✅ Single source of truth. ⚠️ Cuidado: barrel `theokit/server` já exporta `PoolLike`? Verificar antes de mover.

## Dependency Graph

```
Phase 0 (ADR + types extract)
        │
        ▼
Phase 1 (StorageManager core + Zod schema)
        │
        ├──────────────┐
        ▼              ▼
Phase 2          Phase 3
(adapter         (start.ts
 integration)     SIGTERM
                  wiring)
        │              │
        └──────┬───────┘
               ▼
        Phase 4 (fixture + concept doc)
               │
               ▼
        Phase 5 (Dogfood QA)
```

**Parallelization:** Phase 2 e Phase 3 podem rodar em paralelo após Phase 1 (ambas consomem `StorageManager` API mas não se sobrepõem nos arquivos editados).

---

## Phase 0: ADR + shared types extraction

**Objective:** Documentar a decisão arquitetural e extrair `PoolLike` para o local definitivo antes de qualquer código novo.

### T0.1 — Write ADR-0007 (StorageManager singleton)

#### Objective
Registrar a decisão arquitetural `D1`-`D7` em ADR persistente.

#### Evidence
- Reference doc §9 (520-858) propõe a arquitetura.
- Padrão de ADRs já estabelecido em `docs/adr/0001-0006`.
- Sem ADR, futuros PRs podem re-litigar D5 (drain em paralelo) ou D2 (factory vs hard-import).

#### Files to edit
```
docs/adr/0007-storage-manager-singleton.md — NEW: registra D1..D7
```

#### Deep file dependency analysis
- `docs/adr/0007-storage-manager-singleton.md` (NEW) — depende apenas do conteúdo deste plano + do reference doc. Não tem consumidores em código; é prosa.

#### Deep Dives
- Formato MADR 3.0 (igual aos ADRs 0001-0006).
- Status: `accepted`.
- Cita: reference doc, ADR-0002 (predecessor), §4 patterns do reference doc.

#### Tasks
1. Criar `docs/adr/0007-storage-manager-singleton.md`.
2. Status `accepted`, date `2026-05-26`.
3. Documentar D1..D7 com rationale + consequences.
4. Cross-link com ADR-0002 (`docs/adr/0002-job-backend-interface-neutral-contract.md`) e reference doc.

#### TDD + BDD (⛔ OBRIGATÓRIO)

ADRs são documentação prosa — não têm runtime. O TDD aplicado é uma **assertion estrutural** sobre o arquivo, garantindo que o ADR existe e tem as seções obrigatórias.

```
RED:     adr_0007_exists() — Given the repo state, When read 'docs/adr/0007-storage-manager-singleton.md', Then file exists and contains '# ADR-0007', 'Status: accepted', '## Context', '## Decision', '## Consequences' (MUST fail pre-write)
RED:     adr_0007_cites_d1_d7() — Given the ADR is read, When grep 'D[1-7]' lines, Then 7 distinct decisions are documented
RED:     adr_0007_cross_links() — Given the ADR is read, When grep 'ADR-0002' and 'pluggable-storage-managed-pg-redis.md', Then both are referenced
GREEN:   Write the ADR file with all sections + 7 decisions + cross-links
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/adr-0007-storage-manager.test.ts
```

BDD scenarios:
- **Happy path**: ADR exists with all sections.
- **Validation error**: Missing 'Status: accepted' fails the structural test (regresses if someone deletes the line).
- **Edge case**: ADR with only 6 decisions fails the count assertion.
- **Error scenario**: ADR doesn't exist → file-not-found error.

#### Acceptance Criteria
- [ ] `docs/adr/0007-storage-manager-singleton.md` exists with MADR 3.0 sections
- [ ] 7 decisions documented (D1..D7) — each with Rationale + Consequences
- [ ] Cross-links to ADR-0002 + reference doc
- [ ] Status `accepted`, date `2026-05-26`
- [ ] Pass: `npx vitest run tests/unit/adr-0007-storage-manager.test.ts`

#### DoD
- [ ] File committed
- [ ] Structural test green
- [ ] Linked from `docs/concepts/storage-manager.md` (Phase 4)

---

### T0.2 — Extract `PoolLike` to `server/storage/storage-types.ts`

#### Objective
Mover `PoolLike` (hoje em `server/jobs/job-backend-postgres.ts:30`) para `server/storage/storage-types.ts` e re-exportar do jobs file para BC.

#### Evidence
- `packages/theo/src/server/jobs/job-backend-postgres.ts:30-39` — `PoolLike` defined locally.
- `tests/fixtures/conversation-postgres/storage.ts:26-28` — duplica `PoolLike` shape (out of source tree, mas evidência de demanda).
- ADR D7 — DRY principle.

#### Files to edit
```
packages/theo/src/server/storage/storage-types.ts — NEW: define `PoolLike` (canonical)
packages/theo/src/server/jobs/job-backend-postgres.ts — EDIT: re-export from new file; keep BC for downstream
packages/theo/src/server/index.ts — EDIT (if needed): re-export PoolLike from server/storage (verify if currently exported)
```

#### Deep file dependency analysis
- `server/storage/storage-types.ts` (NEW): single-file module, no internal deps. Exports `PoolLike`.
- `server/jobs/job-backend-postgres.ts`:
  - **Today:** declares `export interface PoolLike { query<R>... }` at line 30.
  - **After:** `export { type PoolLike } from '../storage/storage-types.js'` — same wire shape; downstream `import { PoolLike } from 'theokit/server'` works unchanged.
  - **Downstream consumers:** `tests/integration/postgres-job-backend*.test.ts`, fixture `tests/fixtures/conversation-postgres/storage.ts` (uses local copy — separate concern, ignored for BC).
- `server/index.ts` (barrel): check whether `PoolLike` is currently re-exported. If yes, keep the line working via the new path.

#### Deep Dives
- `PoolLike` shape (preserved):
  ```ts
  export interface PoolLike {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    query<R = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ): Promise<{ rows: R[]; rowCount?: number | null }>
  }
  ```
  Generic `R` mantido com mesma eslint-disable + comment, exatamente como hoje (compatível com Encore/pg/postgres.js/pg-mem).
- **Invariant:** type identity preserved — `T` que era `PoolLike` deve continuar sendo `PoolLike` mesmo após o re-export (TS structural typing garante isso, mas confirmamos via type test).

#### Tasks
1. Criar `packages/theo/src/server/storage/storage-types.ts` com `export interface PoolLike { ... }`.
2. Em `packages/theo/src/server/jobs/job-backend-postgres.ts`: remover a interface local, adicionar `export type { PoolLike } from '../storage/storage-types.js'`.
3. Verificar `packages/theo/src/server/index.ts` — se exporta `PoolLike`, ajustar o path.
4. Re-rodar `pnpm typecheck` para garantir zero regressões.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     poolLike_exported_from_storage_types() — Given the new module, When import { PoolLike } from 'packages/theo/src/server/storage/storage-types.js', Then the import resolves (MUST fail pre-move)
RED:     poolLike_reexported_from_jobs() — Given backward-compat, When import { PoolLike } from 'packages/theo/src/server/jobs/job-backend-postgres.js', Then resolves to same type
RED:     postgres_job_backend_still_compiles() — Given the existing PostgresJobBackend class, When called with a mock pool, Then it satisfies PoolLike (edge case: identity preservation)
RED:     barrel_export_unchanged() — Given downstream user code `import { PoolLike } from 'theokit/server'`, When the import is type-checked, Then no error (error scenario: barrel broke)
GREEN:   Create storage-types.ts; update jobs/job-backend-postgres.ts re-export
REFACTOR: None — pure file move + re-export
VERIFY:  npx vitest run tests/unit/storage-types-pool-like.test.ts && pnpm typecheck
```

BDD scenarios:
- **Happy path**: `PoolLike` importável do novo path.
- **Validation error**: Importar de path inexistente falha (sanity check).
- **Edge case**: Type identity preserved — `interface A extends PoolLike` continua compilando após o move.
- **Error scenario**: Barrel `theokit/server` quebrado se a re-exportação não foi feita.

#### Acceptance Criteria
- [ ] `packages/theo/src/server/storage/storage-types.ts` exists com `PoolLike`
- [ ] `packages/theo/src/server/jobs/job-backend-postgres.ts` re-exports `PoolLike`
- [ ] `tests/unit/storage-types-pool-like.test.ts` green
- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint --max-warnings=0` exit 0
- [ ] `pnpm check:deps` 0 violations

#### DoD
- [ ] File created + jobs re-export updated
- [ ] All tests green
- [ ] Zero new TS/lint errors
- [ ] Dep-cruiser clean

---

## Phase 1: StorageManager core + Zod schema

**Objective:** Implementar `StorageManager` class + singleton getter + `StorageConfig` Zod schema.

### T1.1 — Implement `StorageConfig` Zod schema in `config/schema.ts`

#### Objective
Adicionar a chave `storage` ao schema Zod do `theo.config.ts` cobrindo `servers`, `databases`, `redis`.

#### Evidence
- Reference doc §9.3 (lines 581-616) — schema TS.
- Padrão de extensão de `theo.config.ts`: `agents.registry` adicionado em commit anterior (`packages/theo/src/config/schema.ts:228-235`).
- TheoCloud target — sem schema, user não consegue declarar config.

#### Files to edit
```
packages/theo/src/config/schema.ts — EDIT: add `storageSchema` + integrate into root schema
tests/unit/config-storage-schema.test.ts — NEW: Zod validation tests
```

#### Deep file dependency analysis
- `config/schema.ts`:
  - **Today:** exports root schema com `cache`, `agents`, `security`, `csrf`, etc.
  - **After:** adiciona `storage: storageSchema.optional()` ao root.
  - **Downstream:** `config/load-config.ts` (consome o root schema), `cli/commands/start.ts` (lê `config.storage`), `cli/commands/dev.ts` (idem).
- `tests/unit/config-storage-schema.test.ts` (NEW): valida happy path + edge cases do schema.

#### Deep Dives

**Zod schema (mirrors reference doc §9.3):**

```ts
const tlsConfigSchema = z.object({
  rejectUnauthorized: z.boolean().optional(),
  caCert: z.string().optional(),
  clientCert: z.string().optional(),
  clientKey: z.string().optional(),
})

const serverConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().max(65535).optional(),
  user: z.string().min(1),
  password: z.string(),
  tls: tlsConfigSchema.optional(),
})

const postgresDatabaseConfigSchema = z.object({
  server: z.string().min(1),
  database: z.string().min(1),
  pool: z.object({
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().positive().optional(),
    connectionTimeoutMillis: z.number().int().positive().optional(),
    idleTimeoutMillis: z.number().int().nonnegative().optional(),
  }).optional(),
})

const redisServerConfigSchema = serverConfigSchema.extend({
  db: z.number().int().nonnegative().optional(),
  maxRetriesPerRequest: z.number().int().nonnegative().optional(),
})

export const storageSchema = z.object({
  servers: z.record(z.string(), serverConfigSchema).optional(),
  databases: z.record(z.string(), postgresDatabaseConfigSchema).optional(),
  redis: z.record(z.string(), redisServerConfigSchema).optional(),
})
```

**Invariants:**
- `databases[k].server` deve referenciar uma chave em `servers` — validado em **runtime** no `StorageManager.configure()` (não no schema, porque Zod cross-field refinement é frágil) ou via `.superRefine`.
- Senha pode ser string vazia (alguns providers permitem) → não `.min(1)`.
- Port range válido (1-65535) enforced no schema.

**Edge cases:**
- `storage: undefined` (user não declara) → válido, manager ignora.
- `storage: {}` (objeto vazio) → válido, manager ignora.
- `storage: { databases: { conv: { server: 'unknown' } } }` → schema OK, manager throws em `usePostgres('conv', ...)` com erro acionável.

#### Tasks
1. Adicionar `tlsConfigSchema`, `serverConfigSchema`, `postgresDatabaseConfigSchema`, `redisServerConfigSchema`, `storageSchema` em `config/schema.ts` (próximo a `cacheSchema`).
2. Adicionar `storage: storageSchema.optional()` ao root schema.
3. Exportar `StorageConfig = z.infer<typeof storageSchema>` ao lado de outros tipos derivados.
4. Criar `tests/unit/config-storage-schema.test.ts` cobrindo os 4 BDD scenarios.
5. Rodar typecheck para garantir que `config.storage` aparece tipado no `loadConfig`.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     storageSchema_accepts_valid_config() — Given valid config { servers, databases, redis }, When parsed, Then success (happy path; MUST fail pre-schema)
RED:     storageSchema_rejects_invalid_port() — Given port: 99999, When parsed, Then ZodError on port (validation error)
RED:     storageSchema_accepts_empty_object() — Given {}, When parsed, Then success (edge case: optional sections)
RED:     storageSchema_rejects_negative_pool_min() — Given pool.min: -1, When parsed, Then ZodError (error scenario)
RED:     storageSchema_exposes_StorageConfig_type() — Given the inferred type, When used as parameter, Then TS accepts the shape (type test via expectTypeOf)
RED:     storageSchema_silently_drops_unknown_keys() — [EC-1] Given config { databasees: { conv: {...} } }, When parsed, Then result.success === true AND result.data.databases === undefined (documents default Zod strip-unknown behavior; concept doc T4.1 warns users to use exact key names)
RED:     dangling_server_reference_only_throws_on_use() — [EC-2] Given configure() with databases.X.server='ghost' + servers={}, Then configure resolves without error AND subsequent usePostgres('X', f) throws 'Server "ghost" referenced by database "X" not found' (cross-field validation is intentionally deferred to use-time, not boot-time)
GREEN:   Add storageSchema + integrate; export StorageConfig type
REFACTOR: None expected
VERIFY:  npx vitest run tests/unit/config-storage-schema.test.ts
```

BDD scenarios:
- **Happy path**: full valid config parses.
- **Validation error**: invalid port returns ZodError with field path.
- **Edge case**: empty object `{}` is valid (all sections optional); unknown keys silently dropped (EC-1 documented behavior).
- **Error scenario**: negative pool.min rejected; dangling server reference deferred to `usePostgres()` (EC-2).

#### Acceptance Criteria
- [ ] `storageSchema` exported from `config/schema.ts`
- [ ] `StorageConfig` type exported via `z.infer<typeof storageSchema>`
- [ ] Root schema includes `storage: storageSchema.optional()`
- [ ] 7 tests in `tests/unit/config-storage-schema.test.ts` green (5 base + EC-1 + EC-2)
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings

#### DoD
- [ ] Schema + tests green
- [ ] `loadConfig()` exposes `config.storage?: StorageConfig` typed
- [ ] Dep-cruiser clean

---

### T1.2 — Implement `StorageManager` class

#### Objective
Implementar a classe core conforme §9.3 do reference doc — singleton, cache de pools, register/dispose lifecycle.

#### Evidence
- Reference doc §9.3 (628-758) — código exato.
- Reference doc §4 #1, #2 (lines 405-420) — convergent patterns (lazy singleton, server-vs-db separation).
- Encore `manager_internal.go:96-115` — DCL pattern adaptado para TS single-threaded (sem mutex; JS event loop garante atomicidade do `Map.set`).

#### Files to edit
```
packages/theo/src/server/storage/storage-manager.ts — NEW: StorageManager class + getStorageManager singleton
packages/theo/src/server/storage/index.ts — NEW: barrel re-exporting manager + types
tests/unit/storage-manager.test.ts — NEW: 8-10 cenários (TDD)
```

#### Deep file dependency analysis
- `storage-manager.ts` (NEW): depende de `storage-types.ts` (T0.2). Sem outras deps internas.
- `storage/index.ts` (NEW): re-exporta `getStorageManager`, `StorageManager`, `StorageConfig`, `StorageAdapter`, `PoolLike`.
- `tests/unit/storage-manager.test.ts` (NEW): valida toda a API.
- **Downstream futuro:** `server/index.ts` adiciona re-exports (T1.3).

#### Deep Dives

**Data structures:**
- `#dbPools: Map<string, PoolLike>` — chave = `dbName`.
- `#redisClients: Map<string, RedisLike>` — chave = `serverName`.
- `#adapters: Set<StorageAdapter>` — drain queue.
- `#disposed: boolean` — flag idempotency.

**`StorageAdapter` interface (§9.3 reference):**
```ts
export interface StorageAdapter {
  readonly name: string
  dispose(): Promise<void>
}
```

**`RedisLike` (structural):**
```ts
interface RedisLike {
  quit(): Promise<unknown>
  disconnect(): void
}
```

**`usePostgres` algorithm (matches §9.3):**
1. If disposed → throw `'StorageManager is disposed'`.
2. Cache hit → return cached pool.
3. Lookup `config.databases[dbName]` — undefined throws `'Database "X" not configured'`.
4. Lookup `config.servers[dbConfig.server]` — undefined throws `'Server "Y" referenced by database "X" not found'`.
5. Invoke `factory(server, dbConfig)` → store + return.

**`dispose` algorithm:**
1. If already disposed → noop (idempotent).
2. Set `#disposed = true`.
3. `Promise.all(adapters.map(a => a.dispose().catch(log)))`.
4. `Promise.all(pools.map(p => p.end?.().catch(log)))`.
5. `Promise.all(redis.map(c => c.quit().catch(() => c.disconnect())))`.
6. Clear all collections.

**Invariants:**
- Singleton stable across multiple `getStorageManager()` calls.
- `configure()` after first call → warn, no-op (D3).
- `usePostgres` caches per-dbName; concurrent first-call serialized by JS event loop (single-threaded; no actual race in Node).
- `dispose()` errors NEVER throw to caller.

**Edge cases:**
- `useRedis('default', f)` with `config.redis.default === undefined` → throw `'Redis server "default" not configured'`.
- Factory throws inside `usePostgres` → propagated to caller; pool NOT cached (so retry possible).
- `register(adapter)` with same name twice → second call adds another Set entry (intentional — adapters can have same name if user makes mistake; both still drained).
- `register(adapter)` AFTER `dispose()` → throws `'StorageManager is disposed'` (EC-4: mirrors `usePostgres` behavior; prevents silent adapter leak in test seam scenarios).
- Factory returns a pool without `.end()` method → `dispose()` silently skips it via `if (p.end !== undefined)` guard (EC-5: TS already enforces `PoolLike` shape; this is the graceful fallback if user bypasses via `as`).
- `dispose()` called twice concurrently → first call wins, second call returns immediately (idempotent via `#disposed` flag).

#### Tasks
1. Criar `packages/theo/src/server/storage/storage-manager.ts` com a class + singleton conforme §9.3 do reference doc.
2. Criar `packages/theo/src/server/storage/index.ts` barrel.
3. Estender `storage-types.ts` (T0.2) com `StorageAdapter` interface + tipos da config (re-uso do `StorageConfig` do schema T1.1, mas declarar shape internamente também).
4. Adicionar guarda `if (this.#disposed) throw new Error('StorageManager is disposed')` no início de `register()` (EC-4 fix — 2 LOC).
5. Criar `tests/unit/storage-manager.test.ts` com os 14 cenários (12 base + EC-4 + EC-5).
6. Adicionar `beforeEach(() => { __resetForTests(); })` no setup do test file (EC-3 — isolamento entre `it` blocks).
7. Garantir `__resetForTests()` exposed (D1 consequence — test isolation).

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     storageManager_singleton_stable() — Given getStorageManager() called twice, Then same instance (happy path)
RED:     usePostgres_caches_on_second_call() — Given configure({ databases: { conv: ... } }), When usePostgres('conv', factory) called twice, Then factory invoked 1x (happy path)
RED:     usePostgres_throws_for_unknown_db() — Given no databases.foo, When usePostgres('foo', factory), Then throws 'Database "foo" not configured' (validation error)
RED:     usePostgres_throws_for_unknown_server() — Given databases.conv.server='ghost' but servers.ghost undefined, When usePostgres('conv', factory), Then throws (validation error)
RED:     configure_warns_on_second_call() — Given configure(c1) then configure(c2), Then console.warn called + c2 ignored (edge case)
RED:     usePostgres_throws_after_dispose() — Given dispose() called, When usePostgres(...), Then throws 'StorageManager is disposed' (edge case)
RED:     useRedis_caches_per_server() — Given configure({ redis: { cache: ... } }), When useRedis('cache', factory) twice, Then factory 1x (happy path)
RED:     dispose_drains_adapters_pools_redis() — Given registered adapter + pool + redis, When dispose(), Then all dispose() / end() / quit() called (happy path)
RED:     dispose_is_idempotent() — Given dispose() called twice, Then second call no-op (edge case)
RED:     dispose_swallows_adapter_errors() — Given adapter.dispose() throws, When manager.dispose(), Then resolves without rethrow + warn logged (error scenario)
RED:     dispose_falls_back_to_disconnect_when_quit_fails() — Given redis.quit() rejects, Then redis.disconnect() called (error scenario)
RED:     __resetForTests_clears_state() — Given configured + pools cached, When __resetForTests(), Then config undefined + pools empty (test seam)
RED:     register_after_dispose_throws() — [EC-4] Given manager.dispose() called, When manager.register({ name, dispose }), Then throws 'StorageManager is disposed' (mirroring usePostgres behavior; prevents silent adapter leak in test scenarios that reset+reuse the manager)
RED:     dispose_skips_pool_without_end() — [EC-5] Given factory returns { query } without .end method, When manager.dispose(), Then resolves without throw (pool silently skipped — TS already enforces shape at factory signature; this confirms graceful runtime behavior if user bypasses via `as` cast)
GREEN:   Implement StorageManager class + getStorageManager singleton; add `if (this.#disposed) throw` guard at the top of register() per EC-4
REFACTOR: Extract drain-helpers if dispose() exceeds 30 LOC
VERIFY:  npx vitest run tests/unit/storage-manager.test.ts
```

BDD scenarios:
- **Happy path**: configure → usePostgres → cached singleton.
- **Validation error**: usePostgres with unknown db throws with actionable message; register-after-dispose throws (EC-4).
- **Edge case**: concurrent dispose(), idempotency, configure-twice warn; pool without `.end()` skipped (EC-5).
- **Error scenario**: adapter throws in dispose() doesn't block; Redis quit failure falls back.

#### Test setup (EC-3)
- [EC-3] Test file MUST have `beforeEach(() => { __resetForTests(); })` at the top so the module-scoped singleton state doesn't pollute between `it` blocks within `storage-manager.test.ts`.

#### Acceptance Criteria
- [ ] `StorageManager` class exported from `server/storage/storage-manager.ts`
- [ ] `getStorageManager()` returns stable singleton
- [ ] `configure()` honored once; second call warns
- [ ] `usePostgres()` + `useRedis()` cache + lookup correctly
- [ ] `dispose()` drains in parallel + idempotent + error-safe
- [ ] `register()` throws when called after `dispose()` (EC-4)
- [ ] `dispose()` gracefully skips pools without `.end()` method (EC-5)
- [ ] `__resetForTests()` available + `beforeEach` reset wired in test file (EC-3)
- [ ] 14 tests in `tests/unit/storage-manager.test.ts` green (12 base + EC-4 + EC-5)
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings
- [ ] `pnpm check:deps` 0 violations

#### DoD
- [ ] Class + singleton + barrel complete
- [ ] All unit tests green
- [ ] Type tests via expectTypeOf assert API surface stability
- [ ] Dep-cruiser clean (storage/ is leaf within server/)

---

### T1.3 — Expose `StorageManager` from `theokit/server` barrel

#### Objective
Tornar `getStorageManager`, `StorageManager`, `StorageAdapter`, `StorageConfig`, `PoolLike` consumíveis via `import { ... } from 'theokit/server'`.

#### Evidence
- Padrão de barrel já estabelecido: `createConversationHistory`, `createRateLimiter`, etc. todos re-exportados em `server/index.ts`.
- Sem o re-export, user code precisaria importar de `theokit/server/storage/storage-manager.js` — path interno, frágil.

#### Files to edit
```
packages/theo/src/server/index.ts — EDIT: add re-exports from ./storage/index.js
```

#### Deep file dependency analysis
- `server/index.ts`: barrel da public API. Adiciona linhas de export. Sem nova dep.
- **Downstream:** `tests/smoke/import-validation.test.ts` (verifica que exports estão disponíveis), userland `chat.ts`, fixture.

#### Deep Dives
Re-exports a adicionar:
```ts
export {
  getStorageManager,
  StorageManager,
} from './storage/storage-manager.js'
export type {
  StorageConfig,
  StorageAdapter,
  PoolLike,
  // tipos auxiliares: ServerConfig, PostgresDatabaseConfig, RedisServerConfig, TlsConfig
} from './storage/storage-types.js'
```

Verificar se algum dos nomes já está exportado em outro contexto (provavelmente não — busca acima retornou zero).

#### Tasks
1. Editar `packages/theo/src/server/index.ts` — adicionar bloco de re-exports na seção apropriada (próximo a outras storage primitives).
2. Atualizar `tests/smoke/import-validation.test.ts` (se existe e cobre import-by-name) para verificar os novos nomes.
3. Rodar `pnpm exec publint packages/theo` para confirmar barrel sane.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     storage_exports_present_in_barrel() — Given import * as theo from 'theokit/server', Then theo.getStorageManager + theo.StorageManager defined (happy path)
RED:     storage_types_importable() — Given user TS: type C = StorageConfig from 'theokit/server', Then compiles (type test)
RED:     pool_like_still_importable() — Given import { type PoolLike } from 'theokit/server', Then still resolves (edge case: BC preserved)
RED:     unknown_symbol_not_exported() — Given import { foobar } from 'theokit/server', Then TS error (error scenario: typo doesn't accidentally compile)
GREEN:   Add re-exports
REFACTOR: None
VERIFY:  npx vitest run tests/smoke/import-validation.test.ts && pnpm exec publint packages/theo
```

BDD scenarios:
- **Happy path**: named imports resolve.
- **Validation error**: type-only imports work (`type StorageConfig`).
- **Edge case**: previously-exported `PoolLike` still resolves.
- **Error scenario**: nonexistent symbol fails TS.

#### Acceptance Criteria
- [ ] `getStorageManager`, `StorageManager` exported as values
- [ ] `StorageConfig`, `StorageAdapter`, `PoolLike` exported as types
- [ ] Smoke test passes
- [ ] `pnpm exec publint packages/theo` "All good!"
- [ ] `pnpm exec @arethetypeswrong/cli --pack packages/theo` all 🟢

#### DoD
- [ ] Barrel updated
- [ ] Smoke + publint + attw clean
- [ ] `pnpm --filter theokit build` green (DTS clean)

---

## Phase 2: Adapter integration

**Objective:** Refatorar `PostgresConversationStorage` + `PostgresJobBackend` para receber pool do manager. BC preservada.

### T2.1 — Refactor `PostgresJobBackend` to accept pool from manager

#### Objective
Permitir que `PostgresJobBackend` seja construído a partir do `StorageManager` em vez de pool externo, mantendo BC.

#### Evidence
- `packages/theo/src/server/jobs/job-backend-postgres.ts:54-65` — construtor recebe `{ pool: PoolLike }` direto.
- Reference doc §9.6 Phase 2 (lines 807-812) — recipe.
- Roadmap macro `JobBackend` foi ADR-0002 — manager é evolução natural.

#### Files to edit
```
packages/theo/src/server/jobs/job-backend-postgres.ts — EDIT: add overload `fromStorageManager(manager, dbName)`
tests/integration/postgres-job-backend-via-storage-manager.test.ts — NEW: integration test
```

#### Deep file dependency analysis
- `job-backend-postgres.ts`:
  - **Today:** `new PostgresJobBackend({ pool })`.
  - **After:** mesmo construtor + helper `static fromStorageManager(manager: StorageManager, dbName: string, factory: PoolFactory): PostgresJobBackend`.
  - **Downstream:** `tests/integration/postgres-job-backend.test.ts` (verifica BC do construtor original — não muda), `tests/integration/postgres-job-backend-via-storage-manager.test.ts` (NEW), fixtures usando.
- Nova rota de criação: `PostgresJobBackend.fromStorageManager(manager, 'jobs', pgFactory)`.

#### Deep Dives

**API:**
```ts
import type { StorageManager } from '../storage/storage-manager.js'
import type { ServerConfig, PostgresDatabaseConfig } from '../storage/storage-types.js'

type PgPoolFactory = (server: ServerConfig, db: PostgresDatabaseConfig) => PoolLike

export class PostgresJobBackend implements JobBackend {
  // ... existing
  static fromStorageManager(
    manager: StorageManager,
    dbName: string,
    factory: PgPoolFactory,
    options?: Omit<PostgresJobBackendOptions, 'pool'>,
  ): PostgresJobBackend {
    const pool = manager.usePostgres(dbName, factory)
    return new PostgresJobBackend({ pool, ...options })
  }
}
```

**Invariants:**
- Original construtor `new PostgresJobBackend({ pool })` continua funcionando (BC).
- `fromStorageManager` é açúcar — não muda a class interna.
- Pool é cached pelo manager; mesmo `dbName` retorna o mesmo pool em chamadas futuras.

**Edge cases:**
- User chama `fromStorageManager` sem configure() prévio → manager throws (matches T1.2 spec).
- User chama com `dbName` inexistente → manager throws com mensagem acionável.

#### Tasks
1. Adicionar static `fromStorageManager` a `PostgresJobBackend`.
2. Importar `StorageManager`, `ServerConfig`, `PostgresDatabaseConfig` types.
3. Criar `tests/integration/postgres-job-backend-via-storage-manager.test.ts` cobrendo os 4 BDD scenarios com pg-mem.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     fromStorageManager_creates_backend() — Given configured manager + dbName 'jobs', When fromStorageManager called, Then PostgresJobBackend instance returned with cached pool (happy path)
RED:     fromStorageManager_reuses_pool_across_calls() — Given manager + factory.callCount=0, When fromStorageManager called twice with same dbName, Then factory.callCount=1 (happy path: caching)
RED:     fromStorageManager_throws_for_unknown_db() — Given manager without 'jobs' database, When fromStorageManager(manager, 'jobs', f), Then throws 'Database "jobs" not configured' (validation error)
RED:     original_constructor_still_works() — Given new PostgresJobBackend({ pool }), Then instance works (edge case: BC)
RED:     fromStorageManager_throws_after_dispose() — Given manager.dispose() called, When fromStorageManager(...), Then throws (error scenario)
GREEN:   Add static factory; implement
REFACTOR: None
VERIFY:  npx vitest run tests/integration/postgres-job-backend-via-storage-manager.test.ts
```

BDD scenarios:
- **Happy path**: backend created via factory with cached pool.
- **Validation error**: unknown db name throws actionable error.
- **Edge case**: original constructor BC.
- **Error scenario**: factory called after dispose throws.

#### Acceptance Criteria
- [ ] `PostgresJobBackend.fromStorageManager` static method exists
- [ ] BC: `new PostgresJobBackend({ pool })` still works (existing tests green)
- [ ] 5 tests in `tests/integration/postgres-job-backend-via-storage-manager.test.ts` green
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings
- [ ] No dep-cruiser violations (jobs → storage is allowed; both under server/)

#### DoD
- [ ] Helper added + tests green
- [ ] Original tests in `postgres-job-backend.test.ts` still green
- [ ] Dep-cruiser clean

---

### T2.2 — Fixture: `PostgresConversationStorage` adapter via manager

#### Objective
Provar end-to-end que `PostgresConversationStorage` (fixture-level recipe) consome `StorageManager`.

#### Evidence
- `tests/fixtures/conversation-postgres/storage.ts:30-31` — hoje recebe `pool` direto.
- Reference doc §9.6 Phase 2 — recipe deve mostrar manager-based wiring.

#### Files to edit
```
tests/fixtures/conversation-postgres/storage.ts — EDIT (opcional): adicionar helper static `fromStorageManager`
tests/fixtures/storage-manager-recipe/ — NEW: dedicated fixture proving the manager wire
tests/fixtures/storage-manager-recipe/theo.config.ts — NEW: full storage block
tests/fixtures/storage-manager-recipe/server/lib/storage.ts — NEW: factory functions
tests/fixtures/storage-manager-recipe/server/lib/storage-init.ts — NEW: manager.configure() + register
tests/integration/storage-manager-fixture.test.ts — NEW: boot the fixture + assert manager wiring works
```

#### Deep file dependency analysis
- Fixture `storage-manager-recipe/` é novo dir auto-contido.
  - `theo.config.ts` declara `storage: { servers, databases, redis }`.
  - `server/lib/storage.ts` exporta `pgPoolFactory`, `redisFactory` (uses dynamic import to avoid hard-dep at fixture load time).
  - `server/lib/storage-init.ts` configura o manager + registra adapters.
- `tests/integration/storage-manager-fixture.test.ts`: imports the fixture, calls `storage-init`, verifies `getStorageManager()` is configured + adapters registered.

#### Deep Dives

**Fixture `theo.config.ts`:**
```ts
import { defineConfig } from 'theokit'

export default defineConfig({
  storage: {
    servers: {
      primary: {
        host: process.env.PG_HOST ?? 'localhost',
        port: 5432,
        user: 'theo',
        password: process.env.PG_PASSWORD ?? '',
      },
    },
    databases: {
      conversations: { server: 'primary', database: 'theo_conv' },
      jobs: { server: 'primary', database: 'theo_jobs' },
    },
    redis: {
      cache: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: 6379,
        user: 'default',
        password: process.env.REDIS_PASSWORD ?? '',
      },
    },
  },
})
```

**Fixture `server/lib/storage.ts`:**
```ts
import type { ServerConfig, PostgresDatabaseConfig, PoolLike } from 'theokit/server'

export const pgPoolFactory = (server: ServerConfig, db: PostgresDatabaseConfig): PoolLike => {
  // Lazy import — fixture only requires pg when actually used
  const { Pool } = require('pg')
  return new Pool({
    host: server.host,
    port: server.port,
    user: server.user,
    password: server.password,
    database: db.database,
    min: db.pool?.min ?? 1,
    max: db.pool?.max ?? 10,
    connectionTimeoutMillis: db.pool?.connectionTimeoutMillis ?? 5000,
    idleTimeoutMillis: db.pool?.idleTimeoutMillis ?? 30000,
  }) as unknown as PoolLike
}
```

**Fixture `server/lib/storage-init.ts`:**
```ts
import { getStorageManager } from 'theokit/server'
import { loadConfig } from 'theokit/server'  // or however config is loaded
import { pgPoolFactory } from './storage.js'

export function initStorage(config: { storage?: unknown }): void {
  const manager = getStorageManager()
  if (config.storage !== undefined) {
    manager.configure(config.storage as never)
  }
}
```

**Edge cases:**
- pg-mem swap: fixture tests use pg-mem; the factory is parameterized so prod uses real pg and tests use pg-mem.
- Multi-database: 2+ databases share the same server → manager creates separate pools.

#### Tasks
1. Criar dir `tests/fixtures/storage-manager-recipe/` com arquivos acima.
2. Criar `tests/integration/storage-manager-fixture.test.ts` que importa o fixture + valida boot.
3. Adicionar `tests/fixtures/storage-manager-recipe/README.md` curto explicando como rodar.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     fixture_boots_with_storage_config() — Given fixture/theo.config.ts + initStorage(), When getStorageManager() inspected, Then config applied (happy path)
RED:     fixture_reuses_same_pool_for_2_databases_same_server() — Given 2 dbs sharing 'primary', When usePostgres('conversations', f) + usePostgres('jobs', f), Then factory called 2x (one per db, not per server) (edge case)
RED:     fixture_throws_when_initStorage_called_twice() — Given initStorage(c1), When initStorage(c2), Then warn logged + c2 ignored (validation error per D3)
RED:     fixture_dispose_drains_all() — Given fixture booted + adapters registered, When manager.dispose(), Then all adapters disposed (error/lifecycle scenario)
GREEN:   Create fixture files + integration test
REFACTOR: Consolidate helper code if redundant
VERIFY:  npx vitest run tests/integration/storage-manager-fixture.test.ts
```

BDD scenarios:
- **Happy path**: fixture boots, manager configured, factories invoked.
- **Validation error**: double `initStorage` ignored (configure-once enforced).
- **Edge case**: shared server, separate dbs → separate pools.
- **Error scenario**: dispose drains everything cleanly.

#### Acceptance Criteria
- [ ] Fixture dir created with theo.config.ts, server/lib/storage.ts, server/lib/storage-init.ts, README.md
- [ ] `tests/integration/storage-manager-fixture.test.ts` green (4+ scenarios)
- [ ] Fixture uses pg-mem (no real PG required)
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings

#### DoD
- [ ] Fixture + integration test green
- [ ] No flakes (deterministic)
- [ ] README explains usage

---

### T2.3 — `InMemoryUsageStorage` registers as `StorageAdapter` (optional drain hook)

#### Objective
Demonstrar que adapters in-memory também participam do shutdown via `manager.register()`.

#### Evidence
- `packages/theo/src/server/cost/usage-storage-memory.ts` — hoje não tem dispose hook.
- D6 — adapters declaram `dispose()` para participar do drain.
- Real-world value: flush stats antes do exit (mesmo in-memory, user pode querer log final).

#### Files to edit
```
packages/theo/src/server/cost/usage-storage-memory.ts — EDIT: implement StorageAdapter (name + dispose)
tests/unit/usage-storage-memory-dispose.test.ts — NEW: verify dispose hook (or extend existing)
```

#### Deep file dependency analysis
- `usage-storage-memory.ts`:
  - **Today:** class `InMemoryUsageStorage implements UsageStorageAdapter` (record/getUsage).
  - **After:** also implements `StorageAdapter` (name='in-memory-usage', dispose=async noop or logger flush).
  - **Downstream:** `track-agent-run.ts`, fixture tests.
- New test file or extension of existing usage-storage test.

#### Deep Dives

**Implementation:**
```ts
import type { StorageAdapter } from '../storage/storage-types.js'

export class InMemoryUsageStorage implements UsageStorageAdapter, StorageAdapter {
  readonly name = 'in-memory-usage'
  // ... existing fields
  async dispose(): Promise<void> {
    // Optional: log final stats; no real cleanup needed
    return Promise.resolve()
  }
}
```

**Invariants:**
- `dispose()` is async and idempotent (calling twice is safe).
- Does NOT clear stats (could be useful to dump them); just yields back to manager.

**Edge cases:**
- User forgets `manager.register(usageStorage)` → adapter still works for record/getUsage; just doesn't participate in drain. Documented in concept doc.

#### Tasks
1. Adicionar `implements StorageAdapter` + `name` + `dispose()` em `InMemoryUsageStorage`.
2. Atualizar/adicionar teste verificando o hook.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     in_memory_usage_implements_storage_adapter() — Given InMemoryUsageStorage instance, When typed as StorageAdapter, Then assignable (type test; happy path)
RED:     in_memory_usage_satisfies_intersection_of_both_interfaces() — [EC-6] Given the class, When expectTypeOf<InMemoryUsageStorage>().toExtend<UsageStorageAdapter & StorageAdapter>(), Then passes — catches any future `name` collision between the two interfaces
RED:     dispose_resolves_without_throw() — Given instance, When dispose() awaited, Then resolves (happy path)
RED:     dispose_after_record_doesnt_clear_stats() — Given record() called then dispose(), When getUsage() called, Then data still present (edge case: dispose ≠ clear)
RED:     register_with_manager_then_drain() — Given manager.register(usage) + manager.dispose(), Then usage.dispose() called (integration scenario; error scenario covered: dispose throw doesn't block)
GREEN:   Add name + dispose() method
REFACTOR: None
VERIFY:  npx vitest run tests/unit/usage-storage-memory*.test.ts
```

BDD scenarios:
- **Happy path**: dispose() resolves.
- **Validation error**: type assertion catches missing `name` if regressed.
- **Edge case**: dispose() does NOT clear stats.
- **Error scenario**: manager drain still completes if usage.dispose throws (covered by T1.2 dispose_swallows_adapter_errors).

#### Acceptance Criteria
- [ ] `InMemoryUsageStorage` implements `StorageAdapter` (compile-time)
- [ ] `dispose()` returns `Promise<void>` and is idempotent
- [ ] 4+ tests cover happy/edge/error scenarios
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings

#### DoD
- [ ] Implementation + tests green
- [ ] Concept doc (T4.1) lists this adapter as an example

---

## Phase 3: start.ts SIGTERM wiring

**Objective:** Manager.dispose() chamado após Agent.registry.evictAll() no graceful shutdown.

### T3.1 — Wire `StorageManager` into `start.ts` SIGTERM handler

#### Objective
Estender o handler em `start.ts:418-447` para configurar o manager no boot e drená-lo no shutdown.

#### Evidence
- `packages/theo/src/cli/commands/start.ts:92-93` — `configureAgentRegistryFromConfig` já existe; padrão a seguir.
- `start.ts:425-446` — bloco de shutdown atual chama só `Agent.registry.evictAll()`.
- Reference doc §9.6 Phase 3 (813-822).
- D5 — drain em paralelo, sem esperar in-flight.

#### Files to edit
```
packages/theo/src/cli/commands/start.ts — EDIT: configure manager at boot + dispose in SIGTERM
packages/theo/src/cli/commands/dev.ts — EDIT (se aplicável): mesmo wiring para dev consistency
tests/integration/start-storage-manager-shutdown.test.ts — NEW: verifica boot config + dispose order
```

#### Deep file dependency analysis
- `start.ts`:
  - **Today:** boot ~line 90 chama `configureAgentRegistryFromConfig`. SIGTERM ~425 chama `evictAll`.
  - **After:**
    - Boot: adiciona `await configureStorageManagerFromConfig(config.storage)` após agent.registry.
    - SIGTERM: adiciona `await getStorageManager().dispose()` após `evictAll()`.
  - **Downstream:** `tests/integration/start-*.test.ts`, real prod deploys.
- `dev.ts`: optional — em dev, manager wiring é menos crítico (Vite hot-reload), mas consistência ajuda.

#### Deep Dives

**Boot helper:**
```ts
// in start.ts, near configureAgentRegistryFromConfig
import { getStorageManager } from '../../server/storage/storage-manager.js'

function configureStorageManagerFromConfig(
  storageConfig: { servers?: unknown; databases?: unknown; redis?: unknown } | undefined,
): void {
  if (storageConfig === undefined) return
  const manager = getStorageManager()
  try {
    manager.configure(storageConfig as never)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[theokit] StorageManager configuration skipped: ${msg}`)
  }
}
```

**SIGTERM extension:**
```ts
// in gracefulShutdown
void (async () => {
  // ... existing agent eviction
  try {
    const manager = getStorageManager()
    await manager.dispose()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`  [theokit] storage dispose error (proceeding to exit): ${msg}`)
  }
  // ... existing server.close + setTimeout
})()
```

**Invariants:**
- Order: agents evicted FIRST (they may still have queries in flight), storage drained SECOND (queries finished, safe to close pools).
- 25s force-exit timeout still applies — covers both eviction + drain.
- Errors in either step are logged but DO NOT prevent shutdown.

**Edge cases:**
- `config.storage === undefined` → manager not configured → dispose() is still safe (no-op for unconfigured manager).
- Manager already disposed (rare, but possible if test seam ran) → idempotent.
- Storage dispose hangs > 25s → force exit kills it.

#### Tasks
1. Adicionar `configureStorageManagerFromConfig` helper module-level em `start.ts`.
2. Chamar após `configureAgentRegistryFromConfig` no boot.
3. Adicionar `await manager.dispose()` no `gracefulShutdown`, após `evictAll()`.
4. Replicar (opcional) em `dev.ts` se a paridade importa para o caso de uso dev → real Postgres.
5. Criar `tests/integration/start-storage-manager-shutdown.test.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     start_configures_manager_when_config_present() — Given theo.config.ts with storage block, When start() boots, Then getStorageManager() reports configured (happy path)
RED:     start_skips_manager_when_config_absent() — Given theo.config.ts without storage, When start() boots, Then manager exists but unconfigured (edge case: optional config)
RED:     sigterm_drains_storage_after_agents() — Given SIGTERM fires, When handler runs, Then evictAll() called BEFORE manager.dispose() (happy path: order matters)
RED:     storage_dispose_error_logged_not_thrown() — Given manager.dispose() throws, When SIGTERM, Then shutdown proceeds + warn logged (error scenario)
RED:     storage_dispose_completes_within_25s_grace() — Given mock manager with fast dispose, Then process.exit(0) called before timeout (edge case: timing)
GREEN:   Add helper + SIGTERM hook
REFACTOR: Extract drain sequence to single async function if start.ts SIGTERM block exceeds 60 LOC
VERIFY:  npx vitest run tests/integration/start-storage-manager-shutdown.test.ts
```

BDD scenarios:
- **Happy path**: SIGTERM triggers both eviction + drain in order.
- **Validation error**: missing config doesn't break boot.
- **Edge case**: order of eviction → drain is enforced.
- **Error scenario**: drain throws → logged + shutdown proceeds.

#### Acceptance Criteria
- [ ] `configureStorageManagerFromConfig` helper exists in `start.ts`
- [ ] Boot calls it after `configureAgentRegistryFromConfig`
- [ ] SIGTERM calls `manager.dispose()` after `evictAll()`
- [ ] Errors logged, not thrown
- [ ] 5 tests in `start-storage-manager-shutdown.test.ts` green
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings
- [ ] Existing `start.ts` tests still green (BC)

#### DoD
- [ ] Boot + shutdown wiring complete
- [ ] Tests green
- [ ] Manual smoke: scaffold an app, send SIGTERM, observe log lines

---

## Phase 4: Concept doc + fixture proof

**Objective:** Documentar o padrão + deixar fixture canônica visível para users.

### T4.1 — Write `docs/concepts/storage-manager.md`

#### Objective
Documento conceitual que explica `StorageManager`, mostra exemplos, e provê deploy-target matrix.

#### Evidence
- Padrão de concept docs estabelecido: `docs/concepts/conversation-history.md`, `caching.md`, `cost-tracking.md`, `jobs.md`.
- Reference doc §9.6 Phase 4 (824-827) — mirroring conversation-history doc.

#### Files to edit
```
docs/concepts/storage-manager.md — NEW
```

#### Deep file dependency analysis
- New file, no code deps.
- Cross-links: ADR-0007 (T0.1), ADR-0002 (JobBackend), reference doc, `docs/concepts/jobs.md`, `docs/concepts/conversation-history.md`, `docs/concepts/cost-tracking.md`.

#### Deep Dives

**Sections (mirroring conversation-history.md):**
1. **What & Why** — pluggable storage primer.
2. **API Surface** — `getStorageManager`, `configure`, `usePostgres`, `useRedis`, `register`, `dispose`.
3. **Config schema** — `theo.config.ts > storage` example.
4. **Deploy-target matrix:**
   | Target | servers | databases | redis | dispose |
   |---|---|---|---|---|
   | Node self-host | manual | manual | manual | manual SIGTERM trap |
   | TheoCloud | provided by platform | provided | provided | manager.dispose() in start.ts |
   | Vercel | per-region (Postgres serverless) | per-region | per-region | per-invocation |
   | Cloudflare Workers | KV/D1 instead | KV/D1 | KV instead | no SIGTERM |
   | K8s self-host | K8s Secret refs | K8s Secret refs | K8s Secret refs | SIGTERM + preStop hook |
5. **Cookbook:**
   - `PostgresJobBackend.fromStorageManager(...)`
   - `PostgresConversationStorage` via manager
   - `InMemoryUsageStorage` registered for drain
6. **Edge cases & gotchas:**
   - configure-once D3 → can't reconfigure.
   - Factory pattern D2 → user installs `pg`/`ioredis`.
   - Drain in parallel D5 → in-flight queries aborted (LB drained first).
   - **[EC-1] Unknown keys silently dropped** — Zod default mode ignora chaves desconhecidas: `databasees: {...}` é descartado sem erro. Use os nomes exatos: `servers`, `databases`, `redis`.
   - **[EC-7] `manager.dispose()` fora de SIGTERM não tem timeout interno** — em produção, `start.ts` já envolve com force-exit de 25s. Se você chamar `manager.dispose()` em scripts custom ou testes, envolva em `Promise.race([dispose(), timeout(15_000)])` para evitar hang.
   - **[EC-8] Vite HMR em dev pode duplicar o singleton** — ESM imports re-rodam em HMR. Em dev, prefira adapters in-memory; se precisar de PG/Redis em dev, considere persistir o manager via `globalThis.__theoStorageManager` (padrão Next.js para dev DB connections).
   - **[EC-9] SIGKILL pula o drain** — plataformas usam SIGKILL após `terminationGracePeriodSeconds` (K8s default 30s). Por design, processo é morto sem drain. PG/Redis fecham conexões órfãs por idle timeout (~5 min). Se seu deploy tem latência maior, aumente o `terminationGracePeriodSeconds` no manifesto.

#### Tasks
1. Criar `docs/concepts/storage-manager.md` com as 6 seções acima (incluindo as 4 notas EC-1, EC-7, EC-8, EC-9 em "Edge cases & gotchas").
2. Cross-link nos outros concept docs (jobs.md, conversation-history.md, cost-tracking.md) na seção "see also".
3. Adicionar entry no índice de docs (se houver — `docs/index.md` ou similar).

#### TDD + BDD (⛔ OBRIGATÓRIO)

Doc é prosa, mas estrutura tem assertions:

```
RED:     storage_manager_doc_exists() — Given the repo, When read 'docs/concepts/storage-manager.md', Then file present + has all 6 required sections (happy path)
RED:     storage_manager_doc_cites_adr_0007() — Given file content, Then 'ADR-0007' referenced (validation error: missing crosslink fails)
RED:     storage_manager_doc_has_deploy_matrix() — Given file content, Then table with 'TheoCloud' + 'Vercel' + 'Cloudflare' rows (edge case)
RED:     storage_manager_doc_references_reference_doc() — Given file content, Then 'pluggable-storage-managed-pg-redis.md' linked (error scenario: stale crosslink)
RED:     storage_manager_doc_documents_runtime_gotchas() — [EC-7/EC-8/EC-9] Given file content, Then grep matches 'SIGKILL', 'HMR', 'force-exit' (or equivalents) — guarantees the 4 runtime gotchas surfaced in the edge-case review survived into the doc
GREEN:   Write the doc with all required sections + crosslinks + gotchas
REFACTOR: None
VERIFY:  npx vitest run tests/unit/concept-doc-storage-manager.test.ts
```

BDD scenarios:
- **Happy path**: doc exists + has all sections.
- **Validation error**: missing ADR crosslink → test fails.
- **Edge case**: deploy matrix has all 5 target rows.
- **Error scenario**: missing reference doc link OR missing gotcha notes → test fails (forces consistency).

#### Acceptance Criteria
- [ ] `docs/concepts/storage-manager.md` exists with 6 sections
- [ ] Cross-links to ADR-0007, ADR-0002, reference doc, other concept docs
- [ ] Deploy-target matrix has 5+ targets
- [ ] Edge cases & gotchas list inclui as 4 notas: EC-1 (unknown keys), EC-7 (dispose timeout), EC-8 (HMR), EC-9 (SIGKILL)
- [ ] Cookbook has 3 worked examples
- [ ] Structural test green

#### DoD
- [ ] Doc complete
- [ ] Cross-links functional
- [ ] Listed in `docs/concepts/` index (if applicable)

---

### T4.2 — Update CHANGELOG `[Unreleased]`

#### Objective
Registrar a feature `StorageManager` no changelog conforme regra de governança.

#### Evidence
- CLAUDE.md global (PARTE I § 6) — "Changelogs — Registro Obrigatório de Mudanças".
- `CHANGELOG.md` existe e tem section `[Unreleased]`.

#### Files to edit
```
CHANGELOG.md — EDIT: add Added entry under [Unreleased]
```

#### Deep file dependency analysis
- `CHANGELOG.md` na raiz.
- Sem deps; pure documentation.

#### Deep Dives
Entrada:
```markdown
### Added
- `StorageManager` singleton — unified lifecycle for pluggable storage adapters (Postgres pools, Redis clients, InMemory adapters). Configure via `theo.config.ts > storage`; SIGTERM drains pools after agent eviction. See `docs/concepts/storage-manager.md`. (ADR-0007)
```

#### Tasks
1. Adicionar entrada `Added` em `CHANGELOG.md` [Unreleased].
2. Reference ADR + concept doc.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     changelog_has_storage_manager_entry() — Given CHANGELOG.md, When grep 'StorageManager' under [Unreleased] / ### Added, Then matches (happy path; MUST fail pre-edit)
RED:     changelog_entry_links_adr() — Given entry, Then references 'ADR-0007' or '0007-storage-manager' (validation error)
RED:     changelog_entry_concise() — Given the line, Then length ≤ 280 chars (edge case: KAC one-line rule)
RED:     changelog_section_order_preserved() — Given CHANGELOG, Then 'Added' precedes 'Changed' (error scenario)
GREEN:   Add entry
REFACTOR: None
VERIFY:  npx vitest run tests/unit/changelog-storage-manager.test.ts
```

BDD scenarios:
- **Happy path**: entry present.
- **Validation error**: missing ADR link fails.
- **Edge case**: KAC ordering preserved.
- **Error scenario**: entry exceeds length budget.

#### Acceptance Criteria
- [ ] CHANGELOG `[Unreleased] > Added` has entry mentioning `StorageManager`
- [ ] Entry references ADR-0007 + concept doc
- [ ] Entry ≤ 280 chars
- [ ] Structural test green

#### DoD
- [ ] Entry committed
- [ ] Test passes

---

## Coverage Matrix

| # | Gap / Requirement (from reference doc §9) | Task(s) | Resolution |
|---|---|---|---|
| 1 | `getStorageManager()` returns singleton | T1.2 | `getStorageManager()` exported with module-scoped `__singleton` cache |
| 2 | `configure()` honored once | T1.2 (D3) | Second-call warn + ignore |
| 3 | `usePostgres()` caches per dbName | T1.2 | `#dbPools: Map<string, PoolLike>` |
| 4 | `useRedis()` caches per server | T1.2 | `#redisClients: Map<string, RedisLike>` |
| 5 | `dispose()` drains in parallel + idempotent + error-safe | T1.2 + T3.1 | `Promise.all` + try/catch + `#disposed` |
| 6 | Zod schema validates storage block | T1.1 | `storageSchema` integrated into root |
| 7 | `start.ts` wires SIGTERM → `dispose()` after eviction | T3.1 | Helper + extended `gracefulShutdown` |
| 8 | `PostgresJobBackend` accepts pool from manager | T2.1 | `fromStorageManager` static |
| 9 | `PostgresConversationStorage` via manager (recipe) | T2.2 | Fixture `storage-manager-recipe/` |
| 10 | `InMemoryUsageStorage` registers as adapter | T2.3 | Implements `StorageAdapter` |
| 11 | Concept doc with deploy-target matrix | T4.1 | `docs/concepts/storage-manager.md` |
| 12 | CHANGELOG entry | T4.2 | `[Unreleased] > Added` |
| 13 | Public API barrel re-exports | T1.3 | `server/index.ts` updated |
| 14 | ADR documenting D1..D7 | T0.1 | `docs/adr/0007-storage-manager-singleton.md` |
| 15 | `PoolLike` deduplicated (single source) | T0.2 | Extracted to `storage-types.ts` |
| 16 | Fixture proves end-to-end wire | T2.2 | `tests/fixtures/storage-manager-recipe/` |
| EC-1 | Zod default strip-unknown silently drops typos | T1.1 + T4.1 | RED test `storageSchema_silently_drops_unknown_keys`; gotcha doc'd |
| EC-2 | Dangling `databases.X.server` only fails at use-time | T1.1 | RED test `dangling_server_reference_only_throws_on_use` |
| EC-3 | Singleton state pollution across `it` blocks | T1.2 | `beforeEach(__resetForTests)` in test file |
| EC-4 | `register()` after `dispose()` silently accepts | T1.2 | 2 LOC guard in `register()` + RED test `register_after_dispose_throws` |
| EC-5 | Pool without `.end()` method silently leaked | T1.2 | RED test `dispose_skips_pool_without_end` confirms graceful skip |
| EC-6 | `name` collision between UsageStorageAdapter + StorageAdapter | T2.3 | Type test using intersection `& StorageAdapter` |
| EC-7 | `manager.dispose()` outside SIGTERM has no internal timeout | T4.1 | Gotcha note: wrap in `Promise.race([dispose(), timeout()])` |
| EC-8 | Vite HMR duplicates singleton in dev | T4.1 | Gotcha note: use `globalThis.__theoStorageManager` pattern |
| EC-9 | SIGKILL skips drain entirely | T4.1 | Gotcha note: tune `terminationGracePeriodSeconds` if needed |

**Coverage: 16/16 functional gaps + 9/9 edge cases = 25/25 (100%)**

## Global Definition of Done

- [ ] All 5 implementation phases completed (Phase 0–4)
- [ ] All RED → GREEN tests passing (~50+ new tests across phases — 45 base + 5 from incorporated EC-1/EC-2/EC-4/EC-5/EC-6)
- [ ] Zero TypeScript errors (`pnpm typecheck` exit 0)
- [ ] Zero ESLint warnings (`pnpm lint --max-warnings=0` exit 0)
- [ ] `pnpm test` exit 0 (≥ 2755 tests green)
- [ ] `pnpm --filter theokit build` exit 0 (DTS clean)
- [ ] `pnpm check:deps` 0 violations
- [ ] `pnpm check:naming` 0 violations
- [ ] `pnpm exec publint packages/theo` "All good!"
- [ ] `pnpm exec @arethetypeswrong/cli --pack packages/theo --ignore-rules cjs-resolves-to-esm no-resolution` all 🟢
- [ ] Backward compatibility preserved (existing `new PostgresJobBackend({ pool })` works)
- [ ] CHANGELOG `[Unreleased]` updated
- [ ] **Dogfood QA Phase 5** — `/dogfood full` ≥ 70/100, zero CRITICAL issues
- [ ] **Fixture proof** — `tests/fixtures/storage-manager-recipe/` boots end-to-end via integration test
- [ ] **Architecture diff** — `/architecture-docs server` re-run after implementation; user confirms diff

### Plan-specific criteria

- [ ] `getStorageManager()` returns stable singleton across `import` boundaries
- [ ] `configure()` ignores second call + warns
- [ ] `usePostgres('db', factory)` invokes factory exactly 1× per dbName under concurrent first-call
- [ ] `useRedis('server', factory)` same caching guarantee
- [ ] `dispose()` is idempotent + adapter errors don't block shutdown
- [ ] `theo.config.ts > storage` Zod schema parses valid + rejects invalid configs (5 unit tests)
- [ ] `start.ts` orders: `Agent.registry.evictAll()` → `getStorageManager().dispose()` → `server.close()`
- [ ] `PostgresJobBackend.fromStorageManager(manager, name, factory)` returns working backend
- [ ] `InMemoryUsageStorage` is assignable to `StorageAdapter`
- [ ] `docs/concepts/storage-manager.md` has 6 sections + 5-row deploy matrix
- [ ] `docs/adr/0007-storage-manager-singleton.md` documents D1..D7
- [ ] **EC-1**: schema silently drops unknown keys (RED test confirms + concept doc warns)
- [ ] **EC-2**: dangling `databases.X.server` only throws at `usePostgres()` (RED test confirms behavior)
- [ ] **EC-3**: `beforeEach(__resetForTests)` wired in storage-manager test file
- [ ] **EC-4**: `register()` throws after `dispose()` (2 LOC guard + RED test)
- [ ] **EC-5**: pool without `.end()` silently skipped in `dispose()` (RED test)
- [ ] **EC-6**: `InMemoryUsageStorage` satisfies intersection `UsageStorageAdapter & StorageAdapter` (type test)
- [ ] **EC-7/EC-8/EC-9**: concept doc T4.1 documents the 3 runtime gotchas (timeout, HMR, SIGKILL)

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER Phases 0–4 are complete. The plan is NOT done until dogfood passes.

**Objective:** Validate that the StorageManager works as a real user would experience: scaffold an app, declare storage config, observe SIGTERM drain.

### Execution

Run `/dogfood full`. Always full. No shortcuts.

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL issues introduced by this plan's changes
- [ ] Zero HIGH issues in commands/features modified by this plan (`start.ts`, config schema, server barrel)
- [ ] `pnpm test` passes including all new storage-related tests
- [ ] Manual smoke: scaffold default template, ensure no regression in startup
- [ ] Manual smoke (recipe path): boot `tests/fixtures/storage-manager-recipe/` + `kill -TERM <pid>` → observe drain logs
- [ ] Any pre-existing issues documented (not caused by this plan)

### If Dogfood Fails

1. Identify which issues are plan-caused vs pre-existing.
2. Fix CRITICAL/HIGH plan-caused issues before declaring complete.
3. Re-run `/dogfood full` to confirm.
4. Pre-existing issues logged but DO NOT block plan completion.

---

## Notes on Skill Process

- **`/architecture-docs server` BEFORE skipped** — the C4 snapshot from `architecture-review-remediation` (2026-05-23) is recent enough; this plan adds a new sub-module `storage/` under `server/` but doesn't change cross-module edges. AFTER snapshot will capture the new component.
- **`/edge-case-plan pluggable-storage-storage-manager`** — invoke immediately after this plan is saved. Likely edge case clusters: T1.2 (concurrency on configure-once + dispose race), T2.1 (BC preservation), T3.1 (SIGTERM order under panic).
- **`/cross-validation pluggable-storage-storage-manager`** — run BEFORE dogfood. Verifies every TDD cycle has a RED test that initially fails + corresponding GREEN implementation.
