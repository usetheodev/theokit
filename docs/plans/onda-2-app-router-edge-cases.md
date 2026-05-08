# Edge Case Review — onda-2-app-router

Data: 2026-05-08
Tasks analisadas: 10 (T0.1, T1.1, T1.2, T2.1, T2.2, T3.1, T4.1, T5.1, T5.2)
Edge cases encontrados: 7 (MUST FIX: 2, SHOULD TEST: 3, DOCUMENT: 2)

## MUST FIX

### EC-1: generateRouteManifest — Layout sem Outlet import no código gerado
- **Task afetada:** T2.1
- **Familia:** Boundary
- **Cenario:** O código gerado importa `Outlet` de `react-router` no topo do manifest. Mas se a tree não tem nenhum layout, o import de `Outlet` é desnecessário (não é bug, mas gera warning de unused import em linters). Mais importante: se esquecermos de incluir o import de `Outlet` no generated code, os layouts crasham em runtime com `Outlet is not defined`.
- **Impacto:** Runtime crash — layouts não renderizam children.
- **Fix sugerido:** Garantir que `generateRouteManifest` SEMPRE inclui `import { Outlet } from 'react-router'` quando algum node tem `layout`. Adicionar teste: `test_layout_generates_outlet_import() — Given tree with layout, When generate, Then code contains "import { Outlet } from 'react-router'"`.

### EC-2: scanRoutes — page.tsx e page.ts no mesmo diretório
- **Task afetada:** T1.2
- **Familia:** Input
- **Cenario:** Dev tem `app/page.tsx` e `app/page.ts` no mesmo dir (copy/paste error, rename esquecido). O scan pode registrar ambos — o último a ser lido pelo `readdirSync` ganha, que é não-determinístico em filesystems.
- **Impacto:** Comportamento não-determinístico — às vezes pega `.tsx`, às vezes `.ts`.
- **Fix sugerido:** Enforce extension priority: iterar extensions em ordem `['.tsx', '.ts', '.jsx', '.js']` e parar no primeiro match. Adicionar teste: `test_extension_priority() — Given app/page.tsx AND app/page.ts, When scanRoutes, Then root.page ends with 'page.tsx'`.

## SHOULD TEST

### EC-3: generateRouteManifest — segment com caracteres especiais no variable name
- **Task afetada:** T2.1
- **Familia:** Type
- **Cenario:** Diretório `app/my-dashboard/page.tsx` gera segment `my-dashboard`. Se o variable name for `Page_my-dashboard`, é JavaScript inválido (hífens em identifiers). O plano menciona "hyphens → underscores" mas não tem teste explícito.
- **Teste sugerido:** `test_hyphenated_segment_safe_name() — Given segment 'my-dashboard', When generate, Then variable name is 'Page_my_dashboard' (underscores)`

### EC-4: layout.tsx sem Outlet — dev esquece de usar `<Outlet />`
- **Task afetada:** T4.1 (fixtures) / T5.2 (E2E)
- **Familia:** Boundary
- **Cenario:** Dev cria `layout.tsx` mas esquece de incluir `<Outlet />`. React Router renderiza o layout mas children ficam invisíveis. Não é crash — é silêncio (página em branco dentro do layout).
- **Teste sugerido:** Documentar nos fixtures que layout DEVE usar `<Outlet />` e incluir no template default. Não é um edge case do framework — é erro do dev. Documentar.

### EC-5: scanRoutes — diretório com apenas layout.tsx (sem page.tsx)
- **Task afetada:** T1.2
- **Familia:** Input
- **Cenario:** `app/admin/layout.tsx` existe mas `app/admin/page.tsx` não. O scanner inclui o node (tem layout). O manifest gera uma route com layout + Outlet mas sem index route. React Router mostra blank Outlet.
- **Teste sugerido:** `test_layout_only_dir_included() — Given app/admin/layout.tsx (no page), When scanRoutes, Then admin child exists with layout set and page undefined`

## DOCUMENT

### EC-6: CSR 404 — browser mostra "flash" antes de not-found
- **Task afetada:** T5.2
- **Familia:** Timing
- **Risco aceito:** Em CSR mode, navegar para `/xyz` primeiro carrega `index.html` (200), depois JavaScript executa, React Router resolve para wildcard, e renderiza `not-found.tsx`. Há um "flash" entre o HTML vazio e o not-found renderizado. Isso é inerente ao CSR — SSR na Onda futura resolve. Não tratar agora.

### EC-7: Playwright multi-server — ports podem conflitar com processos locais
- **Task afetada:** T5.2
- **Familia:** Resource
- **Risco aceito:** O plano usa portas fixas (3457, 3458, 3459) para os webServers do Playwright. Se alguma dessas portas estiver em uso, Playwright falha. Risco baixo em CI (clean environment). Em dev local, Vite tenta próxima porta disponível (sem `strictPort`). Aceitável.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T1.1 | 0 | 0 | 0 | 0 |
| T1.2 | 2 | 1 (EC-2) | 1 (EC-5) | 0 |
| T2.1 | 2 | 1 (EC-1) | 1 (EC-3) | 0 |
| T2.2 | 0 | 0 | 0 | 0 |
| T3.1 | 0 | 0 | 0 | 0 |
| T4.1 | 1 | 0 | 1 (EC-4) | 0 |
| T5.1 | 0 | 0 | 0 | 0 |
| T5.2 | 2 | 0 | 0 | 2 (EC-6, EC-7) |

**Veredicto: PLANO PRECISA DE AJUSTE** — 2 MUST FIX devem ser incorporados.

### Ajustes necessários no plano:

1. **T1.2 (scanRoutes):** Adicionar extension priority e teste `test_extension_priority()` (EC-2). Adicionar teste `test_layout_only_dir()` (EC-5).
2. **T2.1 (generateRouteManifest):** Adicionar teste que verifica `Outlet` import no código gerado quando layout existe (EC-1). Adicionar teste `test_hyphenated_segment_safe_name()` (EC-3).
