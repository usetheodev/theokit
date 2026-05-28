# Edge Case Review — architecture-medium-deferrals

Data: 2026-05-27
Tasks analisadas: 8 (T0.1, T1.1, T2.1, T2.2, T2.3, T3.1, T4.1, T4.2, T4.3)
Edge cases encontrados: 7 (MUST FIX: 2, SHOULD TEST: 4, DOCUMENT: 1)

---

## MUST FIX

### EC-1: `setupWsUpgrade` deve tolerar `server.httpServer === undefined`

- **Task afetada:** T2.3
- **Família:** Timing / Resource
- **Cenário:** Vite's `ViteDevServer.httpServer` é `Server | null` — pode ser `null` quando o dev server roda em middleware mode (sem HTTP próprio, e.g., embed em Express). O código atual em `vite-plugin/index.ts` provavelmente acessa `server.httpServer?.on('upgrade', ...)` com optional-chain. Se a extração for descuidada (e.g., `server.httpServer.on(...)`), middleware-mode crasha.
- **Impacto:** Cards de fail em embeds custom (Astro-style middleware mode). Plus quebra teste de fixture se algum existir.
- **Fix sugerido:** No `setupWsUpgrade(server, wsRoutes)`, primeiro check: `if (!server.httpServer) return` (3 lines max). Documentar no JSDoc que middleware-mode → no WS upgrade (consumer pode wire próprio handler).

---

### EC-2: T4.3 UPDATE WHERE clauses muito amplas (LIKE '%Tabs%')

- **Task afetada:** T4.3
- **Família:** State / Security
- **Cenário:** `UPDATE naming_violations WHERE examples LIKE '%Tabs%'` pode pegar qualquer row futura que mencione "Tabs" em examples (e.g., um audit que mencione `tabs-component.ts` em outro contexto). Same para LIKE '%vite-plugin/index.ts%' — se houver outras rows referenciando o arquivo, pegariam UPDATE genérico.
- **Impacto:** Data corruption no audit trail — rows não relacionadas marcadas resolved/INTENTIONAL.
- **Fix sugerido:** UPDATE by PK (finding ID) sempre que possível. Antes do UPDATE, fazer SELECT primeiro e printar o(s) row(s) afetado(s); abortar se count > expected. Em `mark-medium-deferrals-resolved.py`:
  ```python
  cur.execute("SELECT id, title FROM naming_violations WHERE scope LIKE 'devtools/components/Tabs%'")
  rows = cur.fetchall()
  if len(rows) > 1: print("ABORT: expected 1 Tabs row, found", len(rows)); sys.exit(1)
  ```

---

## SHOULD TEST

### EC-3: Lazy-import semantic preservada

- **Task afetada:** T1.1
- **Teste sugerido:** `test_adapter_registry_lazy_imports_per_target()` — Given `await resolveAdapter('node')`, When module load list inspected (via `process.moduleLoadList` ou similar), Then `vercel.js`, `cloudflare.js`, etc are NOT in the loaded set. Garantia: a refactor para `Record<...>` mantém o lazy-import (não eager).

### EC-4: `resolvePluginConfig` invocado uma única vez

- **Task afetada:** T2.1
- **Teste sugerido:** `test_resolve_plugin_config_called_once_per_dev_session()` — Given vite-plugin/index.ts post-extraction, When grep `resolvePluginConfig(` count, Then 1 match (single call site inside the `configLoadedOnce`-guarded `configResolved` hook). Garantia: a extração não duplica chamadas.

### EC-5: Vite plugin hook order preservada após extração SSR

- **Task afetada:** T2.2
- **Teste sugerido:** `test_ssr_dev_middleware_runs_in_correct_phase()` — Given fixtures/ssr-basic dev request, When intercept order is captured, Then `transformIndexHtml` runs BEFORE response is sent + AFTER react-vite plugin's transforms (preserved order via `enforce: 'post'` if needed). Garantia: SSR HTML não está vazio nem pré-React.

### EC-6: Dev WS upgrade shape espelha prod WS upgrade

- **Task afetada:** T2.3
- **Teste sugerido:** `test_dev_ws_upgrade_handler_shape_matches_prod()` — Given dev `ws-upgrade.ts` + prod `start-websocket-handler.ts`, When extracted shape compared, Then identical hook surface (`onOpen`, `onMessage`, `onClose`, `onError`). Garantia: dev/prod parity para o mesmo handler do user.

---

## DOCUMENT

### EC-7: YAML inline comment syntax em `.ls-lint.yml`

- **Risco aceito:** YAML usa `#` para comments. Como T3.1 adiciona apenas 1 linha de comment dentro do bloco existente, o risco de quebrar parsing é ~zero. Documentar: usar `# v3.1 ref:` no comment para grep-ability. Se ls-lint falhar com `Error: invalid YAML`, é trivial corrigir.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T1.1 | 1 | 0 | 1 (EC-3) | 0 |
| T2.1 | 1 | 0 | 1 (EC-4) | 0 |
| T2.2 | 1 | 0 | 1 (EC-5) | 0 |
| T2.3 | 2 | 1 (EC-1) | 1 (EC-6) | 0 |
| T3.1 | 1 | 0 | 0 | 1 (EC-7) |
| T4.1 | 0 | 0 | 0 | 0 |
| T4.2 | 0 | 0 | 0 | 0 |
| T4.3 | 1 | 1 (EC-2) | 0 | 0 |
| **TOTAL** | **7** | **2** | **4** | **1** |

**Veredicto:** PLANO OK COM AJUSTES MENORES — 2 MUST FIX, ambos com fix em ≤3 linhas. Após dobrá-los ao plano (T2.3 add `if (!server.httpServer) return` guard; T4.3 use PK-based UPDATE + abort-on-count-mismatch), plano fica pronto para execução em Ralph loop.

Nenhum dos MUST FIX exige nova abstração; todos resolvem-se com guards defensivos ou clauses mais específicas. Nada de scope creep.
