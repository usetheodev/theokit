# Edge Case Review — pluggable-storage-storage-manager

Data: 2026-05-26
Tasks analisadas: 11 (T0.1, T0.2, T1.1, T1.2, T1.3, T2.1, T2.2, T2.3, T3.1, T4.1, T4.2)
Edge cases encontrados: **9** (MUST FIX: 0 · SHOULD TEST: 6 · DOCUMENT: 3)

> **Veredicto upfront:** **PLANO OK.** Zero edge cases capazes de causar crash, perda de dados ou type unsafety em produção. As 6 SHOULD TEST agregam testes triviais a TDD blocks já existentes; as 3 DOCUMENT são riscos aceitos conscientemente. Nenhuma alteração estrutural no plano é necessária.

---

## MUST FIX

**Nenhum.** Análise das fronteiras (config load → manager → adapters → dispose) não revelou cenário em que o plano vigente cause crash, data loss, security hole ou type unsafety. As decisões já em D1..D7 cobrem as questões realistas. Os riscos remanescentes são (a) testáveis com 1 caso BDD a mais, ou (b) aceitáveis com nota no concept doc.

---

## SHOULD TEST

### EC-1: Zod schema (default mode) silenciosamente dropa typos em chaves
- **Task afetada:** T1.1
- **Família:** Input / Validation
- **Cenário:** User escreve `theo.config.ts` com typo: `storage: { databasees: { conv: { server: 'primary' } } }`. `z.object()` default mode strip-unknown silenciosamente descarta `databasees`. Manager nunca vê a config, throws `Database "conv" not configured` na primeira request — debugging caro por estar longe da causa raiz.
- **Teste sugerido:** `test_schema_silently_drops_unknown_keys()` — Given config `{ databasees: { ... }, redys: { ... } }`, When parsed, Then `result.success === true` but `result.data.databases === undefined` AND `result.data.redis === undefined`. Adiciona nota no concept doc T4.1: "use os nomes exatos: `servers`, `databases`, `redis`".
- **Por que não MUST FIX:** schemas existentes (`cacheSchema`, `securitySchema`) não usam `.strict()`. Inconsistência prejudicaria mais que ajudaria. Erro ainda aparece — só não no parse.

### EC-2: `databases.X.server` referenciando chave inexistente em `servers` só falha em `usePostgres()`
- **Task afetada:** T1.1, T1.2
- **Família:** Validation / Cross-field
- **Cenário:** Config válida schema-wise — `databases: { conv: { server: 'Primary' } }` (capitalização errada) — `servers.Primary` undefined. Schema parse passa; `manager.configure()` aceita; `usePostgres('conv', f)` throws `Server "Primary" referenced by database "conv" not found`. Apenas no primeiro request.
- **Teste sugerido:** `test_dangling_server_reference_throws_on_use_not_configure()` — Given config com `databases.X.server='ghost'` e `servers={}`, When `manager.configure()` then `usePostgres('X', f)`, Then configure resolve sem erro AND usePostgres throws com a mensagem de servidor não encontrado (já existe em T1.2 RED tests; este teste explícita o behavior).
- **Por que não MUST FIX:** boot-fail seria `.superRefine()` (15 LOC adicional). Erro atual já é acionável com path completo.

### EC-3: Singleton estado compartilhado dentro do mesmo test file pollui `it` blocks
- **Task afetada:** T1.2
- **Família:** Test isolation
- **Cenário:** `storage-manager.test.ts` tem 12+ cenários. Vitest dentro de um arquivo compartilha estado de módulo. Se `it_a` chama `configure()` e `it_b` espera unconfigured, `it_b` falha intermitentemente.
- **Teste sugerido:** `beforeEach(() => getStorageManager().__resetForTests())` no topo de `tests/unit/storage-manager.test.ts`. Já implícito no D1 (consequence: "exige `__resetForTests()`"); explicitar no TDD block do T1.2.
- **Fix:** adicionar 1 linha de beforeEach na seção Tasks do T1.2.

### EC-4: `manager.register(adapter)` chamado APÓS `manager.dispose()` aceita silenciosamente
- **Task afetada:** T1.2
- **Família:** State / Lifecycle
- **Cenário:** User chama `manager.dispose()` (test ou código de erro), depois `manager.register(newAdapter)`. Set adiciona o adapter; `dispose()` posterior é no-op (idempotent flag), então `newAdapter` nunca é drenado. Path raro em produção (process morrendo) mas comum em tests sem reset.
- **Teste sugerido:** `test_register_after_dispose_throws()` — Given `manager.dispose()` called, When `manager.register({ name, dispose })`, Then throws `'StorageManager is disposed'` (mirroring `usePostgres` behavior).
- **Fix no código:** 2 linhas em `register()`:
  ```ts
  if (this.#disposed) throw new Error('StorageManager is disposed')
  this.#adapters.add(adapter)
  ```

### EC-5: Factory retornando objeto sem `.end()` (PG) ou sem `quit()/disconnect()` (Redis)
- **Task afetada:** T1.2
- **Família:** Type / Duck-typing
- **Cenário:** TS structural typing aceita `factory: () => ({ query: () => ... })` (sem `.end`). `dispose()` duck-types: `if (p.end !== undefined) p.end()`. Pool sem `.end` é silenciosamente skipped no drain — pool real fica aberto. Mais grave para Redis: se `quit` está undefined, `c.quit()` throws TypeError.
- **Teste sugerido:** `test_dispose_skips_pool_without_end()` — Given factory returns `{ query }` sem `end`, When `manager.dispose()`, Then resolves sem throw + warn opcional logado. `test_useRedis_factory_missing_quit_throws_at_dispose()` — Given factory returns `{}` (RedisLike unsatisfied), When `dispose()`, Then captura erro em catch + log + continua.
- **Por que não MUST FIX:** TypeScript já força `RedisLike` shape no factory signature; user com `as` cast contornando é deliberadamente bypassando type safety. Test confirma graceful behavior.

### EC-6: `InMemoryUsageStorage` implementando 2 interfaces — possível colisão de campo `name`
- **Task afetada:** T2.3
- **Família:** Type / Interface
- **Cenário:** Classe implementa `UsageStorageAdapter` (já existente) + `StorageAdapter` (novo). Se `UsageStorageAdapter` tiver um campo `name` com semântica diferente (ex.: tipo enum), a fusão causa erro de assignability. Improvável (UsageStorageAdapter atual provavelmente não tem `name`) mas type-test antes de implementar evita rework.
- **Teste sugerido:** `test_in_memory_usage_satisfies_both_interfaces()` — type test usando `expectTypeOf<InMemoryUsageStorage>().toExtend<UsageStorageAdapter & StorageAdapter>()`. Já listado em RED tests de T2.3 mas explicitar `& StorageAdapter` na assertion.

---

## DOCUMENT

### EC-7: `manager.dispose()` chamado fora do contexto SIGTERM não tem timeout interno
- **Task afetada:** T1.2, T3.1
- **Risco aceito:** D5 já decide que drain é em paralelo via `Promise.all`. Se um `pool.end()` hangar indefinidamente, `manager.dispose()` hangará indefinidamente. **Em produção isso só importa via SIGTERM** — `start.ts:443-446` envolve com `setTimeout(force-exit, 25_000)`. Fora desse caminho (testes que chamam dispose direto, scripts custom), o caller é responsável por timeout. Adicionar timeout interno no manager seria over-engineering (rules: KISS prevalece). Documentar no concept doc T4.1.
- **Nota a adicionar em T4.1:** "Em paths não-SIGTERM, envolva `manager.dispose()` em `Promise.race([dispose(), timeout()])` se precisar de bound."

### EC-8: Vite HMR em dev re-evalua o módulo do manager → singleton pode duplicar
- **Task afetada:** T1.2, T3.1 (dev.ts opcional)
- **Risco aceito:** ESM imports re-rodam em HMR. `let __singleton` no module scope é re-declarado → user code antigo aponta para a singleton anterior; novo código aponta para uma nova. Pools da singleton velha vazam até o processo morrer. **Aceitável porque:** (a) prod usa `start.ts` (sem HMR); (b) dev geralmente roda com in-memory adapters sem pool real; (c) padrão Next.js de "`globalThis.__manager` em dev" pode ser adotado como follow-up se demanda real aparecer. Documentar no concept doc T4.1.
- **Nota a adicionar em T4.1:** "Em dev com Vite HMR, prefira adapters in-memory. Se usar PG/Redis em dev, considere persistir o manager via `globalThis.__theoStorageManager` (padrão Next.js)."

### EC-9: SIGKILL (não SIGTERM) → nenhum drain
- **Task afetada:** T3.1
- **Risco aceito:** Plataformas como K8s usam SIGKILL após `terminationGracePeriodSeconds` (default 30s) se SIGTERM não terminou. Por design, processo é morto sem chance de drain. **Aceitável porque:** (a) plataforma LB já tirou pod de rotação antes; (b) servidores PG/Redis têm idle timeouts e fecham conexões órfãs; (c) prevenir SIGKILL exige que drain caiba dentro do force-exit 25s — já garantido. Documentar no concept doc T4.1.
- **Nota a adicionar em T4.1:** "SIGKILL pula o drain; PG/Redis fecham conexões órfãs por idle timeout em ~5min. Se seu deploy tem latência maior, ajuste `terminationGracePeriodSeconds` no manifesto."

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T0.2 | 0 | 0 | 0 | 0 |
| T1.1 | 2 | 0 | EC-1, EC-2 | 0 |
| T1.2 | 4 | 0 | EC-3, EC-4, EC-5 | EC-7, EC-8 |
| T1.3 | 0 | 0 | 0 | 0 |
| T2.1 | 0 | 0 | 0 | 0 |
| T2.2 | 0 | 0 | 0 | 0 |
| T2.3 | 1 | 0 | EC-6 | 0 |
| T3.1 | 1 | 0 | 0 | EC-9 |
| T4.1 | 0 | 0 | 0 | (EC-7, EC-8, EC-9 notes added here) |
| T4.2 | 0 | 0 | 0 | 0 |
| **Total** | **9** | **0** | **6** | **3** |

**Veredicto: PLANO OK.** Zero MUST FIX. Os 6 SHOULD TEST adicionam ≤ 6 linhas de teste cada (todos enxertáveis nos TDD blocks já presentes em T1.1/T1.2/T2.3). As 3 DOCUMENT viram 3 frases no concept doc T4.1. Nenhuma mudança estrutural no plano.

## Ações sugeridas no plano (incorporação opcional)

Estes não são MUST FIX — apenas refinamentos enxertáveis:

1. **T1.1 RED tests**: adicionar `test_schema_silently_drops_unknown_keys` (EC-1) e `test_dangling_server_reference_only_throws_on_use` (EC-2).
2. **T1.2 RED tests**: adicionar `test_register_after_dispose_throws` (EC-4 + 2 linhas de fix em `register()`); adicionar `beforeEach(__resetForTests)` no setup do test file (EC-3); adicionar `test_dispose_skips_pool_without_end` (EC-5).
3. **T2.3 RED tests**: ajustar type test para `expectTypeOf<...>().toExtend<UsageStorageAdapter & StorageAdapter>()` (EC-6).
4. **T4.1 concept doc**: 3 parágrafos cobrindo EC-7 (dispose fora SIGTERM), EC-8 (HMR dev), EC-9 (SIGKILL).

Custo total: ~15 linhas de código + 3 parágrafos de doc. Recomendo incorporar.
