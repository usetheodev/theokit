# theo

## [Unreleased]

## [0.1.0-alpha.0] - 2026-05-09

### Added

- `defineConfig` identity function with Zod schema validation via `loadConfig`
- `defineRoute` with typed query, body, params via Zod generics
- `defineAction` with required Zod input schema
- `defineMiddleware` with `await next()` pattern using Web Standards Request/Response
- `validateProjectStructure` for opinionated project validation
- File-based routing via React Router v7 with nested layouts, error boundaries, and not-found pages
- `theoPlugin` Vite plugin with virtual modules (`/@theo/entry-client`, `/@theo/route-manifest`)
- API route execution pipeline with Zod validation, requestId, and structured error responses
- Server actions with CSRF protection (origin + custom header)
- Middleware + context system with `runMiddlewareAndContext()` unified pipeline
- `theo build` command producing `.theo/client/` with Vite build
- `theo start` production server with static files, API routes, and SPA fallback
- `theo dev` development server with HMR
- Cookie helpers (`getCookie`, `setCookie`, `deleteCookie`) with OWASP-compliant defaults
- Structured JSON logging with `x-request-id` on all API responses
- 21 type tests proving end-to-end Zod inference
- Zero `any` in production code
