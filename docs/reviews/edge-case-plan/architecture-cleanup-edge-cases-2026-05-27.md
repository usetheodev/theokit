# Edge Case Review — architecture-cleanup

Data: 2026-05-27
Tasks analisadas: 14 (T0.1..T0.3, T1.1, T2.1..T2.3, T3.1, T4.1..T4.4, T5.1..T5.4)
Edge cases encontrados: 13 (MUST FIX: 5, SHOULD TEST: 5, DOCUMENT: 3)

---

## MUST FIX

### EC-1: T4.4 — `tsup.config.ts` não emite os subpath outputs declarados em `package.json`

- **Task afetada:** T4.4
- **Família:** Build / Boundary
- **Cenário:** O plano adiciona `"./server/auth": "./dist/server/auth/index.js"` em `package.json#exports`, mas `packages/theo/tsup.config.ts` atualmente só tem 8 entries (`index`, `server/index`, `vite-plugin/index`, `client/index`, `react-query/index`, `adapters/web-shim`, `adapters/ws-shim`, `devtools/entry`). Não há `server/auth/index`, `server/cache/index`, `server/jobs/index`, `server/crons/index`, `server/cost/index`.
- **Impacto:** Após `pnpm build`, os subpaths em `exports` apontam para arquivos inexistentes em `dist/`. Consumer faz `import {} from 'theokit/server/auth'` e recebe `ERR_MODULE_NOT_FOUND` em runtime. CI passa (porque `tsc --noEmit` lê de `src/`), mas o pacote publicado quebra.
- **Fix sugerido:** Adicionar a T4.4 a sub-task explícita "atualizar `tsup.config.ts` entry map com `'server/auth/index': 'src/server/auth/index.ts'` × 5 sub-barrels antes de mexer em `package.json#exports`. Acceptance criterion adicional: `ls dist/server/auth/index.js` retorna o arquivo após `pnpm build`."

---

### EC-2: T2.2 — `core/_internal/contracts/` viola a convenção `_internal/` = module-private

- **Task afetada:** T2.2
- **Família:** Type / Boundary
- **Cenário:** A convenção TheoKit usa `_internal/` para marcar "implementation detail privada do módulo" (`server/_internal/atomic-write.ts`, `server/_internal/scan-walker.ts`, `router/_internal/`). Os achados F-8, F-9, F-5 são edges INTER-MODULE (client→server, cache→server, devtools→router). Colocar contratos compartilhados sob `core/_internal/contracts/` exige que `cache`, `client`, `devtools` importem de um path marcado "privado" — convenção quebrada e sinal confuso para code review futuro.
- **Impacto:** Próximo PR adicionando um type compartilhado pode escolher `client/_internal/`, `server/_internal/` ou criar `shared/` — fragmentação de location. Além disso, T2.3 dep-cruiser provavelmente bloquearia importações para `*/_internal/*` (regra `no-deep-into-internal` é convencional), forçando exceção feia.
- **Fix sugerido:** Renomear `core/_internal/contracts/` → `core/contracts/` em todo o plano (T2.2, T3.1 ExecuteRouteContext, ADR-0001 v3 D3). 1 mudança de string em 5 lugares do plano.

---

### EC-3: T2.3 — Regra `no-cross-module-deep-import` precisa de exceção para `core/contracts/`

- **Task afetada:** T2.3
- **Família:** Boundary
- **Cenário:** O draft da rule `no-cross-module-deep-import` proíbe `cross-module/<file>.ts` que não seja `index.ts`. Após T2.2, módulos client/cache/devtools/server importam de `core/contracts/agent-events.js`, `core/contracts/route-config.js`, etc — esses caminhos NÃO são `core/index.js`. Sem exceção, dep-cruiser falha com violação artificial.
- **Impacto:** `pnpm check:deps` em vermelho permanente OU plano sai do ar com regra inutilizada. Phase 2 fica bloqueada.
- **Fix sugerido:** Em T2.3, na rule `no-cross-module-deep-import`, adicionar `pathNot: '^packages/theo/src/core/contracts/'` (exception explícita) OU `OR ^packages/theo/src/core/contracts/[^/]+\\.(ts|js)$` no path regex. 1 linha de config.

---

### EC-4: T5.3 — `.ls-lint.yml` sem ignore vai falhar em configs root e fixtures

- **Task afetada:** T5.3
- **Família:** Boundary / I/O
- **Cenário:** O sample no plano usa pattern `packages/theo/src/**/*.ts: kebab-case | PascalCase | camelCase` mas ls-lint também lê arquivos fora do escopo se não há ignore explícito. Arquivos como `tsup.config.ts` (root), `vite.config.ts`, `playwright.config.ts`, `fixtures/template-default/app/[id]/page.tsx` (dynamic routes com `[`) não casam com nenhuma convenção e quebram o gate `pnpm check:naming`.
- **Impacto:** CI vermelho em PRs que não tocam naming algum (regression em arquivos pré-existentes que eram intocáveis).
- **Fix sugerido:** No `.ls-lint.yml` da T5.3, adicionar bloco `ignore:` com `tests/`, `fixtures/`, `*.config.ts`, `*.config.cjs`, e regex para dynamic routes `\\[.+\\]\\.tsx?$`. ~6 linhas.

---

### EC-5: T1.1 — Public export `theoPlugin` precisa de teste de preservação de assinatura

- **Task afetada:** T1.1
- **Família:** Boundary / Integration
- **Cenário:** `vite-plugin/index.ts:151` exporta `theoPlugin(rootOrOptions?)` — usado por usuários em `vite.config.ts`. O plano move a LÓGICA para `core/build-helpers.ts createTheoVitePlugins`, e prevê que `theoPlugin` continua existindo como wrapper. Mas o plano não tem um teste DEDICADO à preservação da assinatura pública (apenas snapshot de `Plugin[]` output, que pode passar mesmo se a fachada `theoPlugin` desaparecer).
- **Impacto:** Refator quebra `theoPlugin` ou muda assinatura. Toda app que usa `theokit/vite-plugin` quebra silenciosamente em next install.
- **Fix sugerido:** Em T1.1 adicionar test RED explícito: `test_theoPlugin_public_signature_preserved() — Given import { theoPlugin } from 'theokit/vite-plugin', When called with 'rootStr' OR { root, ssr }, Then returns Plugin (single, not array) — same as today.` E garantir que `expectTypeOf<Parameters<typeof theoPlugin>>().toEqualTypeOf<[string | TheoPluginOptions | undefined]>()`.

---

## SHOULD TEST

### EC-6: T2.1 — Snapshot de `theokit/server` exports não pode mudar

- **Task afetada:** T2.1
- **Teste sugerido:** `test_theokit_server_public_exports_unchanged()` — Given importar `theokit/server` agregado, When `Object.keys()` extraído, Then identical set pré/pós T2.1 (4 types vêm de `services/types.ts` hoje: `ServiceDefinition, ServicesConfig, ServicesConfigInput, ServicesConfigOutput`; após T2.1 vêm via `services/index.ts` mas mesmo named export — snapshot deve passar).

### EC-7: T2.2 — Top-level `theokit` ainda exporta `AgentEvent`

- **Task afetada:** T2.2
- **Teste sugerido:** `test_AgentEvent_top_level_export_preserved()` — Given `import type { AgentEvent } from 'theokit'`, When type-checked from a fixture consumer, Then `expectTypeOf<AgentEvent>().toMatchTypeOf<{ type: string }>()` (estrutural). Garante que re-export chain `core/contracts/agent-events → server/agent/agent-types → server/index → theokit/index` não foi quebrada.

### EC-8: T3.1 — `route-runner` integration test deve passar após refactor de `executeRoute`

- **Task afetada:** T3.1
- **Teste sugerido:** `test_route_runner_invokes_executeRoute_with_context()` — Given um route fixture, When request chega via router, Then `executeRoute` é chamado uma vez com objeto-único (não 12 args). Hoje existe `tests/integration/http-pipeline.test.ts`; basta verificar que esse cobre a invocação real (não mockada) — se sim, citar; se não, criar.

### EC-9: T4.2 — Ordem de bootstrap stages é uma invariante

- **Task afetada:** T4.2
- **Teste sugerido:** `test_bootstrap_stage_order_invariant()` — Given a probe BootstrapContext que registra chamadas, When startCommand executado, Then ordem é: `agentRegistry → storageManager → jobBackend → cronRunner → httpServer`. JobBackend precisa de storage pronto; cron precisa de jobBackend. Sem teste explícito, alguém reordena por engano e produção quebra em runtime.

### EC-10: T4.3 — `warnOnce` dedup TTL pode quebrar contagens em tests existentes

- **Task afetada:** T4.3
- **Teste sugerido:** Antes de aplicar T4.3, rodar `grep -rn "toHaveBeenCalledTimes" tests/ | grep -i "warn"` para inventariar testes que checam contagem de warn. Se algum chama o mesmo event ≥2 vezes esperando 2 calls, `warnOnce` dedupes para 1 e o test quebra. `test_warnOnce_dedupes_repeat_events()` — Given mesmo event emitido 3× em janela curta, When checked, Then 1 emissão (TTL padrão warnOnce). Ajustar testes existentes que dependiam de `console.warn` ser não-dedup.

---

## DOCUMENT

### EC-11: T1.1 — `core/build-helpers.ts` importa `vite` + `@vitejs/plugin-react` (deps externas)

- **Risco aceito:** ADR-0001 invariante "core depends on nothing" refere-se a edges INTRA-monorepo. Importar deps externas (`vite`, `@vitejs/plugin-react`) é OK — elas vivem em `node_modules`, não no grafo de módulos. Documentar em uma frase no ADR-0001 v3: "`core/` may import npm packages; the no-deps invariant applies to internal `packages/theo/src/` modules only." Sem isso, próximo audit pode marcar como regression.

### EC-12: T2.3 — Squash do PR (ou single commit) evita CI vermelho intermediário

- **Risco aceito:** A nova config dep-cruiser só passa após T1.1+T2.1+T2.2. Se o PR tiver commits intermediários (T2.3 antes de T1.1 mergeado), `pnpm check:deps` no commit do meio falha. Documento: o PR de Phase 2 squasha em 1 commit OR T2.3 commitada por último na branch (CI roda só no head). Sem fix, é gestão de PR, não código.

### EC-13: T4.4 — Subpath exports exigem `moduleResolution: bundler | node16 | nodenext`

- **Risco aceito:** Consumers com TypeScript `moduleResolution: "node"` (classic) não resolvem `theokit/server/auth`. Migration guide (T4.4 já cita `docs/migration/0.3-to-0.4.md`) documenta o requisito. Pre-existing consumidores que importam apenas de `theokit/server` continuam funcionando em qualquer modo (backwards compat preserved).

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T0.2 | 0 | 0 | 0 | 0 |
| T0.3 | 0 | 0 | 0 | 0 |
| T1.1 | 2 | 1 (EC-5) | 0 | 1 (EC-11) |
| T2.1 | 1 | 0 | 1 (EC-6) | 0 |
| T2.2 | 2 | 1 (EC-2) | 1 (EC-7) | 0 |
| T2.3 | 2 | 1 (EC-3) | 0 | 1 (EC-12) |
| T3.1 | 1 | 0 | 1 (EC-8) | 0 |
| T4.1 | 0 | 0 | 0 | 0 |
| T4.2 | 1 | 0 | 1 (EC-9) | 0 |
| T4.3 | 1 | 0 | 1 (EC-10) | 0 |
| T4.4 | 2 | 1 (EC-1) | 0 | 1 (EC-13) |
| T5.1 | 0 | 0 | 0 | 0 |
| T5.2 | 0 | 0 | 0 | 0 |
| T5.3 | 1 | 1 (EC-4) | 0 | 0 |
| T5.4 | 0 | 0 | 0 | 0 |
| **TOTAL** | **13** | **5** | **5** | **3** |

**Veredicto:** PLANO PRECISA DE AJUSTE — 5 MUST FIX (todos com fix ≤ 3 linhas). Após dobrá-los ao plano (especialmente EC-1 tsup-config-entries, EC-2 rename `_internal/`→`contracts/`, EC-3 dep-cruiser exception, EC-4 ls-lint ignores, EC-5 theoPlugin public-API test), o plano fica OK para execução em Ralph loop.

Nenhum dos MUST FIX exige nova abstração; todos resolvem-se com 1-6 linhas adicionais em arquivos já listados no plano. Nada de scope creep — todas as correções vivem dentro das tasks já definidas.
