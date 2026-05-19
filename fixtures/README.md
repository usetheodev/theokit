# TheoKit Fixtures

Each subdirectory is a minimal TheoKit project that exercises one feature. These are **test fixtures consumed by integration tests** — NOT standalone runnable projects. The `fixtures/` directory is intentionally outside the `pnpm-workspace.yaml` member list, so fixtures don't have their own `node_modules`. They work via the monorepo's Node module resolution walk-up.

## To exercise a fixture

```bash
# Run the integration test that drives the fixture
npx vitest run tests/integration/fixture-<name>.test.ts

# Or run all fixture tests at once
npx vitest run tests/integration/fixture-
```

## To use a fixture as a starting point for your own project

The fixtures show **API usage patterns**, not deployable apps. To start your own TheoKit project, use the scaffolder:

```bash
npm create theokit my-app
```

You can then copy the relevant code patterns from any fixture into your scaffolded project.

## Index

| Fixture | Demonstrates | Phase |
|---|---|---|
| adapter-static | static export with dynamic routes + catch-all | base |
| adapter-targets | parent dir for the 6 compile-only deploy adapter fixtures | full-cov |
| agent-endpoint-mock | `defineAgentEndpoint` wire-format reference (4 AgentEvent variants + abort) | full-cov |
| agents-dir-ignored | negative test: agents/ directory is intentionally not scanned | base |
| app-router-basic | minimal `app/` routing | base |
| app-router-errors | per-segment `error.tsx` boundaries | base |
| app-router-nested-layouts | nested `layout.tsx` composition | base |
| app-router-not-found | `not-found.tsx` per segment | base |
| basic-valid-app | minimal valid project structure | base |
| batching | `createBatcher` + same-microtask collapse | full-cov |
| custom-transformer | `TheoTransformer` interface + Date round-trip | full-cov |
| define-channel | `defineChannel` pub/sub over WebSocket rooms | full-cov |
| define-integration | `defineTheoIntegration` + virtual module prefix | full-cov |
| dynamic-routes | `[id]` dynamic segment + `[...slug]` catch-all | full-cov |
| invalid-config | negative test: malformed `theo.config.ts` is rejected | base |
| invalid-no-app | negative test: missing `app/` is rejected | base |
| loading-states | per-segment `loading.tsx` + Suspense protocol | full-cov |
| middleware-context | `defineMiddleware` + request context | base |
| multipart-upload | file upload via `parseRequestBody` + FormData | full-cov |
| observability | structured logger + request log | base |
| onda1-hello-theo | end-to-end scaffold smoke test | base |
| plugin-example | `defineTheoPlugin` with all 4 lifecycle hooks | base |
| production-build | `theokit build` production output | base |
| rate-limit | `windowMs` + `max` rate limit config | full-cov |
| react-query-integration | `theokit/react-query` driving `@tanstack/react-query` | full-cov |
| server-actions-basic | `defineAction` with Zod and form submit | base |
| server-routes-basic | `defineRoute` with Zod query/body/params | base |
| sessions-auth | `createSessionManager` + `requireAuth` + EC-2 secret guard | full-cov |
| ssr-basic | single-shot server-side rendering | base |
| ssr-streaming | `renderToPipeableStream` + Suspense progressive flush | full-cov |
| template-default | Playwright fixture mirroring the default scaffold (Phase 10 — T10.1) | nextjs-maturity |
| theoui-autoinject | TheoUI auto-injection without user-code imports | full-cov |
| typed-client | end-to-end `theoFetch<typeof GET>` inference | full-cov |
| upgrade-readiness-clean | clean app surface — `theokit check --upgrade-readiness 0.3` reports zero violations | 0.3-cutover |
| upgrade-readiness-dirty | deliberate 0.3 violations (raw fetch POST, inline `<script>`, `dangerouslySetInnerHTML`) for the scanner | 0.3-cutover |
| use-agent-stream-react | `useAgentStream` in plain React (no `@usetheo/ui`) | full-cov |
| websocket-basic | `defineWebSocket` request handler | base |

## Notes on adapter fixtures

The `adapter-targets/*` fixtures (added in `full-coverage-examples` plan) are **compile-only** — they validate that `theokit build --target X` emits the expected files, but they do NOT deploy to the target platform. Real-platform deploy validation requires cloud credentials and runs in a separate nightly job.
