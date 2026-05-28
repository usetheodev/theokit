# Plan: Storage Modules SDK & Driver Delegation (`useStorage<T>` + `unstorage` + `db0`)

> **Version 1.0** — Cementa o padrão de extensibilidade de storage/db/messaging no TheoKit em **três camadas claras**: (1) `TheoPlugin` já existente assume oficialmente o papel de plugin SDK do framework (HTTP hooks); (2) `StorageManager` ganha um método genérico `useStorage<T>(name, factory)` que cobre qualquer client (MySQL, Mongo, Turso, libSQL, S3, …) mantendo BC dos métodos `usePostgres`/`useRedis`; (3) drivers de KV e SQL são delegados às libs `unstorage` (UnJS, 20+ drivers KV) e `db0` (UnJS, 6+ drivers SQL) como peer-deps opcionais, evitando inventar um driver ecosystem próprio. Resultado: TheoKit fica plugável sem inflar escopo — exatamente o padrão Nitro/Nuxt já validado — e a comunidade pode plugar qualquer backend sem mudar o framework. Decisão respeita CLAUDE.md R0.6.5 ("plugin ecosystem incubation — needs community demand signal first") porque NÃO adiciona um SDK paralelo de módulos; expõe e formaliza o que já existe + delega o caso novo (drivers de DB/KV) para ecossistemas externos maduros.

## Context

Estado atual (commit `7e07053` + plano `pluggable-storage-storage-manager-plan` completo em 2026-05-26):

1. **TheoKit JÁ tem um plugin SDK** em `packages/theo/src/server/plugin-types.ts:46`:
   ```ts
   export interface TheoPlugin {
     name: string
     register(app: TheoApp): void | Promise<void>
   }
   ```
   Usado por 3 plugins in-tree: `web-shim`, `ws-shim`, `batching`. **Padrão Fastify literal** (`fastify.register(plugin, opts)`). Não está documentado como o SDK oficial — comunidade não sabe que existe.

2. **`StorageManager` (ADR-0007) ships com viés PG/Redis**:
   - `usePostgres(name, factory)` — cache + lookup para Postgres
   - `useRedis(name, factory)` — cache + lookup para Redis
   - `register(adapter)` — drain genérico (qualquer backend)
   - 4 interfaces de domínio plugáveis (`JobBackend`, `ConversationStorageLike`, `UsageStorageAdapter`, `RateLimitStorageAdapter`)
   - **MySQL/Mongo/Turso/libSQL users não têm caching nem lookup tipado** — perdem o feature value do manager.

3. **Pesquisa de prior art** (referencias/, 2026-05-27, salva em §11):
   - Nitro: delega 100% para `unstorage` (KV) + `db0` (SQL) — `useStorage()` retorna `Storage<T>` de unstorage, `useDatabase(name)` retorna `Database` de db0.
   - Nuxt: usa `@nuxt/kit` + `defineNuxtModule({ name, hooks })` para um SDK COMPLETO de módulos (1500+ no ecossistema).
   - Astro: `AstroIntegration = { name, hooks }` — passa em `integrations: []`.
   - Fastify: `fastify.register(plugin, opts)` (~200 plugins community).
   - Encore/Juno: hardcoded resources (sistema fechado).
   - Next.js/Remix/SvelteKit: não tem SDK próprio para storage.

4. **Evidências concretas:**
   - CLAUDE.md R0.6.5: "Plugin ecosystem incubation — bottom-up, needs community demand signal first".
   - ADR-0007 D2 (factory pattern): mandatory para manter `pg`/`ioredis` opcionais.
   - Macro roadmap R0.6.1 (UsageStorageAdapter Redis recipe): bloqueado por falta de driver ecosystem.
   - `unstorage` tem 20+ drivers: Redis, R2, S3, Cloudflare KV, Vercel KV, Upstash, Memcached, FS, Memory, Redis Cluster, …
   - `db0` tem 6+ connectors: PostgreSQL (`pg`, `postgres.js`), MySQL, SQLite (`better-sqlite3`, `bun:sqlite`), libSQL (Turso), Cloudflare D1.
   - Zero requests da comunidade pedindo plugin SDK próprio (CLAUDE.md R0.6.5 condição não atingida).

5. **Não cobrir neste plano** (out of scope explícito):
   - Mensageria/PubSub (BullMQ, NATS, Kafka) — fica para 0.6.x se demanda chegar; por enquanto `register(adapter)` cobre lifecycle.
   - Object Storage (S3/R2) — coberto via `unstorage` drivers; sem helper específico aqui.
   - Vector DB — vendor SDKs diretos; sem helper.
   - Full Nuxt-style `defineTheokitModule` — explicitamente rejeitado (ADR-0008 deste plano).

## Objective

**Done = (a) `TheoPlugin` formalizado como o SDK oficial do TheoKit em docs + signatures; (b) qualquer client de banco/cache plugável via `useStorage<T>` sem caching ad-hoc no userland; (c) `unstorage` adotado como driver delegation para KV (Redis/S3/KV-edge/…); (d) `db0` adotado como driver delegation para SQL (PG/MySQL/SQLite/libSQL/D1); (e) `docs/concepts/storage-manager.md` apresenta as 3 camadas com cookbook por caso de uso; (f) zero impacto em quem usa só PG + Redis hoje (BC total).**

Metas mensuráveis:

1. `TheoPlugin` interface re-exportado em `theokit/server`; `definePlugin()` helper opcional para ergonomia (Nuxt-style auto-completion).
2. `StorageManager.useStorage<T>(name, factory)` exposed; `usePostgres`/`useRedis` reimplementados internamente em cima dele (DRY).
3. `useUnstorage(name, driver?)` helper em `theokit/server` que wrappa `createStorage({ driver })` da lib `unstorage` e registra dispose no manager.
4. `useDatabase(name, connector?)` helper em `theokit/server` que wrappa `createDatabase(connector)` da lib `db0` e registra dispose no manager.
5. `unstorage`, `db0` como **optional peer-deps** — não obrigatório instalar.
6. `theo.config.ts > storage` ganha schema opcional `kv: Record<string, KvConfig>` e `databases[name].connector` (db0 connector ref).
7. Concept doc `docs/concepts/storage-manager.md` atualizado com seção "How to plug your backend" mostrando 3 caminhos (TheoPlugin / custom client + register / unstorage+db0 driver).
8. Cookbook em fixtures: `tests/fixtures/storage-modules-unstorage-redis/` + `tests/fixtures/storage-modules-db0-libsql/`.
9. ADR-0008 (TheoPlugin é o SDK oficial — não inventar paralelo) + ADR-0009 (`unstorage` adoption) + ADR-0010 (`db0` adoption).
10. `pnpm test` ≥ 2850 tests, typecheck + lint + dep-cruiser + publint + attw todos clean.

## ADRs

### D1 — `TheoPlugin` (não inventar `defineTheokitModule`)
- **Decisão:** `TheoPlugin { name, register(app) }` continua sendo o ÚNICO plugin SDK do TheoKit. Adicionamos um `definePlugin()` helper (identity function com inferência) para auto-complete, mas a interface não muda.
- **Rationale:** Construir um SDK paralelo (`defineTheokitModule` Nuxt-style) inflaria a superfície sem evidência. CLAUDE.md R0.6.5 explicitamente bloqueia: "needs community demand signal first". Fastify cresceu 200+ plugins com um pattern mínimo igual; não precisamos do scaffolding do `@nuxt/kit`.
- **Consequences:** ✅ Superfície mínima. ✅ Bottom-up extension. ⚠️ Plugins não têm Zod schema validation built-in — cada plugin valida sua config sozinho (igual Fastify).

### D2 — Delegar KV drivers a `unstorage`, NÃO inventar driver registry
- **Decisão:** Para KV storage (cache, sessions, rate-limit state), TheoKit oferece `useUnstorage(name, driver)` que retorna uma instância `Storage<T>` de `unstorage`. TheoKit NÃO mantém drivers próprios para Redis/S3/KV/etc.
- **Rationale:** `unstorage` já tem 20+ drivers ativos (UnJS, mesma org do Nitro/Nuxt). Manter um catálogo paralelo seria reinventar a roda (Princípio 9 do CLAUDE.md global). Comunidade que precisa de driver custom contribui pro `unstorage`, não pro TheoKit.
- **Consequences:** ✅ Zero manutenção de drivers. ✅ Acesso imediato a 20+ drivers production-ready. ⚠️ Soma uma peer-dep opcional. ⚠️ API do retorno é `unstorage`-shaped (`getItem`, `setItem`, `removeItem`, `keys`, …), não a interface TheoKit interna — userland precisa entender unstorage.

### D3 — Delegar SQL drivers a `db0`, NÃO substituir `usePostgres`
- **Decisão:** Para SQL não-Postgres (MySQL, SQLite, libSQL/Turso, D1), TheoKit oferece `useDatabase(name, connector)` que retorna uma instância `Database` de `db0`. **`usePostgres` continua o caminho preferencial para Postgres** porque é o caminho TheoCloud + 80% dos casos.
- **Rationale:** `db0` cobre o resto do espectro SQL com 6 connectors maduros. `usePostgres` retorna `PoolLike` diretamente — API mais natural para quem usa Drizzle/raw SQL sobre `pg`. `db0` retorna um wrapper unificado bom para portabilidade (SQLite em dev → libSQL em prod, por exemplo).
- **Consequences:** ✅ Match com TheoCloud preservado (usePostgres). ✅ Edge runtimes (Cloudflare D1, libSQL) ganham first-class via db0. ⚠️ Duas APIs SQL conviventes — documentar quando usar cada.

### D4 — `useStorage<T>(name, factory)` genérico cobre QUALQUER client
- **Decisão:** `StorageManager.useStorage<T>(name, factory: () => T)` é o método de baixo nível para qualquer client (incluindo Mongo, DynamoDB, vector DBs, kafka clients, …). `usePostgres`/`useRedis`/`useUnstorage`/`useDatabase` são açúcar sobre ele.
- **Rationale:** Resolve o limite do design atual (PG/Redis-only no caching). Userland com Mongo perde caching+drain automático hoje; com `useStorage<T>` ganha tudo.
- **Consequences:** ✅ Sem limite arbitrário. ✅ `usePostgres`/`useRedis` reimplementados em cima (DRY). ⚠️ User precisa especificar `T` no call-site (`useStorage<Mongo>('main', factory)`); aceitable pois é o trade-off de generics em TS.

### D5 — Peer-deps opcionais, NÃO dependências fixas
- **Decisão:** `unstorage` e `db0` são `peerDependenciesMeta: { optional: true }` no package.json. Apps que usam só PG via `usePostgres` não instalam nada novo.
- **Rationale:** Match com ADR-0007 D2 (factory pattern para `pg`/`ioredis`). Bundle de TheoKit não inflam.
- **Consequences:** ✅ Apps minimal pagam zero. ⚠️ Runtime check ao chamar `useUnstorage`/`useDatabase` — se peer-dep não instalada, throw com mensagem acionável.

### D6 — `definePlugin()` helper é identity function, NÃO classe
- **Decisão:** `definePlugin(plugin: TheoPlugin): TheoPlugin` é uma identity function. Existe apenas para auto-completar e melhorar a DX no `theo.config.ts > plugins: [definePlugin({...})]`. Não muda runtime.
- **Rationale:** Padrão TanStack/Vite/Astro. Sem custo. Sem mágica.
- **Consequences:** ✅ Migração trivial. ✅ Sem inflação de superfície. ⚠️ Nada — é literalmente um helper de tipo.

## Dependency Graph

```
Phase 0 (ADRs D1-D6, scope lock, peer-dep evaluation)
        │
        ▼
Phase 1 (useStorage<T> generic + refactor usePostgres/useRedis)
        │
        ├──────────────────┐
        ▼                  ▼
Phase 2            Phase 3
(definePlugin       (unstorage adoption
 + TheoPlugin doc)   useUnstorage helper)
        │                  │
        │                  ▼
        │           Phase 4
        │           (db0 adoption
        │            useDatabase helper)
        │                  │
        └────────┬─────────┘
                 ▼
        Phase 5 (concept doc consolidation + 2 fixtures)
                 │
                 ▼
        Phase 6 (Dogfood QA)
```

**Parallelization:** Phase 2 (definePlugin + doc), Phase 3 (unstorage), Phase 4 (db0) podem rodar paralelamente depois de Phase 1. Phase 5 consolida.

---

## Phase 0: ADR + scope lock + peer-dep evaluation

**Objective:** Documentar decisões D1-D6, validar versões de peer-deps, lock no escopo antes de tocar código.

### T0.1 — Write ADR-0008 (TheoPlugin é o SDK oficial)

#### Objective
Registrar D1, D6 — `TheoPlugin` continua único SDK; `definePlugin()` é açúcar; **explicitamente rejeita** `defineTheokitModule`.

#### Evidence
- `packages/theo/src/server/plugin-types.ts:46` — interface existente.
- CLAUDE.md R0.6.5 — bloqueio explícito a SDK paralelo sem community signal.
- Prior art: Fastify (200+ plugins com pattern de 5 LOC) vs Nuxt (`@nuxt/kit` com 3000+ LOC para módulos).

#### Files to edit
```
docs/adr/0008-theoplugin-is-the-canonical-sdk.md — NEW
```

#### Deep file dependency analysis
- New file, doc-only.
- Cross-link: ADR-0007 (StorageManager), CLAUDE.md R0.6.5.

#### Deep Dives
Sections (MADR 3.0):
1. **Context** — Discovery do `TheoPlugin` existente; tensão "construir SDK Nuxt-style vs usar o que existe".
2. **Decision** — D1: `TheoPlugin` permanece o ÚNICO SDK. D6: `definePlugin()` identity helper.
3. **Considered alternatives** — Nuxt-style `defineTheokitModule`, registry global de "kinds", Inversion-of-Control container. Cada um rejeitado com motivo.
4. **Consequences** — Bottom-up extension; superfície mínima; sem schema validation built-in.

#### Tasks
1. Criar `docs/adr/0008-theoplugin-is-the-canonical-sdk.md` com 4 seções + 7+ decisions documented inline.
2. Status `accepted`, date `2026-05-27`.
3. Cross-link para ADR-0007 + R0.6.5.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     adr_0008_exists_with_required_sections() — Given the repo, When read docs/adr/0008-theoplugin-is-the-canonical-sdk.md, Then file exists + has Context/Decision/Considered alternatives/Consequences (happy path; MUST fail pre-write)
RED:     adr_0008_rejects_define_theokit_module_explicitly() — Given the ADR content, When grep 'defineTheokitModule' AND 'REJECTED', Then both present in same alternatives section (validation error)
RED:     adr_0008_cross_links_adr_0007_and_r065() — Given the file, When grep, Then 'ADR-0007' AND 'R0.6.5' both referenced (edge case: docs stay coherent)
RED:     adr_0008_documents_d1_and_d6() — Given the file, When grep, Then '### D1' AND '### D6' both present (error scenario: incomplete ADR)
GREEN:   Write ADR with all required content
REFACTOR: None
VERIFY:  npx vitest run tests/unit/adr-0008-theoplugin-canonical-sdk.test.ts
```

BDD scenarios:
- **Happy path**: ADR has all 4 MADR sections.
- **Validation error**: missing rejection of `defineTheokitModule` fails test.
- **Edge case**: ADR cross-links ADR-0007 + CLAUDE.md R0.6.5.
- **Error scenario**: D1 or D6 missing → fail.

#### Acceptance Criteria
- [ ] `docs/adr/0008-theoplugin-is-the-canonical-sdk.md` exists with MADR 3.0 sections
- [ ] D1 + D6 documented with Rationale + Consequences
- [ ] Explicitly rejects `defineTheokitModule` in alternatives
- [ ] Cross-links ADR-0007 + CLAUDE.md R0.6.5
- [ ] Pass: `npx vitest run tests/unit/adr-0008-theoplugin-canonical-sdk.test.ts`

#### DoD
- [ ] File committed
- [ ] Structural test green
- [ ] Linked from `docs/concepts/storage-manager.md` (Phase 5)

---

### T0.2 — Write ADR-0009 (`unstorage` adoption for KV)

#### Objective
Registrar D2 — adotar `unstorage` como caminho oficial de drivers KV.

#### Evidence
- Nitro `src/runtime/internal/storage.ts:1-8` — usa `import { createStorage } from 'unstorage'`.
- 20+ drivers já existentes em `unstorage/drivers/`: redis, fs, memory, s3, cloudflare-kv, vercel-kv, upstash, …
- Macro roadmap R0.6.1 (BlobStorageAdapter) seria coberto sem reinventar.

#### Files to edit
```
docs/adr/0009-unstorage-adoption-for-kv.md — NEW
```

#### Deep file dependency analysis
- New file, doc-only.
- Cross-link: ADR-0007, ADR-0008, Nitro reference.

#### Deep Dives
Sections:
1. **Context** — Por que NÃO inventar driver registry próprio.
2. **Decision** — `useUnstorage(name, driver?)` wrappa `createStorage()`.
3. **Considered alternatives** — Inventar `KvDriver { kind, create, dispose }` registry (REJECTED — over-engineering); usar só Redis hardcoded (REJECTED — escopo do edge runtime).
4. **Consequences** — `unstorage` é peer-dep opcional; userland aprende API do unstorage.

#### Tasks
1. Criar `docs/adr/0009-unstorage-adoption-for-kv.md`.
2. Status `accepted`, date `2026-05-27`.
3. Listar drivers a recomendar no docs (memory dev, redis prod, cloudflare-kv edge).

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     adr_0009_exists() — Given the repo, When read docs/adr/0009-unstorage-adoption-for-kv.md, Then file exists + has MADR sections (happy path; MUST fail pre-write)
RED:     adr_0009_cites_nitro_prior_art() — Given content, When grep 'Nitro|nitro', Then match present (validation error: missing evidence)
RED:     adr_0009_documents_peer_dep_optional() — Given content, When grep 'optional|peerDependenciesMeta', Then present (edge case: install model)
RED:     adr_0009_rejects_inventing_registry() — Given content, When grep 'REJECTED' near 'registry', Then present (error scenario: alternatives section)
GREEN:   Write ADR
REFACTOR: None
VERIFY:  npx vitest run tests/unit/adr-0009-unstorage-adoption.test.ts
```

BDD scenarios:
- **Happy path**: ADR exists with required structure.
- **Validation error**: Nitro prior art missing → fail.
- **Edge case**: optional peer-dep documented.
- **Error scenario**: registry alternative not REJECTED.

#### Acceptance Criteria
- [ ] `docs/adr/0009-unstorage-adoption-for-kv.md` exists
- [ ] D2 documented
- [ ] Peer-dep optional clarified
- [ ] Pass: `npx vitest run tests/unit/adr-0009-unstorage-adoption.test.ts`

#### DoD
- [ ] File committed
- [ ] Structural test green

---

### T0.3 — Write ADR-0010 (`db0` adoption for SQL non-Postgres)

#### Objective
Registrar D3 — adotar `db0` para MySQL/SQLite/libSQL/D1; manter `usePostgres` para PG.

#### Evidence
- Nitro `src/runtime/internal/database.ts:1-17` — usa `import { createDatabase } from 'db0'`.
- `db0` cobre PostgreSQL (`pg`, `postgres.js`), MySQL, SQLite, libSQL, Cloudflare D1.
- TheoCloud target = PG → `usePostgres` direto faz mais sentido lá.

#### Files to edit
```
docs/adr/0010-db0-adoption-for-sql-non-postgres.md — NEW
```

#### Deep file dependency analysis
- New file.
- Cross-link: ADR-0007 (Postgres-specific usePostgres), ADR-0009 (irmão).

#### Deep Dives
Sections:
1. **Context** — Por que duas APIs SQL conviventes (usePostgres + useDatabase).
2. **Decision** — `useDatabase(name, connector)` wrappa `createDatabase()`. **`usePostgres` PERMANECE** o caminho preferencial pra Postgres.
3. **Considered alternatives** — Substituir `usePostgres` por `useDatabase('postgres')` (REJECTED — break BC + perda da API direta de `pg`); ignorar non-PG SQL (REJECTED — edge runtimes precisam libSQL/D1).
4. **Consequences** — Match TheoCloud preservado; edge ganha first-class; doc precisa explicar quando usar cada.

#### Tasks
1. Criar `docs/adr/0010-db0-adoption-for-sql-non-postgres.md`.
2. Status `accepted`, date `2026-05-27`.
3. Decision tree: PG → usePostgres; demais → useDatabase.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     adr_0010_exists() — Given the repo, When read, Then file present + MADR sections (happy path; MUST fail pre-write)
RED:     adr_0010_keeps_usepostgres_for_pg() — Given content, When grep 'usePostgres' AND 'preserved|preferential|primary', Then match (validation error)
RED:     adr_0010_rejects_replacing_usepostgres() — Given content, When grep 'REJECTED' near 'usePostgres', Then match (edge case: alternatives section)
RED:     adr_0010_decision_tree_documented() — Given content, When grep 'Postgres.*usePostgres' AND 'libSQL|D1|MySQL|SQLite.*useDatabase', Then match (error scenario: developer guidance)
GREEN:   Write ADR
REFACTOR: None
VERIFY:  npx vitest run tests/unit/adr-0010-db0-adoption.test.ts
```

BDD scenarios:
- **Happy path**: ADR has all sections.
- **Validation error**: `usePostgres` not preserved explicitly.
- **Edge case**: alternative rejection present.
- **Error scenario**: decision tree missing.

#### Acceptance Criteria
- [ ] `docs/adr/0010-db0-adoption-for-sql-non-postgres.md` exists
- [ ] D3 documented
- [ ] Decision tree (PG → usePostgres; rest → useDatabase) clear
- [ ] Pass: `npx vitest run tests/unit/adr-0010-db0-adoption.test.ts`

#### DoD
- [ ] File committed
- [ ] Structural test green

---

### T0.4 — Evaluate peer-dep versions (`unstorage`, `db0`) + add to package.json

#### Objective
Pin compatible versions, add `peerDependenciesMeta.optional` to TheoKit package.json. Smoke that the libs install + import.

#### Evidence
- Latest stable: `unstorage@^1.10.0`, `db0@^0.3.0` (verify at task time).
- TheoKit `pg` already in devDeps as optional.
- Bundle impact ZERO (lazy import — same pattern as `pg`).

#### Files to edit
```
packages/theo/package.json — EDIT: add peerDependenciesMeta entries
pnpm-lock.yaml — auto-updated
tests/unit/peer-deps-availability.test.ts — NEW: smoke that imports work in workspace
```

#### Deep file dependency analysis
- `package.json`: append `unstorage` + `db0` under `peerDependencies` + `peerDependenciesMeta`. Add as workspace devDeps so tests can import.
- Smoke test verifies `await import('unstorage')` and `await import('db0')` resolve in workspace.

#### Deep Dives

**Package.json delta:**
```json
{
  "peerDependencies": {
    "ws": "^8.18.0",
    "pg": "^8.0.0",
    "unstorage": "^1.10.0",
    "db0": "^0.3.0"
  },
  "peerDependenciesMeta": {
    "ws": { "optional": true },
    "pg": { "optional": true },
    "unstorage": { "optional": true },
    "db0": { "optional": true }
  },
  "devDependencies": {
    "unstorage": "^1.10.0",
    "db0": "^0.3.0"
  }
}
```

**Invariants:**
- TheoKit consumers without unstorage/db0 instalados → builds verde; `useUnstorage`/`useDatabase` chamadas lazy throw actionable error.
- Workspace tests instalam ambas → tests verificam.

**Edge cases:**
- `npx create-theokit` continua mostrando `pg` como opcional; adicionar `unstorage`+`db0` à lista de "if you use".
- publint deve continuar "All good!"; attw verifica peer-dep declaration.

#### Tasks
1. Verificar latest stable de `unstorage` e `db0` via `npm view`.
2. Editar `packages/theo/package.json` adicionando ambas.
3. `pnpm install` para atualizar lock.
4. Criar `tests/unit/peer-deps-availability.test.ts` que assert `await import('unstorage')` + `await import('db0')` resolvem.
5. Atualizar `packages/create-theo/templates/default/README.md.tmpl` listando opções.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     unstorage_listed_as_optional_peer_dep() — Given package.json, When read, Then peerDependencies.unstorage present AND peerDependenciesMeta.unstorage.optional === true (happy path)
RED:     db0_listed_as_optional_peer_dep() — Given package.json, Then same shape for db0 (happy path)
RED:     unstorage_importable_in_workspace_tests() — Given workspace, When await import('unstorage'), Then resolves to createStorage function (validation error: dep not installed)
RED:     db0_importable_in_workspace_tests() — Given workspace, When await import('db0'), Then resolves to createDatabase function (validation error)
RED:     publint_still_clean_with_new_peer_deps() — Given build dist, When run publint, Then "All good!" (edge case: package.json valid)
GREEN:   Edit package.json, run pnpm install, write smoke test
REFACTOR: None
VERIFY:  npx vitest run tests/unit/peer-deps-availability.test.ts && pnpm exec publint packages/theo
```

BDD scenarios:
- **Happy path**: peer-deps declared optional.
- **Validation error**: import fails if dep not installed (CI checks they ARE installed in workspace).
- **Edge case**: publint clean.
- **Error scenario**: `peerDependenciesMeta.optional` not `true` → fail.

#### Acceptance Criteria
- [ ] `unstorage` + `db0` added to peer-deps as optional
- [ ] Smoke test imports both successfully
- [ ] `pnpm exec publint packages/theo` "All good!"
- [ ] `pnpm exec @arethetypeswrong/cli --pack packages/theo` all 🟢
- [ ] `pnpm install` clean

#### DoD
- [ ] Package.json updated
- [ ] Lockfile committed
- [ ] Smoke test green

---

## Phase 1: `useStorage<T>` generic on StorageManager

**Objective:** Adicionar método genérico ao manager; reimplementar `usePostgres`/`useRedis` em cima dele (DRY).

### T1.1 — Add `useStorage<T>(name, factory)` to `StorageManager`

#### Objective
Generic caching + lifecycle para qualquer client. Cobre MySQL, Mongo, Turso, DynamoDB, etc.

#### Evidence
- ADR D4 — limite atual do design só ter PG/Redis methods.
- 0 community asks pra MySQL/Mongo HOJE — mas zero esforço para abrir o caminho.

#### Files to edit
```
packages/theo/src/server/storage/storage-manager.ts — EDIT: add useStorage<T>; refactor usePostgres/useRedis internally
packages/theo/src/server/storage/storage-types.ts — EDIT: add GenericFactory<T> type
tests/unit/storage-manager-use-storage-generic.test.ts — NEW: 8+ scenarios
```

#### Deep file dependency analysis
- `storage-manager.ts`:
  - **Today:** `usePostgres` + `useRedis` each have own `Map` + lookup.
  - **After:** single internal `Map<string, unknown>` (or two maps, mesmo). `useStorage<T>(name, factory)` is the base; `usePostgres`/`useRedis` thin wrappers.
  - **Downstream:** todos os testes de manager (já passam → BC garantida).

#### Deep Dives

**Final API (post-EC-1 fix):**
```ts
class StorageManager {
  #dbPools = new Map<string, PoolLike>()        // PG-shaped — has end()
  #redisClients = new Map<string, RedisLike>()  // Redis-shaped — has quit()/disconnect()
  #genericClients = new Map<string, unknown>()  // any T — drained ONLY via register(adapter) — caller responsibility

  /**
   * EC-1 FIX: use Map.has(name) for cache-hit check, NOT `cached !== undefined`.
   * Factories that return null/undefined are valid use cases (lazy connect,
   * stubs, etc.). The `!== undefined` check would re-invoke the factory every
   * call for `undefined` returns AND silently cache `null` cast as T → sutil bug.
   * `Map.has(name)` is the canonical "key was set" check.
   */
  useStorage<T>(name: string, factory: () => T): T {
    if (this.#disposed) throw new Error('StorageManager is disposed')
    if (this.#genericClients.has(name)) return this.#genericClients.get(name) as T
    const client = factory()
    this.#genericClients.set(name, client)
    return client
  }

  usePostgres(dbName: string, factory: PostgresFactory): PoolLike {
    // Thin wrapper that ALSO does the config lookup.
    // EC-3: error messages preserved verbatim from existing usePostgres for BC tests.
    if (this.#disposed) throw new Error('StorageManager is disposed')
    const cached = this.#dbPools.get(dbName)
    if (cached !== undefined) return cached
    const dbConfig = this.#config?.databases?.[dbName]
    if (dbConfig === undefined) {
      throw new Error(`Database "${dbName}" not configured. Add it to theo.config.ts > storage.databases.`)
    }
    const server = this.#config?.servers?.[dbConfig.server]
    if (server === undefined) {
      throw new Error(`Server "${dbConfig.server}" referenced by database "${dbName}" not found in theo.config.ts > storage.servers.`)
    }
    const pool = factory(server, dbConfig)
    this.#dbPools.set(dbName, pool)
    return pool
  }

  useRedis(serverName: string, factory: RedisFactory): RedisLike {
    if (this.#disposed) throw new Error('StorageManager is disposed')
    const cached = this.#redisClients.get(serverName)
    if (cached !== undefined) return cached
    const serverConfig = this.#config?.redis?.[serverName]
    if (serverConfig === undefined) {
      throw new Error(`Redis server "${serverName}" not configured. Add it to theo.config.ts > storage.redis.`)
    }
    const client = factory(serverConfig)
    this.#redisClients.set(serverName, client)
    return client
  }
}
```

**Why 3 separate Maps (not a single `#clients`):**
- PG pools need `.end()` during dispose — type narrowing required.
- Redis clients need `quit()` / `disconnect()` fallback — type narrowing required.
- Generic clients are user-managed lifecycle — separate to avoid mis-drain.

**Why `usePostgres` keeps its OWN map (not routes through `useStorage`):**
- BC of error messages (EC-3): existing tests assert exact strings; routing through `useStorage` would lose the config-lookup-specific wording.
- BC of `dispose()`: `#dbPools` is what `dispose()` iterates to call `.end()`. Collapsing would require a "kind tag" on each entry.

**Invariants:**
- BC total: existing `usePostgres`/`useRedis` tests pass with verbatim error messages.
- `useStorage<T>` uses `Map.has(name)` so factories returning `null`/`undefined` cache correctly (EC-1).
- Generic clients are USER-RESPONSIBILITY for drain: call `manager.register({ name, dispose })` separately.

**Edge cases:**
- Same `name` reused across `useStorage`/`usePostgres` — separate Maps means no collision.
- `useStorage<Foo>('x', f)` then `useStorage<Bar>('x', f2)` — second factory NOT called; returns cached `Foo` cast as `Bar` (intentional TS hole — same trade-off as Map<string, unknown>). EC-2 documents via RED test.
- Factory returns `null` / `undefined` — cached normally; second call returns same value WITHOUT re-invoking factory (EC-1 fix).
- Factory throws on first call — NOT cached (the `.set()` line never runs); next call retries (existing behavior).
- Generic client dispose: user must `register({ name, dispose: () => client.close() })` separately. Documented in §6 of concept doc (EC-9).
- **Reserved key prefixes** in `#genericClients`: `__unstorage:` (T3.1), `__db0:` (T4.1). Documented in §6 of concept doc (EC-8).

#### Tasks
1. Adicionar `#genericClients` map.
2. Adicionar `useStorage<T>(name, factory)` method.
3. Manter `usePostgres`/`useRedis` com map+lookup atuais (NOT refatorar internamente para usar useStorage — namespaces separados ficam mais limpos).
4. Atualizar `dispose()` para drenar `#genericClients` por adapter registration (documentar que generic clients precisam de `register()`).
5. Atualizar testes existentes garantindo BC.
6. Criar `tests/unit/storage-manager-use-storage-generic.test.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     useStorage_caches_per_name() — Given manager.configure({}), When useStorage('foo', factory) called twice, Then factory invoked 1× (happy path)
RED:     useStorage_throws_after_dispose() — Given dispose() called, When useStorage(...), Then throws 'StorageManager is disposed' (validation error)
RED:     useStorage_independent_namespace_from_usePostgres() — Given usePostgres('conv') + useStorage('conv', f), Then BOTH cached separately (no collision)
RED:     useStorage_generic_typed_via_factory_return() — Given factory: () => MyMongoClient, When useStorage<MyMongoClient>('mongo', factory), Then return value typed as MyMongoClient (type test)
RED:     useStorage_factory_throw_not_cached() — Given factory throws on first call, When called again, Then factory re-invoked (edge case)
RED:     useStorage_user_must_register_adapter_for_drain() — Given useStorage('mongo', factory) without register(), When manager.dispose(), Then dispose runs but mongo client NOT closed by manager — user responsibility, documented (error scenario)
RED:     [EC-1] useStorage_caches_undefined_return() — Given factory returns undefined, When useStorage('x', factory) called twice, Then factory invoked 1× AND second call returns undefined (MUST FIX: uses Map.has, not !== undefined)
RED:     [EC-1] useStorage_caches_null_return() — Given factory returns null, When useStorage('x', factory) called twice, Then factory invoked 1× AND second call returns null (MUST FIX same as above)
RED:     [EC-2] useStorage_second_type_returns_cached_first_type() — Given useStorage<{a:number}>('x', () => ({a:1})) then useStorage<{b:string}>('x', () => ({b:'fail'})), Then second factory NOT invoked AND returned value === {a:1} cast as {b:string} (documented type hole)
RED:     [EC-3] usePostgres_error_message_unchanged_database_not_found() — Given config sem databases.foo, When usePostgres('foo', f), Then throws with EXACT message 'Database "foo" not configured. Add it to theo.config.ts > storage.databases.' (BC stability)
RED:     [EC-3] usePostgres_error_message_unchanged_server_not_found() — Given databases.X.server='ghost', When usePostgres('X', f), Then throws with EXACT message 'Server "ghost" referenced by database "X" not found in theo.config.ts > storage.servers.' (BC stability)
RED:     usePostgres_still_works_unchanged() — Given existing 18 usePostgres test scenarios, Then all pass (BC)
RED:     useRedis_still_works_unchanged() — Given existing useRedis test scenarios, Then all pass (BC)
GREEN:   Add useStorage<T> using Map.has(); preserve usePostgres/useRedis behavior + error messages
REFACTOR: Extract common "disposed check" guard if duplication exceeds 3 sites
VERIFY:  npx vitest run tests/unit/storage-manager-use-storage-generic.test.ts tests/unit/storage-manager.test.ts
```

BDD scenarios:
- **Happy path**: generic caching works; undefined/null cached correctly (EC-1).
- **Validation error**: throws after dispose; BC error messages stable (EC-3).
- **Edge case**: independent namespaces; factory throw not cached; type hole when re-typed name (EC-2).
- **Error scenario**: user-managed lifecycle for generic clients (docs assertion).

#### Acceptance Criteria
- [ ] `useStorage<T>(name, factory)` exported from `storage-manager.ts`
- [ ] `useStorage` uses `Map.has(name)` for cache-hit check (EC-1 fix verified by 2 RED tests)
- [ ] `usePostgres`/`useRedis` BC tests all pass with VERBATIM error message strings (EC-3)
- [ ] Type hole on re-typed `name` documented via RED test (EC-2)
- [ ] 13+ new tests in `storage-manager-use-storage-generic.test.ts` green (was 8+; +2 EC-1 + 1 EC-2 + 2 EC-3)
- [ ] Type test: factory return type inferred at call-site
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings
- [ ] `pnpm check:deps` 0 violations

#### DoD
- [ ] Method + tests green
- [ ] BC preserved (existing 18 manager tests pass)
- [ ] Concept doc T5.1 mentions useStorage in API surface table

---

### T1.2 — Re-export `useStorage<T>` from `theokit/server` barrel + type signatures

#### Objective
`StorageManager.useStorage` method is enough; no separate barrel export needed (it's a method). But ensure type `GenericFactory<T>` is exported if useful for users defining factory functions externally.

#### Evidence
- T1.3 of previous plan exports `getStorageManager`, `StorageManager`, etc. T1.2 here adds optional types.

#### Files to edit
```
packages/theo/src/server/storage/storage-types.ts — EDIT (optional): export GenericFactory<T> = () => T type alias
packages/theo/src/server/storage/index.ts — EDIT (optional): re-export
packages/theo/src/server/index.ts — EDIT (optional): re-export
tests/unit/storage-manager-barrel-exports-v2.test.ts — NEW: verify useStorage callable via getStorageManager()
```

#### Deep file dependency analysis
- Minor type export; pure barrel additions.

#### Deep Dives
```ts
export type GenericFactory<T> = () => T
```

This is the single type alias. Useful for:
```ts
import { type GenericFactory } from 'theokit/server'
const mongoFactory: GenericFactory<MongoClient> = () => new MongoClient(...)
manager.useStorage('mongo', mongoFactory)
```

#### Tasks
1. Adicionar `GenericFactory<T>` em storage-types.ts.
2. Re-exportar via barrels.
3. Update smoke test pra verificar useStorage call shape.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     useStorage_callable_via_getStorageManager() — Given manager = getStorageManager(), When manager.useStorage('x', () => 42), Then returns 42 (happy path)
RED:     generic_factory_type_exported() — Given import { type GenericFactory } from 'theokit/server', When used as factory typing, Then compiles (type test)
RED:     useStorage_inferred_type_visible_in_dts() — Given dist DTS for theokit/server, When grep 'useStorage', Then signature present (validation error)
RED:     bc_existing_barrel_exports_intact() — Given import { getStorageManager, PoolLike }, Then both still resolve (edge case)
GREEN:   Add exports
REFACTOR: None
VERIFY:  npx vitest run tests/unit/storage-manager-barrel-exports-v2.test.ts && pnpm --filter theokit build
```

BDD scenarios:
- **Happy path**: call works.
- **Validation error**: DTS contains useStorage.
- **Edge case**: type alias importable.
- **Error scenario**: BC export broke.

#### Acceptance Criteria
- [ ] `GenericFactory<T>` exported
- [ ] Smoke test green
- [ ] `pnpm --filter theokit build` green
- [ ] DTS contains `useStorage` method signature

#### DoD
- [ ] Re-exports added
- [ ] DTS check passes
- [ ] No publint/attw regression

---

## Phase 2: `TheoPlugin` as canonical SDK (doc + `definePlugin` helper)

**Objective:** Formalizar `TheoPlugin` como o SDK plugin do TheoKit; adicionar `definePlugin()` identity helper; doc-de-primeira-classe.

### T2.1 — Add `definePlugin()` identity helper

#### Objective
Açúcar de DX (auto-complete) sem mudar runtime.

#### Evidence
- D6 — identity function pattern (TanStack/Vite/Astro).
- 3 plugins in-tree (web-shim, ws-shim, batching) podem migrar para `definePlugin({...})`.

#### Files to edit
```
packages/theo/src/server/plugin-types.ts — EDIT: add definePlugin export
packages/theo/src/server/plugins/index.ts — NEW or EDIT: barrel re-export
packages/theo/src/server/index.ts — EDIT: re-export definePlugin + TheoPlugin
tests/unit/define-plugin-helper.test.ts — NEW
```

#### Deep file dependency analysis
- `plugin-types.ts`: add 1 function.
- `server/index.ts`: re-export.
- 3 in-tree plugins NOT migrated yet (separate cleanup task; BC).

#### Deep Dives

```ts
/**
 * Identity function for plugin authors. Provides auto-completion + type inference.
 * Equivalent to `const x: TheoPlugin = {...}` but more ergonomic.
 *
 * Example:
 *   import { definePlugin } from 'theokit/server'
 *   export default definePlugin({
 *     name: 'my-plugin',
 *     register(app) { app.addHook('onRequest', ...) },
 *   })
 */
export function definePlugin(plugin: TheoPlugin): TheoPlugin {
  return plugin
}
```

**Invariants:**
- Runtime: identity. Zero overhead.
- TS: enables literal-type narrowing (e.g., name as string literal).

**Edge cases:**
- User passes object missing `name` → TS error at call-site (good).
- User passes async register function → TS accepts (TheoPlugin signature allows Promise<void>).

#### Tasks
1. Adicionar `export function definePlugin(plugin: TheoPlugin): TheoPlugin` em plugin-types.ts.
2. Re-export via barrel.
3. Criar `tests/unit/define-plugin-helper.test.ts`.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     definePlugin_returns_input_unchanged() — Given { name: 'x', register: fn }, When definePlugin(input), Then return === input (identity; happy path)
RED:     definePlugin_inferred_type_TheoPlugin() — Given definePlugin({...}), When type tested, Then return type is TheoPlugin (type test)
RED:     definePlugin_rejects_missing_name_at_compile() — Given { register: fn }, When passed, Then TS error (validation error; @ts-expect-error)
RED:     definePlugin_accepts_async_register() — Given { name, register: async () => {} }, When called, Then accepted (edge case)
RED:     definePlugin_exported_from_theokit_server() — Given import { definePlugin } from 'theokit/server', When typed, Then function (error scenario: BC of barrel)
GREEN:   Add identity helper + barrel re-export
REFACTOR: None
VERIFY:  npx vitest run tests/unit/define-plugin-helper.test.ts
```

BDD scenarios:
- **Happy path**: identity behavior.
- **Validation error**: missing fields → TS error.
- **Edge case**: async register accepted.
- **Error scenario**: barrel export verified.

#### Acceptance Criteria
- [ ] `definePlugin()` exported from `theokit/server`
- [ ] 5+ tests in `define-plugin-helper.test.ts` green
- [ ] Type test verifies inference at call-site
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings

#### DoD
- [ ] Helper added + tests green
- [ ] BC preserved

---

### T2.2 — Concept doc `docs/concepts/plugins.md` (TheoPlugin as canonical SDK)

#### Objective
Documentar oficialmente `TheoPlugin` como o plugin SDK do TheoKit. Padrão Fastify; existing 3 in-tree plugins como exemplos.

#### Evidence
- Comunidade não sabe que existe — primeira coisa que vão perguntar é "como adiciono uma feature ao TheoKit?"
- D1 — `TheoPlugin` é o SDK oficial.

#### Files to edit
```
docs/concepts/plugins.md — NEW
```

#### Deep file dependency analysis
- New file.
- Cross-link: ADR-0008, `web-shim` source, `ws-shim` source, `batching` source.

#### Deep Dives

Sections:
1. **What & Why** — plugin = unidade de extensão; Fastify pattern.
2. **API Surface** — `TheoPlugin { name, register(app) }` + `app.addHook(name, fn)` + `app.decorateRequest(key, value)`.
3. **Examples** — 3 in-tree (`web-shim`, `ws-shim`, `batching`); 1 hipotético community (`@theokit/plugin-cors`).
4. **Lifecycle** — quando register é chamado; quando hooks executam.
5. **Limitations & non-goals** — não é Nuxt module; não tem schema validation built-in; não tem dependency resolution; intencional (KISS).
6. **Cookbook** — 3 receitas: add HTTP header globally, log all requests, augment request context.

#### Tasks
1. Criar `docs/concepts/plugins.md` com 6 seções.
2. Cross-links: ADR-0008, plugins existentes, concept docs irmãos.
3. Adicionar entry no índice de docs (se houver).

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     plugins_doc_exists_with_required_sections() — Given the repo, When read docs/concepts/plugins.md, Then all 6 sections present (happy path; MUST fail pre-write)
RED:     plugins_doc_cites_adr_0008() — Given content, When grep, Then 'ADR-0008' referenced (validation error)
RED:     plugins_doc_shows_3_in_tree_examples() — Given content, When grep, Then 'web-shim' AND 'ws-shim' AND 'batching' all present (edge case)
RED:     plugins_doc_documents_non_goals() — Given content, When grep 'non-goals|limitations', Then section exists (error scenario: scope clarity)
RED:     plugins_doc_provides_3_recipes() — Given content, When count cookbook subsections, Then ≥3 (happy path)
GREEN:   Write doc
REFACTOR: None
VERIFY:  npx vitest run tests/unit/concept-doc-plugins.test.ts
```

BDD scenarios:
- **Happy path**: doc has all sections + 3 recipes.
- **Validation error**: ADR cross-link missing.
- **Edge case**: 3 in-tree examples cited.
- **Error scenario**: non-goals not documented (scope creep risk).

#### Acceptance Criteria
- [ ] `docs/concepts/plugins.md` exists with 6 sections
- [ ] Cross-links to ADR-0008 + 3 in-tree plugins
- [ ] Cookbook has 3+ recipes
- [ ] Structural test green

#### DoD
- [ ] Doc complete
- [ ] Cross-links work
- [ ] Listed in docs index

---

## Phase 3: `unstorage` adoption — `useUnstorage(name, driver?)`

**Objective:** Helper que cria + cacheia `Storage<T>` de unstorage via manager.

### T3.1 — Implement `useUnstorage(name, driver?)` helper

#### Objective
Wrapper sobre `createStorage()` de unstorage que registra dispose no manager.

#### Evidence
- Nitro `runtime/internal/storage.ts:1-8` — same pattern.
- D2 — delegation.

#### Files to edit
```
packages/theo/src/server/storage/use-unstorage.ts — NEW
packages/theo/src/server/storage/index.ts — EDIT: re-export
packages/theo/src/server/index.ts — EDIT: re-export
tests/unit/use-unstorage.test.ts — NEW
```

#### Deep file dependency analysis
- `use-unstorage.ts`: dynamic-imports `unstorage` (peer-dep optional).
- Manager `useStorage<T>` + `register({ name, dispose })` reused.

#### Deep Dives

**API:**
```ts
import type { Storage, StorageValue, Driver } from 'unstorage'

/**
 * Create + cache an `unstorage` Storage instance via StorageManager.
 *
 * @param name — cache key (one Storage per name per process)
 * @param driver — optional unstorage Driver (defaults to memory if omitted)
 *
 * @example
 *   import redisDriver from 'unstorage/drivers/redis'
 *   const cache = await useUnstorage('rate-limit', redisDriver({ url: process.env.REDIS_URL }))
 *
 * Throws if `unstorage` is not installed.
 */
export async function useUnstorage<T extends StorageValue = StorageValue>(
  name: string,
  driver?: Driver,
): Promise<Storage<T>> {
  const unstorage = await import('unstorage').catch(() => null)
  if (unstorage === null) {
    throw new Error(
      `useUnstorage requires the 'unstorage' package. Install via: pnpm add unstorage`,
    )
  }
  const manager = getStorageManager()
  return manager.useStorage<Storage<T>>(`__unstorage:${name}`, () => {
    const storage = unstorage.createStorage<T>({ driver })
    manager.register({
      name: `unstorage:${name}`,
      dispose: () => storage.dispose?.() ?? Promise.resolve(),
    })
    return storage
  })
}
```

**Invariants:**
- `unstorage` not installed → actionable error.
- Multiple `useUnstorage('foo')` calls return same instance.
- Drain via manager.dispose().

**Edge cases:**
- `driver` omitted → memory driver (unstorage default).
- `unstorage` updates API (e.g., new dispose method shape) → `.dispose?.()` optional chain.

#### Tasks
1. Criar `use-unstorage.ts` com helper.
2. Re-exportar via barrels.
3. Criar `tests/unit/use-unstorage.test.ts` (8+ scenarios).

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     useUnstorage_returns_Storage_instance() — Given memory driver, When useUnstorage('cache'), Then returns object with getItem/setItem/removeItem (happy path)
RED:     useUnstorage_caches_per_name() — Given useUnstorage('cache') called twice, Then same instance returned (happy path)
RED:     useUnstorage_independent_namespace_from_useStorage() — Given useUnstorage('foo') + manager.useStorage('foo', fn), Then independent (no collision)
RED:     useUnstorage_throws_when_lib_not_installed() — Given unstorage import fails (mock), When useUnstorage('x'), Then throws actionable error (validation error)
RED:     useUnstorage_default_driver_is_memory() — Given no driver passed, Then memory driver used (edge case)
RED:     useUnstorage_drains_via_manager_dispose() — Given useUnstorage + manager.dispose(), Then storage.dispose called (lifecycle)
RED:     useUnstorage_setItem_getItem_roundtrip() — Given storage, set 'k'='v', When getItem('k'), Then 'v' (error scenario: integration)
RED:     useUnstorage_typed_value_inference() — Given useUnstorage<MyType>('typed'), Then getItem returns MyType | null (type test)
RED:     [EC-4] useUnstorage_marked_server_only_in_barrel() — Given a Vite client build importing from 'theokit/server', When the client bundle is inspected, Then `useUnstorage` symbol is NOT present (server-only enforcement via existing barrel). Same coverage extends to useDatabase (T4.1).
GREEN:   Add helper + tests
REFACTOR: None
VERIFY:  npx vitest run tests/unit/use-unstorage.test.ts
```

BDD scenarios:
- **Happy path**: storage created + roundtrip works.
- **Validation error**: unstorage not installed → actionable error.
- **Edge case**: namespace isolation; default memory driver.
- **Error scenario**: dispose drains storage.

#### Acceptance Criteria
- [ ] `useUnstorage()` exported from `theokit/server`
- [ ] 8+ tests green
- [ ] Type-safe value inference (StorageValue T)
- [ ] Throws actionable when lib missing
- [ ] Drains via manager.dispose()
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings
- [ ] `pnpm check:deps` 0 violations

#### DoD
- [ ] Helper + tests green
- [ ] Drain lifecycle verified

---

### T3.2 — Fixture `tests/fixtures/storage-modules-unstorage-redis/` + integration test

#### Objective
Receita end-to-end mostrando user usando `useUnstorage` com driver Redis (mas com mock InMemoryRedis para CI determinístico).

#### Evidence
- Reusa pattern de `tests/fixtures/conversation-redis/in-memory-redis.ts`.
- D2 — receita deve mostrar driver custom.

#### Files to edit
```
tests/fixtures/storage-modules-unstorage-redis/README.md — NEW
tests/fixtures/storage-modules-unstorage-redis/theo.config.ts — NEW
tests/fixtures/storage-modules-unstorage-redis/server/lib/cache.ts — NEW: useUnstorage call
tests/integration/storage-modules-unstorage-fixture.test.ts — NEW
```

#### Deep file dependency analysis
- Fixture mostrando: declarar driver no userland, chamar `useUnstorage('cache', driver)`, setItem/getItem, dispose drena.

#### Deep Dives

**Fixture flow:**
1. `theo.config.ts` declara `storage: { kv: { cache: 'redis' } }` (config schema mínimo).
2. `server/lib/cache.ts` chama `useUnstorage('cache', mockRedisDriver)`.
3. Integration test verifica: set+get works, dispose closes.

**`mockRedisDriver`:** wrap o existing `InMemoryRedis` em formato Driver de unstorage (custom driver function).

#### Tasks
1. Criar arquivos do fixture.
2. Criar integration test.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     fixture_boots_with_useUnstorage() — Given fixture booted, When useUnstorage('cache', driver), Then Storage instance returned (happy path)
RED:     fixture_setItem_getItem_roundtrip() — Given storage, set 'user:1'={name:'alice'}, When getItem('user:1'), Then deep equal (happy path)
RED:     fixture_dispose_closes_storage() — Given useUnstorage + dispose, Then storage closed (lifecycle)
RED:     fixture_removeItem_after_setItem() — Given set then remove, When getItem, Then null (edge case)
RED:     fixture_handles_concurrent_writes() — Given 5 concurrent setItem to same key, Then last-write-wins (error scenario: concurrency)
RED:     [EC-7] mock_driver_implements_unstorage_Driver_interface() — Given the fixture's mockRedisDriver, When `expectTypeOf<MockDriver>().toExtend<Driver>()`, Then passes — pins to the unstorage peer-dep version declared in package.json; if it fails on bump, fixture needs update.
GREEN:   Build fixture + test
REFACTOR: None
VERIFY:  npx vitest run tests/integration/storage-modules-unstorage-fixture.test.ts
```

BDD scenarios:
- **Happy path**: fixture works end-to-end.
- **Validation error**: missing driver → unstorage memory fallback.
- **Edge case**: remove after set.
- **Error scenario**: concurrent writes.

#### Acceptance Criteria
- [ ] Fixture dir with README, theo.config.ts, server/lib/cache.ts
- [ ] Integration test (5+ scenarios) green
- [ ] No real Redis required (mock driver)
- [ ] `pnpm typecheck` 0 errors

#### DoD
- [ ] Fixture + test green
- [ ] No flakes

---

## Phase 4: `db0` adoption — `useDatabase(name, connector?)`

**Objective:** Helper que cria + cacheia `Database` de db0; coexiste com `usePostgres`.

### T4.1 — Implement `useDatabase(name, connector?)` helper

#### Objective
Wrapper sobre `createDatabase()` de db0. Suporta libSQL/Turso/D1/MySQL/SQLite além do PG.

#### Evidence
- Nitro `runtime/internal/database.ts` — same pattern.
- D3 — `usePostgres` preserved for PG; `useDatabase` for resto.

#### Files to edit
```
packages/theo/src/server/storage/use-database.ts — NEW
packages/theo/src/server/storage/index.ts — EDIT: re-export
packages/theo/src/server/index.ts — EDIT: re-export
tests/unit/use-database.test.ts — NEW
```

#### Deep file dependency analysis
- `use-database.ts`: dynamic-imports `db0` (peer-dep optional).
- Connector é função do db0 (e.g., `import sqliteConnector from 'db0/connectors/better-sqlite3'`).

#### Deep Dives

**API:**
```ts
import type { Database, Connector } from 'db0'

/**
 * Create + cache a `db0` Database instance via StorageManager.
 *
 * Use this for libSQL/Turso/D1/MySQL/SQLite. For Postgres prefer `usePostgres`
 * (returns pg.Pool directly, better integration with Drizzle/raw SQL).
 *
 * @example
 *   import sqlite from 'db0/connectors/better-sqlite3'
 *   const db = await useDatabase('main', sqlite({ name: 'app.db' }))
 *   await db.sql`SELECT 1`
 */
export async function useDatabase(
  name: string,
  connector: Connector,
): Promise<Database> {
  const db0 = await import('db0').catch(() => null)
  if (db0 === null) {
    throw new Error(
      `useDatabase requires the 'db0' package. Install via: pnpm add db0`,
    )
  }
  const manager = getStorageManager()
  return manager.useStorage<Database>(`__db0:${name}`, () => {
    const db = db0.createDatabase(connector)
    // db0 doesn't have a unified close — connector-level dispose required
    // User responsible for register({ name, dispose }) if needed
    return db
  })
}
```

**Invariants:**
- `db0` not installed → actionable error.
- Cached per `name`.
- Doesn't auto-register for drain — user does it (db0 dispose semantics vary by connector).

**Edge cases:**
- Connector is required (no default — unlike unstorage which defaults to memory).
- User likely wants to register dispose manually: `manager.register({ name: 'db:main', dispose: () => db.exec('...') })` if cleanup needed.

#### Tasks
1. Criar `use-database.ts` com helper.
2. Re-exportar via barrels.
3. Criar `tests/unit/use-database.test.ts` (6+ scenarios).

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     useDatabase_returns_Database_instance() — Given sqlite connector, When useDatabase('test', connector), Then returns object with sql tag fn (happy path)
RED:     useDatabase_caches_per_name() — Given useDatabase('test', c) called twice, Then same instance (happy path)
RED:     useDatabase_throws_when_lib_not_installed() — Given db0 import fails, When useDatabase('x', c), Then throws actionable error (validation error)
RED:     useDatabase_sql_roundtrip_sqlite_mem() — Given memory-sqlite connector, When sql\`SELECT 1 AS n\`, Then rows=[{n:1}] (edge case: real query)
RED:     useDatabase_independent_namespace_from_usePostgres() — Given useDatabase('main') + usePostgres('main' on a config), Then independent (no collision)
RED:     useDatabase_requires_connector() — Given useDatabase('x'), When invoked WITHOUT connector arg, Then TS error (error scenario)
RED:     [EC-5] useDatabase_actionable_error_when_connector_is_factory_not_invoked() — Given the un-invoked factory `import sqlite from 'db0/connectors/better-sqlite3'` passed directly, When useDatabase('x', sqlite), Then throws Error containing 'connector' AND a hint about invoking (e.g., 'Did you forget to call the factory? Pass `sqlite({...})` not `sqlite`.'). Runtime heuristic: `typeof connector === 'function' && connector.length > 0` (factories take config arg).
RED:     [EC-4] useDatabase_marked_server_only_in_barrel() — Given a Vite client build importing from 'theokit/server', Then `useDatabase` symbol is NOT present in client bundle (shared coverage with useUnstorage T3.1).
GREEN:   Add helper + tests + connector-factory runtime guard with actionable message
REFACTOR: None
VERIFY:  npx vitest run tests/unit/use-database.test.ts
```

BDD scenarios:
- **Happy path**: Database created + sql roundtrip.
- **Validation error**: db0 not installed → actionable error.
- **Edge case**: namespace isolation from usePostgres.
- **Error scenario**: missing connector arg → TS error.

#### Acceptance Criteria
- [ ] `useDatabase()` exported from `theokit/server`
- [ ] 6+ tests green (incl. real sqlite roundtrip via better-sqlite3 in workspace dev-dep)
- [ ] Connector required (no default)
- [ ] Throws actionable when lib missing
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint --max-warnings=0` 0 warnings

#### DoD
- [ ] Helper + tests green
- [ ] Real connector roundtrip (sqlite mem)

---

### T4.2 — Fixture `tests/fixtures/storage-modules-db0-libsql/` + integration test

#### Objective
Receita end-to-end com sqlite (closest libSQL proxy for CI).

#### Evidence
- Reusa pattern T2.2 do plano anterior.
- D3 — fixture deve provar a alternativa SQL não-PG.

#### Files to edit
```
tests/fixtures/storage-modules-db0-libsql/README.md — NEW
tests/fixtures/storage-modules-db0-libsql/theo.config.ts — NEW
tests/fixtures/storage-modules-db0-libsql/server/lib/db.ts — NEW: useDatabase call
tests/integration/storage-modules-db0-fixture.test.ts — NEW
```

#### Deep file dependency analysis
- Mostra: declarar connector sqlite memory, useDatabase, sql roundtrip, dispose.

#### Deep Dives

**Fixture:**
```ts
// server/lib/db.ts
import sqlite from 'db0/connectors/better-sqlite3'
import { useDatabase, getStorageManager } from 'theokit/server'

export async function getDb() {
  const db = await useDatabase('main', sqlite({ name: ':memory:' }))
  // Optional: register dispose if connector exposes close()
  return db
}
```

#### Tasks
1. Criar fixture dir.
2. Criar integration test.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     fixture_boots_with_useDatabase() — Given fixture, When getDb(), Then Database instance (happy path)
RED:     fixture_create_table_insert_select() — Given migrate query, When INSERT then SELECT, Then row returned (happy path)
RED:     fixture_concurrent_reads() — Given 5 parallel SELECTs, Then all complete (edge case)
RED:     fixture_invalid_sql_throws() — Given SELECT FROM nonexistent, Then throws (validation error)
RED:     fixture_handles_dispose_manually() — Given user-registered dispose hook, When manager.dispose(), Then hook called (lifecycle)
GREEN:   Build fixture + test
REFACTOR: None
VERIFY:  npx vitest run tests/integration/storage-modules-db0-fixture.test.ts
```

BDD scenarios:
- **Happy path**: full table lifecycle.
- **Validation error**: invalid SQL.
- **Edge case**: concurrent reads.
- **Error scenario**: dispose hook.

#### Acceptance Criteria
- [ ] Fixture dir complete
- [ ] Integration test 5+ scenarios green
- [ ] Real sqlite roundtrip in CI

#### DoD
- [ ] Fixture + test green
- [ ] No flakes

---

## Phase 5: Concept doc consolidation + CHANGELOG

**Objective:** Atualizar `docs/concepts/storage-manager.md` com 3 camadas; criar `docs/concepts/plugins.md` (já feito em T2.2); CHANGELOG entries.

### T5.1 — Update `docs/concepts/storage-manager.md` with 3-layer extension story

#### Objective
Doc consolida: `useStorage<T>` + `useUnstorage` + `useDatabase` + cross-link a plugins.md.

#### Evidence
- Atual doc só mostra usePostgres/useRedis.
- D2/D3/D4 — todas precisam aparecer.

#### Files to edit
```
docs/concepts/storage-manager.md — EDIT: add sections "Generic clients (useStorage)", "KV via unstorage (useUnstorage)", "SQL via db0 (useDatabase)"
```

#### Deep file dependency analysis
- Existing doc has 6 sections; adicionar 3 subsections em §5 (Cookbook) + 1 nova top-level §7 (Extension model).

#### Deep Dives

Novas subsections em §5 Cookbook:
- 5.4 — `useStorage<MongoClient>('main', factory)` recipe
- 5.5 — `useUnstorage('cache', redisDriver)` recipe
- 5.6 — `useDatabase('main', sqliteConnector)` recipe

Nova top-level §7 "Extension model":
- 3 caminhos: TheoPlugin (HTTP hooks) / Domain interface (custom JobBackend etc.) / Storage helpers (useStorage/useUnstorage/useDatabase)
- Decision tree visualizado

Novas notas em §6 "Edge cases & gotchas" (4 bullets):
- **[EC-8] Reserved key prefixes:** Não use `__unstorage:`, `__db0:`, `__pg:`, `__redis:` como `name` em `useStorage<T>` — esses prefixos são reservados internamente pelos helpers de mesmo nome. Use prefixos próprios (e.g., `myapp:`, `vector:`) para evitar colisão silenciosa.
- **[EC-9] `useDatabase` não auto-registra dispose:** db0 connectors variam — alguns têm `.close()`, outros não. Para fechar conexões deterministicamente (especialmente sqlite-on-disk em testes paralelos), registre o hook manualmente: `manager.register({ name: 'db:main', dispose: () => myConnection.close() })`.
- **[EC-10] Native modules (`better-sqlite3`):** Build pode falhar em arquiteturas exóticas (ARM custom, Alpine sem build-tools). Soluções: instalar `python3 make g++` no container, usar Bun + `bun:sqlite` connector, ou usar `db0/connectors/sqlite` (driver pure-JS quando disponível). Fixture CI roda em x86_64 onde prebuilt binaries funcionam.
- **[EC-11] Peer-dep version mismatch:** `unstorage@^1.10` e `db0@^0.3` são declarados nos peer-deps optional. Se você instalar uma major incompatível (e.g., `unstorage@2.0` hipotético), pnpm WARN mas instala — TheoKit NÃO detecta em runtime. Ao bumpar majors, leia o changelog upstream e teste antes de subir pra prod.

#### Tasks
1. Adicionar subsections 5.4/5.5/5.6 e §7.
2. Adicionar 4 bullets em §6 (EC-8, EC-9, EC-10, EC-11).
3. Cross-link plugins.md, ADRs D2/D3/D4.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     storage_manager_doc_has_useStorage_recipe() — Given updated doc, When grep 'useStorage<', Then present in cookbook (happy path; MUST fail pre-edit)
RED:     storage_manager_doc_has_useUnstorage_recipe() — Given doc, When grep 'useUnstorage', Then present (validation error)
RED:     storage_manager_doc_has_useDatabase_recipe() — Given doc, When grep 'useDatabase', Then present (edge case)
RED:     storage_manager_doc_has_extension_model_section() — Given doc, When grep '## 7.' OR 'Extension model', Then present (error scenario)
RED:     storage_manager_doc_cross_links_plugins_md() — Given doc, When grep 'plugins.md|/plugins', Then match (linkage)
RED:     [EC-8] storage_manager_doc_documents_reserved_prefixes() — Given doc, When grep '__unstorage:|__db0:|__pg:|__redis:', Then all 4 reserved prefixes listed in §6 (DOCUMENT)
RED:     [EC-9] storage_manager_doc_documents_useDatabase_manual_dispose() — Given doc, When grep 'useDatabase' near 'register.*dispose' in §6, Then match (DOCUMENT)
RED:     [EC-10] storage_manager_doc_documents_native_modules() — Given doc, When grep 'better-sqlite3|native module|prebuilt', Then match in §6 (DOCUMENT)
RED:     [EC-11] storage_manager_doc_documents_peer_dep_version_caveat() — Given doc, When grep 'peer-dep|major.*incompatible|changelog upstream', Then match in §6 (DOCUMENT)
GREEN:   Update doc with all sections + 4 EC notes
REFACTOR: None
VERIFY:  npx vitest run tests/unit/concept-doc-storage-manager-v2.test.ts
```

BDD scenarios:
- **Happy path**: 3 new recipes documented.
- **Validation error**: useUnstorage missing.
- **Edge case**: useDatabase recipe + 4 EC gotchas in §6 (EC-8/EC-9/EC-10/EC-11).
- **Error scenario**: Extension model section missing.

#### Acceptance Criteria
- [ ] Doc has 3 new cookbook recipes
- [ ] Extension model section added
- [ ] Cross-links plugins.md, ADRs D2/D3/D4
- [ ] §6 "Edge cases & gotchas" lists 4 new bullets (EC-8/EC-9/EC-10/EC-11)
- [ ] Structural test green (9 RED tests, was 5)

#### DoD
- [ ] Doc updated
- [ ] Test passes

---

### T5.2 — CHANGELOG entries

#### Objective
3 entries em `[Unreleased] > ### Added`: definePlugin helper, useStorage generic, useUnstorage+useDatabase adoption.

#### Evidence
- CLAUDE.md global §6 mandatory.

#### Files to edit
```
CHANGELOG.md — EDIT: 3 new entries
```

#### Tasks
1. Adicionar 3 bullets em `[Unreleased] > ### Added`.
2. Cross-link ADRs e concept docs.

#### TDD + BDD (⛔ OBRIGATÓRIO)

```
RED:     changelog_has_definePlugin_entry() — Given changelog, When grep 'definePlugin', Then matched (happy path)
RED:     changelog_has_useStorage_entry() — Given, When grep 'useStorage<', Then matched (happy path)
RED:     changelog_has_unstorage_db0_entry() — Given, When grep 'unstorage' AND 'db0', Then both matched (happy path)
RED:     changelog_entries_cite_adrs() — Given, When grep 'ADR-0008' AND 'ADR-0009' AND 'ADR-0010', Then all matched (validation error)
RED:     [EC-6] changelog_entries_under_700_chars_each() — Given each of the 3 new bullets, When measured between '- **' and next blank line, Then length < 700 (relaxed from 600 to accommodate full ADR + concept doc cross-links per entry)
GREEN:   Add 3 entries (split to keep each focused — definePlugin / useStorage / unstorage+db0)
REFACTOR: None
VERIFY:  npx vitest run tests/unit/changelog-storage-modules.test.ts
```

BDD scenarios:
- **Happy path**: 3 entries present.
- **Validation error**: ADR cross-links missing.
- **Edge case**: entries under [Unreleased] > ### Added (KAC); each entry < 700 chars (EC-6 relaxed cap).
- **Error scenario**: entry exceeds 700 chars → split required.

#### Acceptance Criteria
- [ ] 3 entries added
- [ ] Cross-links to ADR-0008/0009/0010
- [ ] Structural test green

#### DoD
- [ ] Entries committed
- [ ] Test passes

---

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | `TheoPlugin` formalized as SDK | T0.1 (ADR-0008) + T2.1 (definePlugin) + T2.2 (plugins.md) | 3 artifacts |
| 2 | `definePlugin()` identity helper | T2.1 | Function + 5 tests |
| 3 | `useStorage<T>(name, factory)` generic | T1.1 | Method + 8 tests |
| 4 | `useUnstorage(name, driver?)` helper | T3.1 | Function + 8 tests |
| 5 | `useDatabase(name, connector)` helper | T4.1 | Function + 6 tests |
| 6 | `unstorage` peer-dep adoption | T0.4 + T3.1 | package.json + ADR-0009 |
| 7 | `db0` peer-dep adoption | T0.4 + T4.1 | package.json + ADR-0010 |
| 8 | usePostgres preserved (BC) | T1.1 | BC tests pass |
| 9 | useRedis preserved (BC) | T1.1 | BC tests pass |
| 10 | Fixture: unstorage end-to-end | T3.2 | Fixture + 5 tests |
| 11 | Fixture: db0 end-to-end | T4.2 | Fixture + 5 tests |
| 12 | Concept doc consolidates 3 layers | T5.1 | Updated docs/concepts/storage-manager.md |
| 13 | Concept doc plugins.md | T2.2 | New doc |
| 14 | ADR-0008 (TheoPlugin SDK) | T0.1 | ADR + test |
| 15 | ADR-0009 (unstorage) | T0.2 | ADR + test |
| 16 | ADR-0010 (db0) | T0.3 | ADR + test |
| 17 | CHANGELOG entries | T5.2 | 3 bullets |
| 18 | `GenericFactory<T>` type alias exported | T1.2 | Type + barrel |
| EC-1 | `useStorage<T>` cacheia null/undefined corretamente (MUST FIX) | T1.1 | Map.has() + 2 RED tests |
| EC-2 | Type hole quando `name` reusado com tipo diferente | T1.1 | 1 RED test documentando |
| EC-3 | BC error messages literais em usePostgres/useRedis | T1.1 | 2 RED tests assertion verbatim |
| EC-4 | useUnstorage/useDatabase server-only (não bundle client) | T3.1 + T4.1 | Bundle inspection test |
| EC-5 | useDatabase actionable error p/ connector factory não invocada | T4.1 | Runtime heuristic + RED test |
| EC-6 | CHANGELOG cap relaxado 600→700 chars/entry | T5.2 | RED test ajustado |
| EC-7 | Fixture mockDriver pinado à versão peer-dep do unstorage | T3.2 | Type test extension check |
| EC-8 | Reserved key prefixes em useStorage namespace | T5.1 | §6 gotcha doc |
| EC-9 | useDatabase não auto-registra dispose | T5.1 | §6 gotcha doc + recipe |
| EC-10 | better-sqlite3 native build em arch exotic | T5.1 | §6 gotcha doc |
| EC-11 | peer-dep major mismatch sem runtime detection | T5.1 | §6 gotcha doc |

**Coverage: 18/18 functional gaps + 11/11 edge cases = 29/29 (100%)**

## Global Definition of Done

- [ ] All 5 implementation phases (Phase 0–4) + Phase 5 (docs) completed
- [ ] All RED → GREEN tests passing (~75+ new tests across phases — 65 base + 8 EC RED tests + 2 BC verbatim)
- [ ] Zero TypeScript errors (`pnpm typecheck` exit 0)
- [ ] Zero ESLint warnings (`pnpm lint --max-warnings=0`)
- [ ] `pnpm test` exit 0 (≥ 2850 tests green)
- [ ] `pnpm --filter theokit build` exit 0 (DTS clean)
- [ ] `pnpm check:deps` 0 violations
- [ ] `pnpm check:naming` 0 violations
- [ ] `pnpm exec publint packages/theo` "All good!"
- [ ] `pnpm exec @arethetypeswrong/cli --pack packages/theo --ignore-rules cjs-resolves-to-esm no-resolution` all 🟢
- [ ] Backward compatibility preserved (existing `usePostgres`/`useRedis`/`TheoPlugin` usage unchanged)
- [ ] CHANGELOG `[Unreleased]` updated with 3 entries
- [ ] **Dogfood QA Phase 6** — `/dogfood full` ≥ 70/100, zero CRITICAL issues
- [ ] **Fixture proofs** — 2 new fixtures (unstorage + db0) green

### Plan-specific criteria

- [ ] `definePlugin({...})` is identity function with `TheoPlugin` return type
- [ ] `manager.useStorage<T>('x', f)` caches per name; factory called 1× per `useStorage('x', ...)` chain
- [ ] `useUnstorage('cache', driver)` returns `Storage<T>` from unstorage lib; throws actionable if unstorage missing
- [ ] `useDatabase('main', connector)` returns `Database` from db0; throws actionable if db0 missing
- [ ] `usePostgres` continues working unchanged (BC tests pass)
- [ ] `useRedis` continues working unchanged (BC tests pass)
- [ ] Peer-deps `unstorage` + `db0` marked `optional: true`
- [ ] ADR-0008 explicitly rejects `defineTheokitModule`
- [ ] ADR-0009 cites Nitro prior art
- [ ] ADR-0010 documents `usePostgres` vs `useDatabase` decision tree
- [ ] `docs/concepts/storage-manager.md` has 3 new cookbook recipes + Extension model section
- [ ] `docs/concepts/plugins.md` exists with 6 sections + 3 recipes
- [ ] **EC-1 (MUST FIX)**: `useStorage<T>` uses `Map.has()` (not `!== undefined`); RED tests for null/undefined factory returns pass
- [ ] **EC-2**: type hole with re-typed `name` documented via RED test
- [ ] **EC-3**: `usePostgres`/`useRedis` error messages verbatim (RED tests assert exact strings)
- [ ] **EC-4**: `useUnstorage`/`useDatabase` not present in client bundles (server-only enforcement)
- [ ] **EC-5**: `useDatabase` throws actionable error if connector factory passed without invocation
- [ ] **EC-6**: CHANGELOG entries < 700 chars/entry (relaxed from 600 to accommodate cross-links)
- [ ] **EC-7**: fixture mockDriver type-checked against current `unstorage.Driver` interface
- [ ] **EC-8/EC-9/EC-10/EC-11**: concept doc §6 has 4 gotcha bullets (reserved prefixes, manual dispose, native modules, peer-dep major mismatch)

## Final Phase: Dogfood QA (MANDATORY)

> This phase runs AFTER Phases 0–5 are complete.

**Objective:** Validate as a real user would experience.

### Execution

Run `/dogfood full`.

### Acceptance Criteria

- [ ] Health score ≥ 70/100
- [ ] Zero CRITICAL issues introduced by this plan
- [ ] Zero HIGH issues in commands/features modified
- [ ] All new tests pass
- [ ] Manual smoke: scaffold app + `pnpm add unstorage` + use `useUnstorage` works
- [ ] Manual smoke: scaffold app + `pnpm add db0 better-sqlite3` + use `useDatabase` works
- [ ] Any pre-existing issues documented (not caused by this plan)

### If Dogfood Fails

1. Identify plan-caused vs pre-existing.
2. Fix CRITICAL/HIGH plan-caused.
3. Re-run `/dogfood full`.
4. Pre-existing logged but NOT blocking.

---

## Notes on Skill Process

- **`/architecture-docs server` BEFORE skipped** — snapshot from 2026-05-26 (pluggable-storage plan) is fresh; this plan adds 3 new helpers and 1 method to the SAME module (`server/storage/`). AFTER snapshot will capture new files.
- **`/edge-case-plan storage-modules-sdk-delegation`** — invoke after save. Likely edge case clusters: T1.1 (generic Map<string, unknown> type safety), T3.1/T4.1 (peer-dep import error UX), T5.1 (doc consistency with previous).
- **`/cross-validation storage-modules-sdk-delegation`** — run BEFORE dogfood. Validates every TDD cycle has RED → GREEN trace.
- **Roadmap impact:** Closes macro roadmap R0.6.1 (BlobStorageAdapter — coberto via unstorage S3/R2 drivers) without inventing nova interface. Habilita R0.6.7 (UsageStorageAdapter Redis recipe) trivialmente.
