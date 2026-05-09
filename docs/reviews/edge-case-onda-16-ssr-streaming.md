# Edge Case Review — onda-16-ssr-streaming

Data: 2026-05-09
Tasks analisadas: 7
Edge cases encontrados: 4 (MUST FIX: 2, SHOULD TEST: 1, DOCUMENT: 1)

## MUST FIX

### EC-1: renderToPipeableStream onShellError leaves response hanging
- **Task afetada:** T2.1
- **Família:** State / Resource
- **Cenário:** `renderToPipeableStream` has two error callbacks: `onShellError` (shell couldn't render — fatal, before any HTML sent) and `onError` (error during streaming, after shell sent). The plan only mentions `onShellReady` and a generic try/catch. If `onShellError` fires, `pipe` is never returned, and the Promise never resolves — the response hangs forever.
- **Impacto:** Hung connections on SSR errors. Client sees infinite loading.
- **Fix sugerido:** In the `generateEntryServer()` code, handle `onShellError` in the `renderToPipeableStream` options: `onShellError(err) { reject(err) }`. The caller in start.ts already catches and falls back to CSR. Add `onShellError` to the generated entry-server code.

### EC-2: HTML split on `<div id="root">` may match wrong div
- **Task afetada:** T2.1
- **Família:** Boundary / Input
- **Cenário:** The plan splits `index.html` on the string `<div id="root">`. But the user's `index.html` might have attributes on the root div (e.g., `<div id="root" class="app">`) or use single quotes (`<div id='root'>`). A simple `split('<div id="root">')` would fail to match.
- **Impacto:** SSR falls back to CSR silently because split produces wrong head/tail.
- **Fix sugerido:** Use regex: `indexHtml.split(/<div id=["']root["'][^>]*>/)` — handles attributes and quote styles. Add test for this.

## SHOULD TEST

### EC-3: Components using `window`/`document` crash SSR
- **Task afetada:** T2.1, T3.1
- **Teste sugerido:** `test_ssr_fallback_on_window_reference()` — Given component that accesses `window.innerWidth`, When SSR renders, Then falls back to CSR (not crash). This is the most common SSR error in real apps. The plan mentions CSR fallback (ADR D5) but has no specific test for this scenario. Add a fixture with a `window`-accessing component.

## DOCUMENT

### EC-4: Hydration mismatch warnings in development
- **Risco aceito:** When SSR HTML doesn't exactly match what React renders on client (e.g., dates, random IDs), React logs hydration mismatch warnings. These are noisy but not fatal — React 19 is more tolerant of mismatches. Not worth suppressing or handling — just document as expected behavior.

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T0.2 | 1 | 1 (EC-1) | 0 | 0 |
| T0.3 | 0 | 0 | 0 | 0 |
| T1.1 | 0 | 0 | 0 | 0 |
| T2.1 | 2 | 1 (EC-2) | 1 (EC-3) | 0 |
| T3.1 | 0 | 0 | 0 | 0 |
| General | 1 | 0 | 0 | 1 (EC-4) |

**Veredicto:** PLANO PRECISA DE AJUSTE — 2 MUST FIX (EC-1: onShellError, EC-2: HTML split regex).
