# Edge Case Review — architecture-review-remediation

Data: 2026-05-23
Tasks analisadas: 18 (T0.1, T0.2, T1.1, T2.1, T3.1, T3.2, T3.3, T3.4, T4.1, T4.2, T4.3, T4.4, T5.1, T6.1, T6.2, T6.3, T6.4, T6.5)
Edge cases encontrados: 23 (MUST FIX: 5, SHOULD TEST: 12, DOCUMENT: 6)

---

## MUST FIX

### EC-1: T3.4 vs T5.1 — ambos modificam `execute.ts`, ordering quebra
- **Task afetada:** T3.4 + T5.1
- **Família:** State / Sequencing
- **Cenário:** T3.4 extrai `handleRouteError` consolidando 4 catch blocks em `execute.ts:404`. T5.1 reescreve `executeRoute` como Pipeline — os 4 catch blocks podem deixar de existir (cada stage tem try/catch próprio, ou `runStages` tem 1 catch unificado). Se T3.4 roda primeiro, T5.1 vai re-tocar tudo. Se T5.1 roda primeiro, T3.4 vira no-op ou aplica em código diferente.
- **Impacto:** Conflitos de merge garantidos. Trabalho duplicado. Risco de perda de behavior se um catch específico não tiver equivalente no novo pipeline.
- **Fix sugerido:** Reordenar dependency graph: **Phase 5 (T5.1) deve rodar ANTES de T3.4**, OU T3.4 vira sub-task de T5.1 (catch helper extraído junto com o Pipeline refactor). Atualizar §"Dependency Graph" do plano: "T3.4 depends on T5.1" explícito.

### EC-2: Phase 1 CI guards podem FAIL no commit inicial
- **Task afetada:** T1.1
- **Família:** State / CI
- **Cenário:** T1.1 escreve `.dependency-cruiser.cjs` encoding os 16 edges + 11 modules da architecture.md v2. Mas o plano assume que código atual JÁ respeita essas regras. O audit Phase 5 detectou 10 "rule violations" — eles eram contra a doc STALE. Contra a v2 talvez sejam 0... ou não. Sem rodar dep-cruiser local primeiro, o primeiro commit do CI guard pode falhar.
- **Impacto:** PR de T1.1 vermelha. Trabalho pra entender por que. Pode forçar relaxar regras (e perder enforcement) OU corrigir 5+ violations imediatamente (out of scope para T1.1).
- **Fix sugerido:** T1.1 deve incluir step 1 explícito: "Rodar `dependency-cruiser --output-type err` no source atual ANTES de escrever o config. Se houver violations contra a v2, ou (a) refletir realidade no config (regras permissivas), OU (b) abrir task adicional T1.2 'fix N violations to enable strict CI'. Decisão documentada no commit."

### EC-3: T2.1 — tests/fixtures com deep imports quebram silenciosamente
- **Task afetada:** T2.1
- **Família:** Boundary / Type
- **Cenário:** Plano diz "Downstream consumers (`tests/`, `examples/`, `fixtures/`): they import from `theokit/server`. ZERO change for them." Mas grep `from '.*server/execute'` em tests/ provavelmente retorna ≥1 match (testes unitários do executeRoute importam direto, não via barrel). Quando server/execute.ts vira server/http/execute.ts, esses imports quebram.
- **Impacto:** `pnpm typecheck` falha em arquivos não-listados no plano. Refactor "invisível" deixa de ser invisível.
- **Fix sugerido:** Acrescentar à seção "Deep file dependency analysis" de T2.1: "Step 0: `grep -rln \"from.*packages/theo/src/server/[a-z-]*\\.js\\\"\" tests/ examples/ fixtures/` — enumerar TODOS os deep-import sites + atualizá-los como parte de T2.1 (não em task separada)." Adicionar RED test: `test_no_deep_server_imports_outside_packages` (grep, falha se ≥1).

### EC-4: T2.1 — `package.json exports` pode expor paths que renaming quebra
- **Task afetada:** T2.1
- **Família:** Boundary / Backward Compat
- **Cenário:** `packages/theo/package.json` declara exports `theokit`, `theokit/server`, `theokit/vite-plugin`, etc. Plano assume ZERO deep export. Mas o plano não confirma — só lista os top-level exports. Se existe um `./server/scan` ou similar entry, mover scan/ quebra consumidores npm reais.
- **Impacto:** Versão next.0 publicada quebra apps em produção. Bug invisível em dev (workspace symlinks).
- **Fix sugerido:** T2.1 step 0 adicional: "Inspecionar `packages/theo/package.json` exports — confirmar que NENHUM expõe path interno como `./server/<file>`. Se algum expor, atualizar exports map junto com o move (ou rejeitar o split desse arquivo específico)." RED test: `test_package_json_no_deep_server_exports` (parse + assert keys).

### EC-5: T5.1 — plugin hooks (onRequest/onResponse/onError) podem perder ordem
- **Task afetada:** T5.1
- **Família:** State / Ordering
- **Cenário:** `executeRoute` atual chama `pluginRunner.runOnRequest` em ponto X, `runOnResponse` em ponto Y (success path), `runOnResponse(inErrorPath=true)` em ponto Z (error path). O Pipeline refactor pode invocá-los em pontos diferentes (ex: hook entre stages vs hook só antes/depois). Phase 4 (patterns audit) confirmou Chain of Responsibility = applied_correctly — quebrar essa ordem é uma regressão silenciosa.
- **Impacto:** Plugins testados nos integration tests passam, mas plugins externos (consumer code) podem depender de hooks rodando em pontos específicos. Ex: plugin de logging que conta `onRequest` calls vai contar errado se o hook moveu de pré-stage para pós-stage.
- **Fix sugerido:** Adicionar a T5.1 RED test explícito: `test_pipeline_preserves_plugin_hook_ordering` — usa plugin com 3 hooks que registram ordem em array; assert que array tem mesma sequência que executeRoute atual (snapshot test). Doc em Deep Dives da T5.1: "Pipeline NÃO muda quando/quantas vezes `pluginRunner.run*` é chamado. Hooks rodam nos mesmos boundaries: onRequest antes do invokeHandlerStage, onResponse após. onError envolvido por runStages (não por cada stage individual)."

---

## SHOULD TEST

### EC-6: T0.1 — ADR file location ambiguity
- **Task afetada:** T0.1
- **Teste sugerido:** `test_adr_lives_in_canonical_dir()` — Given `docs/adr/` exists, Then ADR-0001 moves to `docs/adr/0001-*.md`. Else stays in `architecture-output/adr-suggestions/` and a redirect note added to `CLAUDE.md`. Either decision tested, but ONE must be made.

### EC-7: T0.2 — file inventory drift since audit
- **Task afetada:** T0.2
- **Teste sugerido:** `test_cli_lib_files_all_moved()` — Given `ls packages/theo/src/cli/lib/` before rename returned N files, When rename done, Then `ls packages/theo/src/cli/cleanup/` returns the same N filenames. Audit said 2 files; verify before assuming.

### EC-8: T1.1 — ls-lint regex syntax verification
- **Task afetada:** T1.1
- **Teste sugerido:** `test_ls_lint_accepts_react_hook_naming()` — given a mock file `tests/fixtures/_lint-check/useFoo.ts`, When `pnpm exec ls-lint --config .ls-lint.yml`, Then exit 0. Verify the regex syntax in the YAML actually works with `@ls-lint/ls-lint`'s parser (docs say `regex:`, but the precise syntax for compound patterns varies).

### EC-9: T2.1 — barrel-mediated cycles
- **Task afetada:** T2.1
- **Teste sugerido:** `test_sub_barrels_do_not_cross_import()` — Given each `server/<sub>/index.ts`, When inspected, Then it ONLY re-exports from files inside the same sub-folder (no `from '../other-sub/...'`). Cross-sub composition goes through `server/index.ts` only. Catches the easy way to introduce indirect cycles.

### EC-10: T2.1 — body-parser/transformer "root files" placement
- **Task afetada:** T2.1
- **Teste sugerido:** `test_root_server_files_justified()` — assert that the list of files allowed at `server/` root is EXACTLY {`index.ts`, `_internal/`, `body-parser.ts`, `transformer.ts`, `plugin-types.ts`, `serialization.ts`}. Anything else → fail. Forces conscious decision when adding new root file.

### EC-11: T3.1 — symlink loop hang in walker
- **Task afetada:** T3.1
- **Teste sugerido:** `test_walker_skips_symlink_loop()` — Given temp dir with `a/ → b/`, `b/ → a/` symlinks, When `walkSourceFiles` called, Then completes within 1s (not hang). Implementation: track visited inodes via `fs.statSync().ino`; skip if revisit. 3 LOC.

### EC-12: T3.2 — broader cookie-parser duplicate detection
- **Task afetada:** T3.2
- **Teste sugerido:** `test_no_inline_cookie_parsing()` — `grep -rln "headers.cookie\\?.split\\|headers\\['cookie'\\].split" packages/theo/src/server/` returns ZERO matches after refactor. Catches alt-syntax dupes the plan's narrow grep missed.

### EC-13: T4.1 — TS overload ambiguity (engine vs config)
- **Task afetada:** T4.1
- **Teste sugerido:** `test_define_cached_route_overload_resolves_unambiguously()` — type test via `expectTypeOf`: `defineCachedRoute(engine, config)` resolves to RouteConfig. `defineCachedRoute(config)` resolves to RouteConfig. Mixed `defineCachedRoute(legacyConfig as any, anotherConfig)` either errors at compile time OR resolves to canonical shape. NO silent miscompile.

### EC-14: T4.4 — InMemoryCacheAdapter satisfies full union after split
- **Task afetada:** T4.4
- **Teste sugerido:** `test_in_memory_adapter_implements_admin_too()` — type test: `expectTypeOf<InMemoryCacheAdapter>().toMatchTypeOf<CacheStore & CacheStoreAdmin>()`. Existing tests that call `.size()` / `.clear()` must continue to compile.

### EC-15: T5.1 — AsyncLocalStorage / request-scoped state preserved
- **Task afetada:** T5.1
- **Teste sugerido:** `test_request_id_propagates_through_pipeline()` — Given handler that calls `getRequestId()` (or whatever request-scoped helper exists), When pipeline runs, Then handler sees the same requestId that csrfStage observed earlier. Catches lost AsyncLocalStorage context.

### EC-16: T5.1 — Streaming/SSE response in Pipeline
- **Task afetada:** T5.1
- **Teste sugerido:** `test_pipeline_handles_streaming_response()` — Given handler returning `new Response(readableStream, { headers: { 'content-type': 'text/event-stream' } })`, When pipeline runs, Then stream proxied to client without buffering. invokeHandlerStage is terminal for streaming — no later stage can consume the body.

### EC-17: T6.5 — dead code grep must include examples/fixtures/tests
- **Task afetada:** T6.5
- **Teste sugerido:** `test_no_serialization_consumers_outside_pkg()` — `grep -rln "serializeResponse\\|deserializeResponse" examples/ fixtures/ tests/` returns ZERO before deletion. Plan only greps `packages/`, but framework consumers could legitimately import these.

---

## DOCUMENT

### EC-18: T0.1 — choose ADR location (docs/adr/ or architecture-output/)
- **Risco aceito:** Either is fine. The plan must pick one. Document choice in CLAUDE.md "Architectural decisions on record" section so future ADRs land in the same place. **Recommendation:** create `docs/adr/` since `architecture-output/` is gitignored-or-similar (audit output, not source-of-truth).

### EC-19: T3.1 — sequential walker is intentional
- **Risco aceito:** Plan's RED test `test_walker_async_callback_awaited` asserts sequential. Parallel walker would be faster but breaks predictable route precedence (route order matters when multiple files match). Document in JSDoc of `walkSourceFiles`: "Sequential by design — callers depend on insertion order for precedence."

### EC-20: T3.1 — Windows MAX_PATH unsupported
- **Risco aceito:** TheoKit doesn't target Windows (CLAUDE.md macro roadmap = Node.js/edge/CF Workers/Vercel). Plan's walker uses `readdir` which works on Windows but fails on paths > 260 chars. Document in JSDoc: "Tested on macOS/Linux. Windows long-path support not validated."

### EC-21: T4.2 — promoting tryReadCached expands public API
- **Risco aceito:** Was private, becomes public. Cannot be removed without major bump. Plan implicitly accepts this for DRY. Document in CHANGELOG: "Added: `engine.tryReadCached(key, opts)` — was private, now public to support route wrapper delegation. Stable contract."

### EC-22: T4.3 — RouteCacheCtx redundancy with user config
- **Risco aceito:** `RouteCacheCtx` carries 9 fields, several derived from user's `cache` config. Constructing the ctx for every request is redundant work. Acceptable: ctx construction is O(1) per request, request handling is the slow path anyway. Document in code comment.

### EC-23: CHANGELOG strategy — 1 entry per phase or 1 per release?
- **Risco aceito:** Global DoD says "CHANGELOG entry per phase" — 7 entries minimum. That's spam in CHANGELOG.md. Two paths: (a) one entry per phase in `[Unreleased]`, grouped into one minor bump at the end (Keep-a-Changelog supports this); (b) bundle all 7 phases into ONE entry. **Recommendation:** path (a) — granular history during development, single semver bump at release. Document in plan.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 2 | 0 | 1 (EC-6) | 1 (EC-18) |
| T0.2 | 1 | 0 | 1 (EC-7) | 0 |
| T1.1 | 2 | 1 (EC-2) | 1 (EC-8) | 0 |
| T2.1 | 4 | 2 (EC-3, EC-4) | 2 (EC-9, EC-10) | 0 |
| T3.1 | 3 | 0 | 1 (EC-11) | 2 (EC-19, EC-20) |
| T3.2 | 1 | 0 | 1 (EC-12) | 0 |
| T3.3 | 0 | 0 | 0 | 0 |
| T3.4 | 1 | 1 (EC-1 partial) | 0 | 0 |
| T4.1 | 1 | 0 | 1 (EC-13) | 0 |
| T4.2 | 1 | 0 | 0 | 1 (EC-21) |
| T4.3 | 1 | 0 | 0 | 1 (EC-22) |
| T4.4 | 1 | 0 | 1 (EC-14) | 0 |
| T5.1 | 3 | 1 (EC-5 + EC-1 partial) | 2 (EC-15, EC-16) | 0 |
| T6.1 | 0 | 0 | 0 | 0 |
| T6.2 | 0 | 0 | 0 | 0 |
| T6.3 | 0 | 0 | 0 | 0 |
| T6.4 | 0 | 0 | 0 | 0 |
| T6.5 | 1 | 0 | 1 (EC-17) | 0 |
| Cross-cutting | 1 | 0 | 0 | 1 (EC-23) |
| **Total** | **22** | **5** | **11** | **6** |

**Veredicto:** **PLANO PRECISA DE AJUSTE** — 5 MUST FIX antes do go-ahead. Os 5 são:

1. **EC-1** (ordering T3.4 ↔ T5.1) — reordenar dependency graph; T3.4 vira sub-task de T5.1 OU roda depois.
2. **EC-2** (CI guards podem fail) — T1.1 step 0 explícito: rodar dep-cruiser local primeiro.
3. **EC-3** (deep imports em tests/) — T2.1 step 0: grep+update deep imports atomicamente.
4. **EC-4** (package.json exports) — T2.1 step 0: confirmar zero deep exports antes do move.
5. **EC-5** (plugin hook ordering) — T5.1: snapshot test do hook order + doc invariante.

### Próximos passos

1. **Incorporar os 5 MUST FIX no plano:**
   - EC-1 → adicionar a §"Dependency Graph": "T3.4 depende de T5.1" + mover T3.4 para Phase 5 OU manter Phase 3 com nota explícita.
   - EC-2 → T1.1 Tasks step 0 + RED test "test_dep_cruiser_baseline_passes".
   - EC-3 → T2.1 Tasks step 0 + RED test "test_no_deep_server_imports_outside_packages".
   - EC-4 → T2.1 Tasks step 0 + RED test "test_package_json_no_deep_server_exports".
   - EC-5 → T5.1 Deep Dives + RED test "test_pipeline_preserves_plugin_hook_ordering".

2. **Adicionar 11 SHOULD TEST como RED tests** nas TDD+BDD sections respectivas.

3. **Incorporar 6 DOCUMENT items** em:
   - `CLAUDE.md` "Architectural decisions on record" (EC-18 ADR location)
   - JSDoc inline (EC-19, EC-20, EC-22)
   - CHANGELOG strategy section (EC-23) na Global DoD
   - CHANGELOG entry de T4.2 (EC-21)

4. **Re-rodar este review após incorporação** para confirmar 0 MUST FIX restantes.
