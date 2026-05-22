# TheoUI Default Integration — Progress Tracker

Persistent state across Ralph Loop iterations.

## Decisões revisadas (iter 1, confirmado com user)

**TheoUI é DEPENDENCY apenas do template default — NÃO do package `theokit`.**

- `theokit` package core: ZERO referência a `@usetheo/ui`. Sem devDep, sem import, sem re-export.
- `templates/default/package.json.tmpl`: lista `@usetheo/ui` em `dependencies` (apps gerados puxam).
- `vite-plugin/index.ts`: detecta TheoUI no `node_modules` do **projeto user** (via `require.resolve` com `paths: [projectRoot]`). Quando detected, auto-injeta CSS + ThemeProvider no entry-client gerado.
- `AgentEvent` runtime variant: vive 100% em `packages/theo/src/server/agent-types.ts`. ZERO relação com tipos de TheoUI. Consumer code mapeia runtime→visual quando renderiza.

**ADR D3 do plano original DESCARTADO.** Razão: requeria 2-package coordination que o user não quer. TheoKit é standalone framework; TheoUI é dep do output (scaffold), não da framework engine.

**ADR D1 mantido.** TheoUI como dep direta do template.

Single-source-of-truth simplificado: TheoKit owns runtime variant (server emits, client consumes). TheoUI owns visual rows (timeline component shape). Sem coupling de tipos entre packages.

## Task status

| Task | Status | Notes |
|---|---|---|
| Phase 0 — Architecture snapshot | SKIP (optional) | baselines exist post-gap-closure |
| T1.1 AgentEvent type (revised) | **DONE (iter 1)** | `agent-types.ts` em TheoKit + re-export server + client; 6 type tests |
| T2.1 Detect TheoUI presence | **DONE (iter 2)** | `theoui-detect.ts` + schema `ui` field; require.resolve EC-1; EC-5; 8 tests |
| T2.2 Inject CSS imports | **DONE (iter 3)** | `generateEntryClient` aceita opts.theoUi; EC-2 (entry-server NUNCA CSS); 7 tests |
| T2.3 Wrap ThemeProvider | **DONE (iter 3)** | `generateEntryClient` envolve RouterProvider em `<TheoUIProvider theme={{ defaultTheme }}>`; 6 tests; usa TheoUIProvider (composição idiomática) ao invés de ThemeProvider cru |
| T3.1 Template agent surface | **DONE (iter 4)** | template default: @usetheo/ui dep + AgentComposer/AgentTimeline + mock chat SSE; EC-11 doc; 8 tests |
| T4.1 --bare flag | **DONE (iter 5)** | `bare-transform.ts` + ScaffoldOptions + cli --bare; EC-4 atomic rollback via try/rmSync; 7 tests |
| T5.1 defineAgentEndpoint | **DONE (iter 6)** | `define-agent-endpoint.ts` wraps async generator → SSE Response; EC-7 abort + EC-12 doc; 7 tests |
| T5.2 useAgentStream | **DONE (iter 6)** | `agent-stream-core.ts` (pure SSE parser+fetch loop) + `use-agent-stream.ts` (React glue); EC-3 fetch+ReadableStream (no EventSource); EC-8 unmount abort; 12 tests |
| Phase 6 Dogfood | **DONE (iter 6)** | 4 novos checks (#16–19) cobrindo template TheoUI default, auto-injection, --bare opt-out, agent endpoint+hook surfaces. Score 19/19 PASS. |

## Promise

`TODAS AS TASKS, CRITERIOS DE ACEITES E DODS CONCLUIDOS E VALIDADOS` — **TRUE** (9/9 tasks DONE, dogfood 41/41, suite 1237/1237, zero TS errors, **cross-validation APROVADO 2026-05-18**).

## Iter 8 — 2026-05-18 (Formal Cross-Validation closure)

Validação final do plano contra implementação, linha por linha (skill `cross-validation`).

- ADRs: 7/7 conformes (D3 descartado em iter 1 por decisão explícita do user — não é divergência).
- Tasks: 9/9 conformes.
- DoD: 14/14 itens satisfeitos (incluindo o checklist plan-specific completo).
- Coverage Matrix: 10/10 gaps cobertos.
- Edge cases: 12/12 resolvidos ou documentados conforme planejado.
- Divergências: 0 BLOCKER, 0 CRITICAL, 0 MAJOR, 0 MINOR, 1 INFO (drift positivo no dogfood).

**Veredicto: APROVADO (100%).** Report em `docs/reviews/cross-validation/theoui-default-integration-xval-2026-05-18.md`.

Validation snapshot 2026-05-18:
- `npx tsc --noEmit` → zero errors
- `npx vitest run` → 1237/1237 PASS (163 files)
- `bash scripts/dogfood-smoke.sh` → 41/41 PASS (Health 100%, target era ≥85%)
- Os 4 theoui-specific dogfood gates (#16-19) intactos.

## Iter 7 — 2026-05-17 (Real smoke test — found 3 bugs, all fixed)

**Smoke manual end-to-end revelou 3 bugs que os unit tests não pegaram.**

1. **Template apontava para `theokit@^0.1.0-alpha.2` (versão inexistente no npm).** Bug introduzido por mim na iter 4 sem justificativa. Fix: reverti para `^0.1.0-alpha.1` que existe.

2. **`detectTheoUi` usava `require.resolve('@usetheo/ui/package.json')` — falhava em runtime.** O package `@usetheo/ui` define `exports` field sem expor `./package.json`, então o resolve sempre falhava. Fix: troquei para subpath confiável (`@usetheo/ui/styles.css`, `@usetheo/ui/fonts.css`) que está em `exports`.

3. **`detectTheoUi` detectava `@usetheo/ui` falsamente em fixtures monorepo.** Node module resolution caminha pra cima a partir do `import.meta.url` do detect, ignorando `paths: [projectRoot]` como restrição exclusiva. Em fixtures (`onda1-hello-theo`) sem dep declarada, o resolve achava o `@usetheo/ui` do workspace e gerava entry-client com import que falhava 500. Fix: gate conservativo — antes de resolver, lê `<projectRoot>/package.json` e verifica que `@usetheo/ui` está em `dependencies`/`devDependencies`/`peerDependencies`. Pnpm hoist continua funcionando porque a consumer's package.json mantém a declaração mesmo quando install vai pro workspace root.

**Refatoração colateral:** `detectTheoUi(root, raw, resolver?)` — resolver agora é injetável (DIP) para testes isolarem com determinismo. Refatorei `vite-plugin-theoui-detect.test.ts` para usar tmp dirs reais + stubs (de 8 para 13 tests, com novos casos: declared-but-not-installed, malformed package.json, devDependencies).

**Smoke real (com workspace linkado a my-test):**
- `pnpm try:scaffold` → cria projeto OK com `@usetheo/ui` + agent surface
- `pnpm dev` → server sobe em http://localhost:3005
- `GET /` → HTML 200
- `GET /@theo/entry-client` → contém `import "@usetheo/ui/styles.css"`, `import "@usetheo/ui/fonts.css"`, `import { TheoUIProvider }` + wrap em `createRoot().render()`
- `POST /api/chat` → 3 SSE events corretos, Content-Type `text/event-stream`
- `GET /app/page.tsx` → compilado com `AgentComposer` + `AgentTimeline` import OK

Validation: vitest 946 passed, tsc 0 errors, dogfood 19/19.

## Iter 6 — 2026-05-17 (CLOSURE — superseded by iter 7)

**Phase 5 + Phase 6 DONE. Plan COMPLETE.**

**Phase 6 Dogfood QA:** Added 4 new checks to `scripts/dogfood-smoke.sh` (now 19/19 instead of 15/15):
- #16 TheoUI in default template (`@usetheo/ui` dep + `AgentTimeline` + `server/routes/chat.ts`)
- #17 Auto-injection wiring (`theoui-detect.ts` + `TheoUIProvider` + `styles.css` in entry.ts)
- #18 `--bare` opt-out (`applyBareTransform` + flag parsing + EC-4 `rmSync` rollback)
- #19 Agent surfaces (`defineAgentEndpoint` + `useAgentStream` + `consumeAgentStream` exported)

Validation: dogfood-smoke 19/19, vitest 941/941, tsc 0 errors.

**T5.1 + T5.2 DONE. Phase 5 COMPLETE.**

**T5.1 defineAgentEndpoint:**
- `packages/theo/src/server/define-agent-endpoint.ts` NEW. Wrapper sobre `defineRoute` (ADR D4) que aceita `async *handler(): AsyncGenerator<AgentEvent>` e retorna `RouteConfig` cujo handler responde com `text/event-stream`.
- Headers `text/event-stream` + `no-cache, no-transform` + `keep-alive`.
- **EC-7 (abort):** observa `request.signal` — quando aborta, chama `generator.return()` e fecha o stream (test prova fechamento em < 500ms para generator infinito).
- Erro mid-stream: catch + emit `{ type: 'error', message }` final.
- **EC-12 (backpressure, Out of Scope):** comentário no source documenta que SSE backpressure não é tratado no MVP.
- Re-export via `theokit/server` index.

Tests: `tests/unit/define-agent-endpoint.test.ts` (7/7) — happy/header/error/abort/empty/ctx-pass-through.

**T5.2 useAgentStream:**
- **Extração core:** `packages/theo/src/client/agent-stream-core.ts` NEW — função pura `consumeAgentStream(path, { body, onEvent, fetch?, signal? })` + `parseSSEChunk(line)`. Testável sem DOM.
- **Hook:** `packages/theo/src/client/use-agent-stream.ts` NEW — React glue (useState + useEffect + useRef<AbortController>). Retorna `{ events, status, send, abort, reset }` com status `idle|streaming|done|error`.
- **EC-3 (transport):** fetch + ReadableStream. Architectural check no test confirma que source NÃO contém `new EventSource` (EC-3 forbidden — GET-only) e contém `consumeAgentStream` + `AbortController.abort()`.
- **EC-8 (cleanup):** useEffect cleanup function chama `controller.abort()` no unmount.
- **Multiple sends:** novo `send()` aborta in-flight antes de abrir nova connection. Estado `controllerRef !== controller` check evita race após supersession.
- **Chunk re-assembly:** parser respeita SSE separator `\n\n` e mantém partial em `buf` (test prova split chunks funcionam).
- Re-export via `theokit/client` index.

Tests: `tests/unit/use-agent-stream.test.ts` (12/12) — 3 parseSSEChunk + 6 consumeAgentStream (incl. abort, split chunks) + 3 architectural checks.

Validation: 941/941 sequential, zero TS errors. Pré-existente: `vite-integrations.test.ts` tem unhandled rejection do file existente (não regressão; linha 27 expect em callback async sem await).

## Iter 5 — 2026-05-17

**T4.1 DONE.** `--bare` flag implementation:
- `packages/create-theo/src/bare-transform.ts` NEW: `applyBareTransform(targetDir, options)` que (1) remove `@usetheo/ui` de deps, (2) reescreve `app/page.tsx` para um "Hello Theo" mínimo, (3) unlink `server/routes/chat.ts`
- `packages/create-theo/src/index.ts` reescrito: `ScaffoldOptions { bare?, _testForceTransformError? }`; **EC-4 atomic rollback** via `try { applyBareTransform } catch { rmSync(targetDir, recursive: true) + throw }`; `--bare` + template não-default lança erro claro
- `packages/create-theo/src/cli.ts` parseia `--bare` flag + help text atualizado
- `_testForceTransformError` injection prova rollback funciona

Tests: `tests/unit/create-theokit-bare.test.ts` (7/7)
Validation: 15/15 nos 2 arquivos relevantes, zero TS errors.

**Phase 4 COMPLETE.** Opt-out path funcional.

## Iter 3 — 2026-05-17

**T2.2 + T2.3 DONE.**

**T2.2 Inject CSS imports:**
- `generateEntryClient(ssr, opts)` aceita `opts.theoUi: { fonts, theme }`
- Quando theoUi enabled, emite `styles.css` + `fonts.css` ou `fonts-cdn.css`
- **EC-2:** `generateEntryServer` NUNCA emite CSS — 2 tests explícitos

**T2.3 Wrap TheoUIProvider:**
- Descoberta no TheoUI source: existe `<TheoUIProvider>` que compõe `<ThemeProvider>` + `<Toaster>` com builtinThemes — entry point idiomático. Plan original falava em `<ThemeProvider>` cru; mudei para usar TheoUIProvider (mais limpo).
- Quando theoUi enabled: envolve RouterProvider em `<TheoUIProvider theme={{ defaultTheme: '<theme>' }}>`
- Theme prop respeitado (violet-forge default, noir, paper)
- SSR variant (hydrateRoot) preservada

Tests: `entry-client-theoui-css.test.ts` (7/7) + `entry-client-theoui-provider.test.ts` (6/6)
Validation: 907/907 sequential, zero TS errors.

**Phase 2 COMPLETE.** Detection + CSS + Provider auto-wire.

## Iter 4 — 2026-05-17

**T3.1 DONE.** Template default agent surface:
- `package.json.tmpl` lista `@usetheo/ui ^0.1.0-next.0` em deps
- `app/page.tsx` reescrito como agent surface: `"use client"` + `AgentTimeline` + `AgentComposer` consumindo `/api/chat` via fetch+ReadableStream SSE parser
- `server/routes/chat.ts` NEW: mock que emite 3 AgentEvents via SSE (`text/event-stream`)
- **EC-11:** comentário grande explicando "substitua pelo seu LLM"
- Mapping runtime AgentEvent → visual AgentTimelineRow inline
- `app/layout.tsx` permanece minimal (ThemeProvider vem do entry-client wrap)

Tests: `tests/unit/scaffold-default-agent.test.ts` (8/8)
Validation: 915/915 sequential, zero TS errors.

## Iter 2 — 2026-05-17

**T2.1 DONE.** Detect TheoUI + schema:
- `theoui-detect.ts` NEW: `detectTheoUi(projectRoot, raw)` + `resolveTheoUiConfig`
- `require.resolve('@usetheo/ui/package.json', { paths: [projectRoot] })` em vez de existsSync — EC-1 (pnpm hoist) + EC-5 (corrupted install)
- `config.ui: false | { theme, fonts }` schema com enum validation (EC-9)
- Theme default `violet-forge`, fonts default `bundled`
- Wired em `vite-plugin/index.ts` configResolved, cacheado em closure

Tests: `tests/unit/vite-plugin-theoui-detect.test.ts` (8/8)
Validation: 894/894 sequential, zero TS errors.

## Iter 1 — 2026-05-17

**Decisões revisadas + T1.1 DONE.**

**Decisão arquitetural revisada (confirmada com user):**
- TheoUI é dep DIRETA do template default (apps gerados puxam)
- TheoUI NÃO é dep do package `theokit` core
- `AgentEvent` runtime variant vive 100% em TheoKit (sem re-export de TheoUI)
- ADR D3 original DESCARTADO (no cross-package type coupling)
- ADR D1 mantido (TheoUI no template)

**T1.1 DONE:** `packages/theo/src/server/agent-types.ts` define union `AgentEvent` com 4 variants:
- `AgentMessageEvent` (type: 'message', content)
- `AgentToolCallEvent` (type: 'tool_call', name, args)
- `AgentToolResultEvent` (type: 'tool_result', name, data)
- `AgentErrorEvent` (type: 'error', message)

Re-exportado via `theokit/server` e `theokit/client`. Type-only erasure (zero runtime cost).

Tests: `tests/unit/agent-event-type.test-d.ts` (6 type tests, expectTypeOf)
Validation: 886/886 sequential, zero TS errors.
