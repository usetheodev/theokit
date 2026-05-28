# Reference: Polyglot Services Orchestration (Wave 2 — `services: {}` + Like-Vercel contract)

**Date:** 2026-05-27
**Depth:** exhaustive
**Frameworks analyzed:** nitro (current main), hono (current main), vite (current main), encore (current main), nitric (current main), dapr (current main), sveltekit (current main), next.js (current main), astro (current main) + external sources (Vercel Services docs Feb 2026, Caddy 2.11+, Hey API openapi-ts)
**TheoKit package affected:** `packages/theo/src/{cli,server,vite-plugin,adapters,config}/`
**Related references:**
- [`.claude/knowledge-base/reference/devtools.md`](./devtools.md) — overlay pattern (informs how `services` status surfaces in devtools)
- [`.claude/knowledge-base/reference/pluggable-storage-managed-pg-redis.md`](./pluggable-storage-managed-pg-redis.md) — `StorageManager` precedent for opt-in primitives

**ADRs governing this work (accepted 2026-05-27):**
- [ADR-0012](../../docs/adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) — mission expansion
- [ADR-0013](../../docs/adr/0013-theocreate-absorbed-into-create-theokit.md) — TheoCreate absorption
- [ADR-0014](../../docs/adr/0014-services-as-external-processes.md) — external processes invariant
- [ADR-0015](../../docs/adr/0015-services-runtime-contract-like-vercel.md) — Like-Vercel contract

---

## 1. Problem statement

**What:** TheoKit Wave 2 ships `theo.config.ts > services: {}` — a declarative orchestration primitive that lets users boot Python (FastAPI) or Node (Hono) sidecar services alongside their TheoKit TS app. The orchestration covers (a) dev (Vite proxy + docker-compose), (b) build (`.theo/services.json` manifest), (c) deploy adapters (Vercel/CF/TheoCloud read the same manifest). **`services: {}` is opt-in — empty by default — 90% of agent products live entirely in TheoKit's TS `server/`** (see ADR-0012 "Positioning clarification" + CLAUDE.md "TheoKit `server/` covers end-to-end").

**Current state:**
- `packages/theo/src/config/schema.ts` has NO `services` field yet
- 8 deploy adapters exist (`packages/theo/src/adapters/{aws-lambda,bun,cloudflare,deno-deploy,netlify,node,static,vercel}.ts`) — all assume single TS process
- Vite proxy is NOT auto-wired from any config — currently users would write `vite.config.ts > server.proxy` by hand
- No `.theo/services.json` artifact emission today
- `create-theokit` scaffolder (`packages/create-theo/`) has 5 TS templates; no `--backend python|node` flag

**Why now:**
- Decision 2026-05-27: TheoCreate (`theo-stacks/create-theo`) is being absorbed into TheoKit → polyglot history needs a home
- Wave 3 (TheoCloud adapter) requires the manifest+contract to exist for the adapter to consume
- Vercel shipped "Services" feature in 2026 — competitive baseline raised
- The "só trocar o server" intuition (owner, 2026-05-27) requires a uniform contract across local/Vercel/CF/TheoCloud

---

## 2. Inventário completo de arquivos (mandatório)

Lista exaustiva — todo arquivo que o grep capturou nas 3 passadas (nome / conteúdo / docs). Ordenado por framework e por caminho. **Sem cherry-picking.**

### nitro — inventário (Wave-2 anchor framework — declarative `routeRules` + proxy is the closest analog)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/nitro/src/config/resolvers/route-rules.ts` | core | 73 | ✅ | §3.1 (algoritmo de resolução), §5 |
| `referencias/nitro/src/runtime/internal/route-rules.ts` | core | 127 | ✅ | §3.1 (proxy executor), §7 (isPathInScope), §8 |
| `referencias/nitro/src/runtime/internal/app.ts` | core | 200+ | ✅ | §3.1 (app fetch handler) |
| `referencias/nitro/src/types/config.ts` | support | n/a | seletivo | §3.1 (NitroRouteRules type) |
| `referencias/nitro/src/types/nitro.ts` | support | n/a | seletivo | §3.1 (RuntimeRouteRules) |
| `referencias/nitro/src/routing.ts` | core | n/a | seletivo (routeRules wiring) | §3.1 |
| `referencias/nitro/src/build/virtual/routing.ts` | support | n/a | seletivo | §3.1 |
| `referencias/nitro/src/cli/commands/dev.ts` | support | n/a | seletivo | §3.1 (dev orchestration) |
| `referencias/nitro/src/presets/vercel/utils.ts` | doc | n/a | seletivo | §5 (adapter translation pattern) |
| `referencias/nitro/src/presets/cloudflare/utils.ts` | doc | n/a | seletivo | §5 |
| `referencias/nitro/src/presets/netlify/utils.ts` | doc | n/a | seletivo | §5 |

### hono — inventário (proxy helper as canonical fetch-handler proxy)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/hono/src/helper/proxy/index.ts` | core | 190 | ✅ | §3.2 (proxy algoritmo), §6 (deps), §7 (hop-by-hop), §8 (header injection CVE) |
| `referencias/hono/src/helper/proxy/index.test.ts` | test | 336 | seletivo (assertion shape) | §8 |
| `referencias/hono/src/hono-base.ts` | support | n/a | seletivo | §3.2 (fetch handler base) |
| `referencias/hono/src/router/*` | support | n/a | descartado (não relevante) | — |

### vite — inventário (dev-server proxy implementation)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/vite/packages/vite/src/node/server/middlewares/proxy.ts` | core | 236 | ✅ | §3.3, §6 (http-proxy-3), §8 (WS upgrade) |

### encore — inventário (TS service definition + virtual clients module)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/encore/runtimes/js/encore.dev/service/mod.ts` | core | 25 | ✅ | §3.4 (Service class) |
| `referencias/encore/e2e-tests/testdata/tsapp/service1/encore.service.ts` | doc | 18 | ✅ | §3.4 (convention file) |
| `referencias/encore/e2e-tests/testdata/tsapp/service1/api.ts` | doc | 80 | ✅ | §3.4 (api() pattern, ~encore/clients) |
| `referencias/encore/tsparser/src/builder/templates/entrypoints/services/*` | core | n/a | seletivo | §3.4 (codegen entrypoints) |
| `referencias/encore/v2/app/service.go` | core | n/a | descartado (Go-side; conceito já capturado pelo TS surface) | — |
| `referencias/encore/v2/app/service_discovery.go` | core | n/a | descartado (codegen Go) | — |
| `referencias/encore/runtimes/go/appruntime/apisdk/api/services.go` | support | n/a | descartado (Go runtime; TS path coberto) | — |

### nitric — inventário (multi-language SDK pattern + gRPC membrane — counter-example)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/nitric/README.md` | doc | n/a | ✅ | §3.5 (positioning) |
| `referencias/nitric/core/pkg/server/server.go` | core | n/a | seletivo | §3.5 (membrane orchestration) |
| `referencias/nitric/core/pkg/workers/*` | core | n/a | seletivo (worker registration shape) | §3.5 (gRPC streaming pattern) |
| `referencias/nitric/nitric/proto/*` | doc | n/a | descartado (gRPC proto — TheoKit chose HTTP/OpenAPI) | — |

### dapr — inventário (infrastructure sidecar — different paradigm but relevant for tracing/identity in Wave 3)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/dapr/README.md` | doc | n/a | ✅ | §3.6 (positioning) |
| `referencias/dapr/docs/decision_records/api/API-007-tracing-endpoint.md` | doc | n/a | ✅ | §3.6 (trace propagation contract) |
| `referencias/dapr/docs/decision_records/architecture/*` | doc | n/a | seletivo | §3.6 |

### sveltekit — inventário (adapter-per-platform pattern)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/sveltekit/packages/adapter-vercel/index.js` | core | 80+ | ✅ | §3.7 (adapter shape) |
| `referencias/sveltekit/packages/adapter-{node,cloudflare,netlify,static,auto}/` | core | n/a | seletivo | §3.7 (adapter-per-platform) |

### next.js — inventário (rewrites/redirects as proxy precedent)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/next.js/packages/next/src/server/server-route-utils.ts` | core | n/a | seletivo | §3.8 (rewrites resolution) |
| `referencias/next.js/packages/next/src/server/config-schema.ts` | support | n/a | seletivo | §3.8 (rewrites schema) |

### astro — inventário (integration pattern; server islands NOT relevant)

| File | Category | LOC | Read in full? | Anchored in |
|---|---|---|---|---|
| `referencias/astro/packages/astro/src/core/server-islands/*` | core | n/a | descartado (render-time partial — not service orchestration) | — |

### Arquivos avaliados e descartados (com motivo)

| File | Why discarded |
|---|---|
| `referencias/astro/packages/astro/src/core/server-islands/vite-plugin-server-islands.ts` | Server islands são render-time fetch DENTRO do mesmo Astro process; não fit polyglot service orchestration |
| `referencias/astro/packages/astro/src/runtime/server/render/server-islands.ts` | Mesmo motivo — render partial, não multi-process |
| `referencias/encore/v2/app/service.go` | Go-side codegen do parser; surface TS já coberto pelo `runtimes/js/encore.dev/service/mod.ts` |
| `referencias/encore/v2/app/service_discovery.go` | Codegen Go interno; pattern conceitual já capturado |
| `referencias/encore/runtimes/go/appruntime/apisdk/api/services.go` | Go runtime de Encore — TheoKit não compartilha runtime, só padrão de declaração |
| `referencias/nitric/nitric/proto/*` | gRPC proto definitions — TheoKit choice é HTTP/OpenAPI, gRPC é anti-pattern para Wave 2 |
| `referencias/hono/src/router/*` | Roteamento interno do Hono não compartilha com TheoKit's router |
| `referencias/nitro/src/presets/zeabur/preset.ts` | Zeabur-specific adapter; padrão genérico já em vercel/cloudflare presets |
| `referencias/nitro/src/presets/edgeone/utils.ts` | Same — preset específico, padrão genérico coberto |
| `referencias/wasp/` | Haskell-based DSL; lições conceituais já cobertas; deep dive teria ROI baixo (linguagem diferente, paradigma DSL não combina com `defineConfig` TS) |
| `referencias/generator-jhipster/*` | Matrix scaffolder gigante; lições conceituais ("matrix explode") já documentadas em ADR-0012 R5; código Yeoman não é reutilizável |
| `referencias/juno/*` | Hardcoded resources pattern (sistema fechado) — anti-padrão deliberado para TheoKit |
| `referencias/fastify/*` | Plugin SDK já estudado em ADR-0008/0011; não adiciona para polyglot |
| `referencias/trpc/*` | RPC pattern interno-TS; não cobre cross-language services |
| `referencias/tanstack-router/*` | Frontend routing; não relevante para service orchestration |
| `referencias/remix/*` | Single-process framework; sem service primitive |
| `referencias/nuxt/*` | Build-time module SDK; tratado em discussão prévia ADR-0008 (rejeitado para TheoKit) |
| `referencias/rails/*` | Monolítico; sem padrão polyglot reutilizável |

---

## 3. Prior art — deep dive por framework

### 3.1 Nitro — `routeRules.proxy` (Wave 2 anchor)

**API pública (config side — `nitro.config.ts`):**

```ts
// referencias/nitro/src/types/config.ts (NitroRouteConfig)
export interface NitroRouteConfig {
  proxy?: string | { to: string; [key: string]: any }
  redirect?: string | { to: string; status?: number }
  headers?: Record<string, string>
  cors?: boolean
  swr?: boolean | number
  cache?: false | { /* ... */ }
}

// nitro.config.ts (user side)
export default defineNitroConfig({
  routeRules: {
    "/api/agent/**": { proxy: "http://localhost:8001/**" },
    "/api/ml/**": { proxy: { to: "http://ml-service:8002/**" } },
  }
})
```

**Algoritmo interno (resolver, `referencias/nitro/src/config/resolvers/route-rules.ts:7-72`):**

1. Para cada `path` em `config.routeRules`:
   - Normaliza com `withLeadingSlash(path)` (ufo)
   - Inicializa `routeRules: NitroRouteRules` com `redirect: undefined, proxy: undefined`
2. Se `routeConfig.proxy`:
   - Normaliza para `{ to: ... }` object shape
   - Se `path.endsWith("/**")`: marca internamente `_proxyStripBase = path.slice(0, -3)` para o runtime
3. Se `routeConfig.cors`: injeta headers `access-control-*: *` (mas user headers ganham precedência via spread)
4. Se `routeConfig.swr`: ativa cache stale-while-revalidate
5. Retorna `Record<string, NitroRouteRules>` para o runtime consumir

**Algoritmo runtime (executor, `referencias/nitro/src/runtime/internal/route-rules.ts:46-71`):**

```ts
export const proxy: RouteRuleCtor<"proxy"> = ((m) =>
  function proxyRouteRule(event) {
    let target = m.options?.to;
    if (!target) return;

    if (target.endsWith("/**")) {
      let targetPath = event.url.pathname + event.url.search;
      const strpBase = (m.options as any)._proxyStripBase;
      if (strpBase) {
        // CRITICAL — security guard against path traversal
        if (!isPathInScope(event.url.pathname, strpBase)) {
          throw new HTTPError({ status: 400 });
        }
        targetPath = withoutBase(targetPath, strpBase);
      } else if (targetPath.startsWith("//")) {
        targetPath = targetPath.replace(/^\/+/, "/");
      }
      target = joinURL(target.slice(0, -3), targetPath);
    } else if (event.url.search) {
      target = withQuery(target, Object.fromEntries(event.url.searchParams));
    }
    return proxyRequest(event, target, { ...m.options });
  })
```

**Estado mantido:**
- `event.context.matchedRoute` — populated by route matcher upstream (consumed by `cache` rule)
- Global `__nitroCachedHandlers: Map<string, EventHandler>` for cache-decorator routes (`route-rules.ts:79`)
- `useNitroApp()._instance` singleton (`app.ts:18-29`) — cached app instance per APP_ID
- `globalThis.__nitro__` — multi-app registry (e.g., default + prerender)

**Dependências externas usadas (Nitro proxy path):**

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `h3` | latest | Fetch handler framework + `proxyRequest` helper | **Avaliar** — TheoKit já tem `web-shim`; h3 traz overhead extra mas é battle-tested |
| `ufo` | latest | URL manipulation (`joinURL`, `withQuery`, `withoutBase`, `withLeadingSlash`) | **Adotar** — pure URL utils, ~5KB, no runtime cost |
| `hookable` | latest | Lifecycle hooks framework | Não para polyglot services (orthogonal) |

**Side effects observáveis:**
- Sets `globalThis.__nitro__[APP_ID]` (visible in worker/serverless contexts)
- Sets `__nitroCachedHandlers` Map global (for cache decorator)
- No filesystem writes from route-rules path itself

**TODOs / FIXMEs / HACKs literais:**
- `// Note: Remember to update RuntimeRouteRules in src/build/virtual/routing.ts when adding new route rules` (`route-rules.ts:8`)
- `// @ts-ignore` on `to: "/"` default in redirect (`route-rules.ts:22`)
- `// Internal flag` comment on `_proxyStripBase` (`route-rules.ts:35`)

**Padrão de design:**
- **Declarative routing rules + runtime applicator chain.** Each rule type (headers, redirect, proxy, cache, auth) is a `RouteRuleCtor<T>` that produces a middleware. Rules are ordered (`a.handler?.order || 0`) — basicAuth runs first (order: -1) so unauthorized requests aren't proxied.
- Why: avoids per-route function definitions for purely declarative behaviors; one config block, many platforms.

### 3.2 Hono — `proxy()` helper (canonical fetch-handler proxy)

**API pública (`referencias/hono/src/helper/proxy/index.ts:160-190`):**

```ts
export const proxy: ProxyFetch = async (input, proxyInit) => { /* … */ }

interface ProxyRequestInit extends Omit<RequestInit, 'headers'> {
  raw?: Request
  headers?: HeadersInit | [string, string][] | Record<string, string | undefined>
  customFetch?: (request: Request) => Promise<Response>
  strictConnectionProcessing?: boolean  // default false (secure)
}

// Usage
app.get('/proxy/:path', (c) => {
  return proxy(`http://${origin}/${c.req.param('path')}`, {
    headers: { ...c.req.header(), 'X-Forwarded-For': '127.0.0.1', Authorization: undefined }
  })
})
```

**Algoritmo interno (`index.ts:160-190`):**

1. Extract `raw`, `customFetch`, `strictConnectionProcessing`, rest as `requestInit`
2. Build `Request` from raw via `buildRequestInitFromRequest`:
   - Clone headers
   - If `strictConnectionProcessing: true`: parse `Connection` header (RFC 9110), validate header names via `ALLOWED_TOKEN_PATTERN`, delete listed headers
   - **Always:** delete hop-by-hop headers (`connection, keep-alive, proxy-authenticate, proxy-authorization, te, trailer, transfer-encoding, upgrade`)
   - Set `method`, `body`, `duplex: 'half'` if body, `signal`
3. Merge with `preprocessRequestInit(requestInit)` — converts plain object headers to `Headers`, treats `undefined`/`null` as delete
4. **Delete `accept-encoding`** from outgoing request (let the proxy negotiate)
5. Call `(customFetch || fetch)(req)` — `customFetch` enables testing/swapping
6. Clone response headers, delete hop-by-hop on response too
7. **Delete `content-encoding` + `content-length`** on response (body is re-streamed, may be re-encoded)
8. Return new `Response(res.body, { status, statusText, headers })`

**Estado mantido:** None — pure function. Stateless.

**Dependências externas usadas:** None (uses global `fetch` + Web Standards `Request`/`Response`/`Headers`).

**Side effects observáveis:** None (deletes headers in cloned objects, not in originals).

**TODOs / FIXMEs / HACKs literais:** None — clean implementation.

**Padrão de design:**
- **Pure fetch-handler proxy.** Web Standards only, no Node-specific APIs. Works on Bun, Deno, CF Workers, Vercel Edge, Node 18+.
- Why: matches Like-Vercel runtime contract (ADR-0015 invariant #1 — fetch handler universal).
- **Hop-by-Hop Header Injection defense by default** — `strictConnectionProcessing: false` is the secure default. Reference: CVE-2022-32147-like class.

### 3.3 Vite — dev-server proxy middleware

**API pública (config side — `vite.config.ts`):**

```ts
export default defineConfig({
  server: {
    proxy: {
      "/api/agent": "http://localhost:8001",
      "/api/ml": {
        target: "http://localhost:8002",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ml/, ""),
        bypass: (req, res, opts) => { /* skip for some */ },
      }
    }
  }
})
```

**Algoritmo interno (`referencias/vite/packages/vite/src/node/server/middlewares/proxy.ts:75-229`):**

1. **Lazy require** `http-proxy-3` only when proxy config is non-empty
2. For each `context` (path prefix or `^regex`):
   - Normalize string shortcut to `{ target, changeOrigin: true }`
   - Create `httpProxy.createProxyServer(opts)`
   - Call user's `opts.configure(proxy, opts)` if provided
   - Attach `proxy.on('error')` handler → 502 + log
   - Attach `proxy.on('proxyReqWs')` for WebSocket origin rewrite
3. **WebSocket upgrade** (separate path):
   - `httpServer.on('upgrade', async (req, socket, head))`
   - Find matching proxy via `doesProxyContextMatchUrl`
   - If `opts.bypass` returns string → rewrite URL; if returns `false` → 404
   - Apply `opts.rewrite` then `proxy.ws(req, socket, head)`
4. **HTTP middleware** (`viteProxyMiddleware`):
   - Same match logic
   - Apply `bypass` → `rewrite` → `proxy.web(req, res, options)`
5. **Match logic** (`doesProxyContextMatchUrl:231-236`):
   - `context[0] === '^'` → regex match
   - else → `url.startsWith(context)` — prefix match

**Estado mantido:** `proxies: Record<string, [ProxyServer, ProxyOptions]>` — per-context proxy server instances.

**Dependências externas usadas:**

| Lib | Versão | Para quê | TheoKit pode adotar? |
|---|---|---|---|
| `http-proxy-3` | ^1.x | Battle-tested Node HTTP proxy (fork of `http-proxy`) | **Adotar** — Vite already pins it; node adapter can reuse |
| `picocolors` | ^1.x | Terminal coloring for error logs | **Adotar** — TheoKit já usa |

**Side effects observáveis:**
- Logger writes (`config.logger.error/warn`) to stderr
- Mutates `req.url` when `opts.rewrite` is provided
- Mutates `proxyReq.headers.origin` when `opts.rewriteWsOrigin`

**TODOs / FIXMEs / HACKs literais:**
- `// **Exercise caution as rewriting the Origin can leave the proxying open to [CSRF attacks]**` — `proxy.ts:37-39` (warning in JSDoc, not code)
- `// Browsers may send Origin headers even with same-origin requests` — `proxy.ts:49-50`

**Padrão de design:**
- **Per-context proxy server instances + lazy bind.** Each path prefix gets its own `httpProxy.ProxyServer` (separates events, error handlers).
- **`bypass` escape hatch** — user can short-circuit per request (returns string=rewrite, false=404, undefined=continue).
- Why: dev-server needs flexibility for "sometimes proxy, sometimes serve from Vite" patterns (e.g., dev API mock).

### 3.4 Encore.ts — `Service` + `~encore/clients` (convention + virtual module)

**API pública (`referencias/encore/runtimes/js/encore.dev/service/mod.ts`):**

```ts
export class Service {
  public readonly name: string;
  public readonly cfg: ServiceConfig;
  constructor(name: string, cfg?: ServiceConfig) {
    this.name = name;
    this.cfg = cfg ?? {};
  }
}

export interface ServiceConfig {
  middlewares?: Middleware[];
}
```

**Convention file (`referencias/encore/e2e-tests/testdata/tsapp/service1/encore.service.ts`):**

```ts
import { Service } from "encore.dev/service";
export default new Service("service1", { middlewares: [...] });
```

**Cross-service call (`referencias/encore/e2e-tests/testdata/tsapp/service1/api.ts:33-49`):**

```ts
import { service2 } from "~encore/clients";  // ← virtual module, generated
//                          ^^^^^^^^^^^^^^^^^

const result = await service2.greet({ name: req.name, style: req.style || "formal" });
```

**Algoritmo interno (conceptual — from convention + tsparser):**

1. File `encore.service.ts` in a directory marks that directory as a service scope
2. `tsparser/src/builder/templates/entrypoints/services/*` (TS templates) generate per-service entrypoints at build
3. `~encore/clients` is a virtual module — resolved at build via codegen, producing typed clients for cross-service calls
4. Service-to-service calls go through Encore's runtime (HTTP-ish with framing), not direct fetch

**Dependências externas usadas:**

| Lib | Para quê | TheoKit pode adotar? |
|---|---|---|
| (Encore-internal) virtual module codegen | Cross-service typed clients | **Inspiração** — TheoKit Wave 2 uses Hey API for the same purpose (less custom codegen) |

**Side effects observáveis:** Convention-based discovery (file name marks scope). No runtime side effects from the `Service` class itself.

**Padrão de design:**
- **Convention file marks scope** (Service-Locator-by-convention).
- **Virtual module exposes typed clients** — `~encore/clients` is build-time generated.
- Why this matters for TheoKit: the **virtual module pattern** is reusable for `services: {}` typed access — `theokit/services` could become a virtual module exposing `services.agent.chat({ ... })` typed from each service's OpenAPI.

### 3.5 Nitric — multi-language SDK + gRPC membrane (COUNTER-EXAMPLE)

**Positioning (from `referencias/nitric/README.md:21`):**
> Nitric is a multi-language framework, with concise inline infrastructure from code.

**Supported runtimes:** JavaScript, TypeScript, Python, Go, Dart.

**Architecture (high-level, from `referencias/nitric/core/pkg/server/*` + workers):**

1. Single Go "membrane" process (`core/pkg/server/server.go`)
2. User code runs in any language, talks to membrane via gRPC streaming
3. Workers register handlers via gRPC streams (`core/pkg/workers/{apis,http,jobs,topics,schedules}/`)
4. Membrane translates "resources from code" → cloud-specific infrastructure (AWS/GCP/Azure via `cloud/{aws,gcp,azure}/`)

**Why this is a COUNTER-EXAMPLE for TheoKit:**

| Nitric chose | TheoKit's choice (ADR-0014/0015) |
|---|---|
| gRPC + custom membrane process | HTTP/OpenAPI + direct proxy (no membrane) |
| Infrastructure-from-code (resources declared in app code, provisioned by Nitric) | Infrastructure-from-config (`theo.config.ts > services` declares orchestration, NOT cloud resources) |
| 5 language SDKs in core | Multi-language as TEMPLATES (Python, Node) — no parallel agent SDK |
| Locked to Nitric's gRPC contract | Web Standards (fetch handler) |

**Why anchor it in this doc:** Nitric is **the closest competitor positioning-wise** ("multi-language framework"). Documenting their gRPC/membrane choice helps reject it cleanly for future PRs that propose "let's add a TheoKit membrane".

### 3.6 Dapr — infrastructure sidecar (DIFFERENT PARADIGM but relevant for Wave 3)

**Positioning (from `referencias/dapr/README.md`):**
> Dapr is a set of integrated APIs with built-in best practices and patterns to build distributed applications.

**Architecture:**
- Dapr's sidecar (daprd) runs alongside user code
- User code calls into daprd via HTTP/gRPC for: state, pub/sub, secrets, bindings, actors, distributed lock, workflow
- Sidecar handles cloud integration (state backends, message brokers, etc.)

**Critical difference vs TheoKit polyglot services:**

| Dapr sidecar | TheoKit polyglot service |
|---|---|
| Infrastructure sidecar (state, pub/sub, secrets, workflow) | Application sidecar (user-written FastAPI/Hono with business logic) |
| User app talks INTO daprd | TheoKit talks OUT to user's polyglot service |
| daprd is provided by Dapr | service is written by the user |

**Relevant ADR (`referencias/dapr/docs/decision_records/api/API-007-tracing-endpoint.md`):**

> We now support distributed tracing across Dapr sidecars, and we inject correlation id to HTTP headers and gRPC metadata before we hand the requests to user code. However, it's up to the user code to configure and implement proper tracing themselves.

**Lesson for TheoKit Wave 2 + Wave 3:**
- **Trace propagation must be the framework's job** (TheoKit injects `traceparent` at proxy hop) — Dapr's design where "user code does proper tracing themselves" leaves a gap. ADR-0015 invariant #6 makes traceparent mandatory.
- For Wave 3 (TheoCloud), **mTLS + service identity** (Dapr pattern) becomes a real concern. Not in Wave 2 scope (local docker-compose); add to TheoCloud adapter design.

### 3.7 SvelteKit — adapter-per-platform pattern

**Adapter shape (`referencias/sveltekit/packages/adapter-vercel/index.js:32-80`):**

```js
const plugin = function (defaults = {}) {
  return {
    name: '@sveltejs/adapter-vercel',
    async adapt(builder) {
      // 1. Validate (kit version, vercel.json shape)
      // 2. Setup output dirs (.vercel/output)
      // 3. builder.writeClient(dirs.static)
      // 4. builder.writePrerendered(dirs.static)
      // 5. Generate static_vercel_config
      // 6. Generate serverless functions per route
      // 7. Wire functions to Vercel's expected layout
    }
  }
}
```

**Pattern observed:**
- Each platform has its OWN package (`adapter-vercel`, `adapter-cloudflare`, `adapter-netlify`, `adapter-node`, `adapter-static`, `adapter-auto`)
- `adapter-auto` detects platform from env vars at build time
- Adapter receives a `builder` API with primitives (`writeClient`, `writeServer`, `writePrerendered`, `copy`, `compress`, `getBuildDirectory`, `routes`, `prerendered`)
- Each adapter translates the SvelteKit app → platform-specific layout

**Relevance for TheoKit Wave 2:**
- TheoKit already follows this pattern (`packages/theo/src/adapters/{vercel,cloudflare,...}.ts`)
- Wave 2 extends: each adapter reads `.theo/services.json` and translates per platform:
  - **Vercel adapter:** writes `vercel.json` `services` block (Vercel Services feature, 2026)
  - **Node adapter:** writes `docker-compose.yml` for local TheoCloud-shaped harness
  - **Cloudflare:** rejects polyglot services that need Python (CF Workers doesn't support Python runtime) with clear error
  - **TheoCloud (Wave 3):** writes K8s manifests

### 3.8 Next.js — rewrites/redirects (declarative proxy precedent)

**API (`next.config.js`):**

```js
module.exports = {
  async rewrites() {
    return [
      { source: '/api/agent/:path*', destination: 'http://localhost:8001/:path*' }
    ]
  }
}
```

**Algorithm (high level — `referencias/next.js/packages/next/src/server/server-route-utils.ts` + `server-utils.ts`):**

1. Rewrites defined as `{ source, destination, has?, missing?, locale? }`
2. Two phases: `beforeFiles` / `afterFiles` / `fallback` — controls when rewrites apply vs file matching
3. At runtime: `next-server.ts` resolves the matching rewrite and proxies (or internally renders)
4. Supports `:path*` capture syntax (path-to-regexp style)

**Relevance:** Next.js rewrites cover a similar surface to TheoKit's `services: {}` proxy. **Difference:** Next.js rewrites are 1:N (source → destination) without service-level metadata (port, runtime kind, healthcheck, OpenAPI URL). TheoKit's `services: {}` is richer because each service has `{ runtime, port, dev, build, start, openapi, healthcheck, proxy }` — proxy is one facet.

### 3.9 External — Vercel Services (Feb 2026 feature, NEW)

**Positioning (from Vercel docs `https://vercel.com/docs/services`):**
> Services let you deploy multiple backends and frontends within a single Vercel project.

**Key facts captured from web search:**
- Each service builds independently within the project
- Request-time routing by URL path prefix to the correct service
- Mixed runtimes (Python FastAPI at `/backend`, Go at `/svc/go`, Next.js frontend, etc.)
- All services share the same deployment URL
- Replaces the older pattern of splitting monorepos into separate Vercel projects

**Crucial implication for TheoKit Wave 2:**
- The "Like-Vercel" contract from ADR-0015 is now **literally Vercel-compatible** — the Vercel adapter for Wave 2 maps `theo.config.ts > services: { agent: { runtime: 'python', proxy: '/api/agent' } }` directly to Vercel's `services` config block
- This means the manifest shape (`.theo/services.json`) should be **Vercel-services-translatable** by design — that constraints Wave 2 design

**FastAPI on Vercel specifics:**
- Entrypoints: `app.py`, `index.py`, `server.py`, `main.py`, `wsgi.py`, `asgi.py`
- Custom entrypoint via `tool.vercel.entrypoint` in `pyproject.toml`
- 500 MB max uncompressed bundle (use `excludeFiles` in `vercel.json`)

**Sources for §3.9:**
- [Vercel Services docs](https://vercel.com/docs/services)
- [Vercel FastAPI runtime](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python)
- [Vercel monorepo with FastAPI guide (Feb 2026)](https://nemanjamitic.com/blog/2026-02-22-vercel-deploy-fastapi-nextjs/)

### 3.10 External — Caddy + Docker Compose + W3C Trace Context (Wave 2 local harness)

**Pattern from `https://oneuptime.com/blog/post/2026-02-06-caddy-reverse-proxy-trace-context-propagation/view`:**

- Caddy 2.11+ with `tracing` directive enabled handles `traceparent` propagation AUTOMATICALLY
- Each `reverse_proxy` directive creates a child span and forwards updated `traceparent`
- Baggage headers pass through unchanged

**Docker Compose pattern (from multiple 2026 sources):**

```yaml
services:
  caddy:
    image: caddy:2.11
    depends_on:
      agent: { condition: service_healthy }
      ml:    { condition: service_healthy }
  agent:
    build: ./services/agent-python
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 10s
      timeout: 5s
      retries: 3
  ml:
    build: ./services/ml-python
    healthcheck: { /* similar */ }
```

**TheoKit relevance:** This is exactly the local "TheoCloud-shaped harness" the owner asked for (ADR-0015). Wave 2 generates this docker-compose from `services: {}` + ships a default Caddyfile with traceparent enabled.

**Sources for §3.10:**
- [Caddy W3C Trace Context (Feb 2026)](https://oneuptime.com/blog/post/2026-02-06-caddy-reverse-proxy-trace-context-propagation/view)
- [Caddy Docker Compose Production (2026)](https://nerdleveltech.com/caddy-reverse-proxy-docker-compose-production-https-tutorial)
- [Caddy reverse_proxy directive](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy reverse_proxy health checks JSON](https://caddyserver.com/docs/json/apps/http/servers/routes/handle/reverse_proxy/health_checks/)

### 3.11 External — Hey API `openapi-ts` (OpenAPI → typed TS client, 2026 de facto)

**Adoption signal:** `@hey-api/openapi-ts` is used by Vercel, OpenCode, PayPal (production). Supports OpenAPI 2.0/3.0/3.1 (FastAPI emits 3.1 natively).

**Quick start (from `https://github.com/hey-api/openapi-ts`):**

```bash
npx @hey-api/openapi-ts -i http://localhost:8000/openapi.json -o src/client
```

**Plugin ecosystem (relevant to TheoKit Wave 2):**
- `@hey-api/typescript` — base types
- `@hey-api/sdk` — typed SDK
- `@hey-api/schemas` — runtime schemas
- `zod` plugin (v3/v4/mini) — runtime validation
- `@tanstack/react-query` — query hooks
- `@hey-api/client-fetch` — fetch-based client (no axios)
- **Vite plugin** for build-time generation (matches TheoKit's existing Vite integration)

**Hot-reload workflow:** Watcher regenerates client when backend's OpenAPI changes → frontend type errors surface immediately.

**Runtime requirements:** Node.js 22+ — matches TheoKit's existing `>= 22.12` preflight.

**TheoKit Wave 2 adoption decision:**
- **Adopt `@hey-api/openapi-ts` directly** for the typed client gen
- Wire via TheoKit Vite plugin (build-time gen + dev watcher)
- Output to `clients/agent.ts` (per-service file) with typed `services.agent.chat({ ... })` accessor
- Add `zod` plugin if user wants runtime validation (default: types only)

**Sources for §3.11:**
- [Hey API GitHub](https://github.com/hey-api/openapi-ts)
- [FastAPI Generate SDKs](https://fastapi.tiangolo.com/advanced/generate-clients/)
- [Hey API DeepWiki](https://deepwiki.com/hey-api/openapi-ts)

---

## 4. Convergent patterns (todos concordam)

1. **Declarative proxy config keyed by path prefix** — Vite (`server.proxy`), Nitro (`routeRules`), Next.js (`rewrites`), Vercel Services (path prefix routing) all do this. **TheoKit deve adotar** — `services: { name: { proxy: '/api/foo', target: 'http://localhost:8001' } }`.

2. **Hop-by-hop header stripping on every proxy hop** — Hono (`hopByHopHeaders` list in `index.ts:10-19`), `http-proxy-3` (Vite's dep) does this internally. **TheoKit deve adotar** — list at minimum: `connection, keep-alive, proxy-authenticate, proxy-authorization, te, trailer, transfer-encoding, upgrade`.

3. **Path traversal scope guard on `/**` patterns** — Nitro `isPathInScope` (`route-rules.ts:113-126`) addresses GHSA-5w89-w975-hf9q. **TheoKit deve adotar** — port the function literally, attribute origin.

4. **Adapter-per-platform with shared builder API** — SvelteKit (`adapter-{vercel,node,cloudflare,...}`), TheoKit existing 8 adapters, Astro integrations all converge here. **TheoKit Wave 2 extends** — each adapter consumes `.theo/services.json`.

5. **WebSocket upgrade handled separately from HTTP path** — Vite (`httpServer.on('upgrade')` separate from middleware), Hono (no WS in `proxy()` helper — separate `upgradeWebSocket`). **TheoKit deve seguir** — Wave 2 `services: {}` proxies HTTP only by default; `ws: true` opt-in.

6. **Hot-reload watcher for service-generated artifacts** — Hey API watcher mode, FastAPI uvicorn `--reload`, OpenAPI client gen on backend change. **TheoKit deve integrar** — Vite plugin watches `openapi.json` URL → regen client.

7. **Healthcheck convention `GET /health` returning 200/503** — Caddy health_checks, Docker Compose `healthcheck`, K8s readiness probes. **TheoKit deve fixar** (ADR-0015 invariant #4).

---

## 5. Divergent patterns (trade-off real)

1. **Service definition: convention file vs declarative config**
   - Encore: convention file `encore.service.ts` per directory (auto-discovered)
   - Nitric: SDK calls in code (`new Bucket("my-bucket")`)
   - Nitro: declarative `routeRules` in `nitro.config.ts` (only path-based, no service-level metadata)
   - Vite: declarative `server.proxy` (no service-level metadata)
   - Vercel: declarative `vercel.json` `services` block (2026)
   - **TheoKit choice (Wave 2):** declarative `services: {}` in `theo.config.ts` — matches Vite/Nitro/Vercel philosophy, NOT Encore's per-directory convention (TheoKit already uses `theo.config.ts` for everything else; consistency wins).

2. **Cross-service call: typed RPC vs untyped HTTP fetch**
   - Encore: typed RPC via `~encore/clients` virtual module
   - Nitric: typed via SDK calls
   - Nitro: untyped — user writes fetch manually
   - **TheoKit choice (Wave 2):** typed via Hey API generation — `services.agent.chat({...})` typed from OpenAPI, but service-side stays standard FastAPI/Hono (no framework lock-in).

3. **Inter-service transport: gRPC vs HTTP**
   - Nitric: gRPC streaming (locked)
   - Dapr: HTTP + gRPC (user choice)
   - Vercel Services: HTTP only (path-prefix routing)
   - **TheoKit choice (Wave 2):** HTTP/OpenAPI only — gRPC is anti-pattern for the Like-Vercel contract (gRPC over HTTP/2 needs special handling on Vercel/CF Edge, breaks "só trocar o server").

4. **Membrane/sidecar process: framework-provided vs user-written**
   - Nitric: framework-provided membrane (Go binary)
   - Dapr: framework-provided sidecar (daprd, Go binary)
   - **TheoKit choice (Wave 2):** NO framework-provided membrane — user writes their FastAPI/Hono service directly. Adapter on the platform side provides any glue (e.g., Vercel Services routing, K8s ingress for TheoCloud).

5. **Local dev orchestration: docker-compose vs single-process supervisor**
   - JHipster: generates docker-compose
   - Encore: single-process supervisor (`encore run`)
   - Vite: single-process (proxy to externally-started services)
   - **TheoKit choice (Wave 2):** **BOTH** — generated docker-compose is the "TheoCloud-shaped harness" for accurate prod-like dev; Vite `server.proxy` is the lighter path for "just start uvicorn manually + run pnpm dev". User picks.

---

## 6. Dependency inventory — bibliotecas comuns

Convergent libs (aparecem em 2+ frameworks/use cases):

| Lib | Frameworks que usam | Função | TheoKit decision |
|---|---|---|---|
| `http-proxy-3` | Vite | Battle-tested Node HTTP proxy (fork of http-proxy) | **Adotar para Node adapter** (Wave 2 prod proxy) |
| `ufo` | Nitro (extensively) | URL manipulation (`joinURL`, `withQuery`, `withoutBase`, `withLeadingSlash`) | **Adotar** — pure URL utils, no runtime cost (~5KB) |
| `@hey-api/openapi-ts` | Vercel, OpenCode, PayPal (production); FastAPI ecosystem default | OpenAPI → TS client codegen + Zod schemas + Vite plugin | **Adotar** — Wave 2 typed client gen |
| Caddy 2.11+ | Multiple Docker production setups | Reverse proxy with W3C tracing | **Recipe ship** — generated Caddyfile in docker-compose harness |
| Hono `proxy()` helper | Hono | Web Standards fetch-handler proxy (~190 LOC) | **Inline or adopt** — reference implementation for Vercel/CF/Lambda adapters |
| `h3` `proxyRequest` | Nitro | Node IncomingMessage-style proxy with header forwarding | **Avaliar** — TheoKit's existing `web-shim` may already cover; check overlap |
| `picocolors` | Vite, TheoKit existing | Terminal coloring | Already adopted |
| `dotenv-expand` | TheoKit `loadEnv` | Env var expansion | Already adopted |
| `zod` (3.x or 4.x) | TheoKit, Hono, Hey API plugin | Schema validation | Already adopted (3.x); avoid 4.x dual-package hazard per ADR D1 |

Libs **NOT** to adopt:

| Lib | Why rejected |
|---|---|
| `@nitric/sdk` (`nitric` runtime) | Locks to Nitric's gRPC membrane — opposite of Like-Vercel contract |
| `dapr-js` (Dapr SDK) | Different paradigm (infrastructure sidecar); not what TheoKit's polyglot services are |
| `grpc-js` / `@grpc/grpc-js` | Anti-pattern for Wave 2; ADR-0015 invariant #1 (HTTP/OpenAPI) |
| `http-proxy` (original, unmaintained) | `http-proxy-3` is the active fork |

---

## 7. Algorithms / data structures não-óbvios

- **`isPathInScope` (Nitro `route-rules.ts:113-126`)** — Path traversal guard for `/**` patterns. Pre-decodes `%2F` (`/`) and `%5C` (`\`) which WHATWG URL leaves opaque in paths, then uses `new URL(pre, "http://_")` to canonicalize `.` / `..` / `%2E%2E`. Returns false if canonical path escapes the base. **Complexity:** O(1) (single URL parse). Defends against CVE GHSA-5w89-w975-hf9q (match/forward differential).
- **Per-context proxy server lazy instantiation (Vite `proxy.ts:81-139`)** — `proxies: Record<string, [ProxyServer, ProxyOptions]>` — one `httpProxy.createProxyServer` per path prefix. Separates event handlers (each context has its own `on('error')`, `on('proxyReqWs')`). Avoids cross-context event bleed.
- **Hop-by-hop header double-strip (Hono `proxy/index.ts:80-82` on request, `:176-178` on response)** — RFC 2616 §13.5.1 requires hop-by-hop headers (`connection, keep-alive, ...`) to NOT be forwarded by intermediaries. Hono strips them on BOTH legs (incoming request → outgoing request, AND incoming response → outgoing response). **Why both:** the response can carry hop-by-hop headers from the upstream that shouldn't reach the client.
- **`content-encoding` + `content-length` deletion on proxy response (Hono `proxy/index.ts:179-183`)** — When the proxy re-streams the body, the body may be re-encoded by the runtime (e.g., Bun/Deno automatic gzip). The original `content-encoding` is then stale. Deleting both forces the runtime to recompute. **Subtle but important** — leaving them in produces broken responses (gzipped twice, or content-length mismatched).
- **`accept-encoding` deletion on outgoing request (Hono `proxy/index.ts:172`)** — Lets the proxy negotiate encoding with the upstream based on what the runtime can decode, instead of forwarding the client's preference (which may be `br` while the proxy runtime only handles `gzip`).
- **WebSocket upgrade is a SEPARATE event handler, not a middleware path (Vite `proxy.ts:141-186`)** — `httpServer.on('upgrade', ...)` runs BEFORE Connect/middleware chain. WebSocket upgrades don't go through the same response-writing logic; they hand off the raw socket to `proxy.ws(req, socket, head)`.

---

## 8. Edge cases conhecidos (com fonte)

| Edge case | Como manifesta | Onde foi corrigido / cataloged | Como devemos prevenir |
|---|---|---|---|
| **Path traversal via `%2F` bypass** | Encoded `..%2f` evades scope check on match-time but decodes once forwarded — escapes base scope (GHSA-5w89-w975-hf9q) | Nitro `route-rules.ts:113-126` (`isPathInScope`) | Port `isPathInScope` verbatim; cover both `%2F` and `%5C` |
| **Hop-by-Hop Header Injection** | Malicious `Connection: Authorization` forces upstream to drop Authorization header (RFC 9110 §7.6.1) | Hono `proxy/index.ts:31-44` (`strictConnectionProcessing: false` default) | Default-off; document opt-in for trusted internal traffic only |
| **CSRF via `rewriteWsOrigin: true`** | Rewriting WS Origin can let attacker proxy WS through same-origin-protected server | Vite `proxy.ts:37-39` (warning in JSDoc) | Default-off; warn loudly in TheoKit if user enables it |
| **`content-encoding` + re-stream mismatch** | Proxy forwards `content-encoding: gzip` but body was auto-decompressed by runtime → client receives gzip-of-uncompressed | Hono `proxy/index.ts:179-183` (delete both headers) | Strip both `content-encoding` and `content-length` on proxy response in our impl |
| **Slashes normalization** (`//api` collapsing) | Target URL with `//` after `joinURL` produces unintended host change | Nitro `route-rules.ts:64-66` (`replace(/^\/+/, "/")`) | Mirror Nitro's normalization |
| **WebSocket via fetch-handler doesn't work** | `proxy()` helper in Hono explicitly doesn't handle WS upgrade — calling it on a WS endpoint returns a regular Response | Hono `proxy/index.ts` (no WS path) | Separate WS proxy primitive; loud error if user proxies a WS endpoint via the HTTP `services` path |
| **Python (`uvicorn`) hot-reload race with `openapi.json` watcher** | OpenAPI changes mid-regen → Hey API gets partial schema → bad TS client | Vinta template observation (Feb 2026 blog) | Hey API watcher with debounce; on schema parse error, retry after 1s |
| **Vercel Python 500 MB bundle limit** | FastAPI + transformers/numpy exceeds 500 MB uncompressed | Vercel Python docs | Add `excludeFiles` glob in generated `vercel.json`; document in `--backend python` template README |
| **Service start order race** | Caddy boots before FastAPI is ready → 502 on first requests | Multiple Docker Compose tutorials | `depends_on: condition: service_healthy` in generated `docker-compose.yml` |
| **`Set-Cookie` from upstream service leaks to TheoKit's session** | Python service issues its own session cookie → conflicts with TheoKit encrypted session | (TheoKit-specific concern, surfaced in this analysis) | TheoKit proxy strips Set-Cookie from polyglot services by default; opt-in pass-through |
| **OpenAPI URL not reachable on cold start** | TheoKit Vite plugin tries to fetch `http://localhost:8001/openapi.json` before uvicorn is up | TheoKit-specific | Retry with backoff; pin `services.healthcheckTimeout`; skip client gen with warning if unreachable for >30s |
| **CF Workers rejects Python services** | CF Workers doesn't have Python runtime (as of 2026) | TheoKit-specific | Adapter rejects loudly with actionable error: "CF Workers does not support `runtime: 'python'`. Use Vercel/TheoCloud/Node." |

---

## 9. Implementation Guide

### 9.1 Arquitetura proposta

```
                            theo.config.ts
                                  │
                                  │ services: { agent: { runtime: 'python', ... } }
                                  ▼
                  ┌───────────────────────────────────┐
                  │  config/schema.ts (Zod)           │
                  │  - ServicesConfig                 │
                  │  - ServiceDefinition              │
                  └───────────────────────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
                  ▼ (dev)                         ▼ (build)
        ┌──────────────────┐         ┌──────────────────────────┐
        │ vite-plugin/     │         │ cli/commands/build.ts    │
        │ services-dev.ts  │         │ - writes .theo/          │
        │ - server.proxy   │         │   services.json manifest │
        │ - process spawn  │         │ - inert for empty {}     │
        │ - healthcheck    │         └──────────────────────────┘
        │   poller         │                       │
        │ - logs merge     │                       │
        └──────────────────┘                       │
                  │                                │
                  ▼ (optional)                     ▼ (per adapter)
        ┌──────────────────┐         ┌──────────────────────────┐
        │ cli/dev --       │         │ adapters/vercel.ts       │
        │   prod-like      │         │ - writes vercel.json     │
        │ (docker-compose  │         │   services block         │
        │  + Caddy +       │         │ adapters/cloudflare.ts   │
        │  healthchecks)   │         │ - rejects polyglot       │
        └──────────────────┘         │ adapters/node.ts         │
                                     │ - emits docker-compose   │
                                     │ adapters/theo-cloud.ts   │
                                     │ - emits K8s manifests    │
                                     │   (Wave 3)               │
                                     └──────────────────────────┘
                                                  │
                                                  ▼
                              ┌────────────────────────────────┐
                              │ create-theokit my-app          │
                              │   --backend python | node      │
                              │ - scaffolds services/agent-*/  │
                              │ - wires services: {} in        │
                              │   theo.config.ts               │
                              │ - generates README             │
                              └────────────────────────────────┘
                                                  │
                                                  ▼
                              ┌────────────────────────────────┐
                              │ Hey API openapi-ts plugin      │
                              │ - watches openapi.json URL     │
                              │ - regen clients/agent.ts       │
                              │ - typed services.agent.chat()  │
                              └────────────────────────────────┘
```

### 9.2 Files to create

```
packages/theo/src/
├── config/schema.ts                    ← ADD: ServicesConfig + ServiceDefinition Zod schemas
├── services/                           ← NEW directory
│   ├── types.ts                        ← TS types (z.infer from schema)
│   ├── manifest.ts                     ← .theo/services.json emit/read
│   ├── proxy.ts                        ← internal proxy helper (Hono-style, ~200 LOC)
│   ├── path-scope.ts                   ← isPathInScope (port from Nitro)
│   ├── healthcheck-poller.ts           ← polls /health with backoff
│   ├── process-spawn.ts                ← Node child_process for dev orchestration
│   ├── compose-generator.ts            ← docker-compose.yml generator
│   ├── caddy-generator.ts              ← Caddyfile generator (W3C tracing on)
│   └── openapi-client-gen.ts           ← Hey API integration (wrap in Vite plugin)
├── vite-plugin/
│   └── services-dev.ts                 ← NEW: wires services: {} → server.proxy + spawn
├── adapters/
│   ├── vercel.ts                       ← MODIFY: read services manifest, write vercel.json services block
│   ├── cloudflare.ts                   ← MODIFY: reject runtime: 'python' with error
│   ├── node.ts                         ← MODIFY: emit docker-compose for services
│   └── theo-cloud.ts                   ← NEW (Wave 3 placeholder for now): K8s manifest emit
└── cli/commands/
    ├── dev.ts                          ← MODIFY: orchestrate services on startup
    └── build.ts                        ← MODIFY: emit .theo/services.json

packages/create-theo/
├── src/cli.ts                          ← MODIFY: add --backend python | node multi-value flag
├── templates/
│   ├── default/                        ← UNCHANGED (Wave 1)
│   ├── ...
│   └── services/                       ← NEW
│       ├── agent-python/               ← FastAPI template (absorbed from theo-stacks)
│       │   ├── main.py
│       │   ├── pyproject.toml
│       │   ├── Dockerfile.tmpl
│       │   ├── .env.example
│       │   └── README.md
│       └── agent-node/                 ← NEW Hono template (NOT from theo-stacks fastify)
│           ├── src/index.ts
│           ├── package.json.tmpl
│           ├── Dockerfile.tmpl
│           └── README.md

tests/
├── unit/
│   ├── services-schema.test.ts         ← Zod schema validation
│   ├── services-proxy.test.ts          ← proxy helper unit tests
│   ├── services-path-scope.test.ts     ← isPathInScope edge cases (GHSA-5w89-w975-hf9q)
│   ├── services-manifest.test.ts       ← .theo/services.json emit/read
│   ├── services-compose-gen.test.ts    ← docker-compose generator output snapshot
│   └── services-healthcheck.test.ts    ← poller behavior
├── integration/
│   ├── services-dev-python.test.ts     ← spawn uvicorn, proxy request, healthcheck
│   ├── services-dev-node.test.ts       ← spawn Hono, proxy request, healthcheck
│   ├── services-prod-vercel.test.ts    ← adapter writes vercel.json correctly
│   └── services-prod-node.test.ts      ← adapter writes docker-compose correctly
└── e2e/
    └── services-fullstack.spec.ts      ← Playwright: app + python service end-to-end

fixtures/
├── services-python-basic/              ← minimal TheoKit + FastAPI fixture
├── services-node-basic/                ← minimal TheoKit + Hono fixture
└── services-both/                      ← TheoKit + Python + Node (multi-service)

docs/concepts/
├── services.md                         ← NEW concept doc
└── services-runtime-contract.md        ← Like-Vercel contract reference
```

### 9.3 Public API surface (TypeScript)

```ts
// packages/theo/src/config/schema.ts (additions)
import { z } from 'zod'

const ServiceRuntime = z.enum(['python', 'node'])

const ServiceDefinitionSchema = z.object({
  runtime: ServiceRuntime,
  port: z.number().int().min(1).max(65535),
  proxy: z.string().regex(/^\/[a-zA-Z0-9\-_/]*$/, 'proxy must be a URL path starting with /'),
  dev: z.string().min(1),        // command, e.g., 'uvicorn main:app --reload --port 8001'
  build: z.string().optional(),  // optional build command
  start: z.string(),             // prod start, e.g., 'uvicorn main:app --port 8001 --workers 4'
  openapi: z.string().url().optional(),       // for typed-client gen; default infers from port + /openapi.json
  healthcheck: z.string().default('/health'),
  cors: z.boolean().default(false),  // see CSRF risks (Vite divergent #4)
  env: z.record(z.string()).optional(),       // service-specific env injection
  dependsOn: z.array(z.string()).optional(),  // other services this depends on (boot order)
})

export type ServiceDefinition = z.infer<typeof ServiceDefinitionSchema>
export type ServicesConfig = Record<string, ServiceDefinition>

// In TheoConfigSchema:
services: z.record(ServiceDefinitionSchema).default({}),
```

```ts
// packages/theo/src/services/types.ts (re-exports + manifest)
export type { ServiceDefinition, ServicesConfig } from '../config/schema'

export interface ServicesManifest {
  version: 1
  services: Array<ServiceDefinition & { name: string }>
}

export function loadServicesManifest(cwd: string): ServicesManifest | null
export function writeServicesManifest(cwd: string, manifest: ServicesManifest): void
```

```ts
// packages/theo/src/services/proxy.ts (internal helper, Hono-style)
export interface ProxyOptions {
  target: string                     // 'http://localhost:8001'
  rewrite?: (path: string) => string
  customFetch?: typeof fetch
  stripBase?: string                 // for /**-style scoping
}

export async function proxyFetch(
  request: Request,
  options: ProxyOptions
): Promise<Response>
```

```ts
// packages/theo/src/services/path-scope.ts (Nitro port)
export function isPathInScope(pathname: string, base: string): boolean
```

```ts
// User-facing — virtual module emitted by Vite plugin (Wave 2 stretch)
import { services } from 'virtual:theokit/services'
// services.agent.chat({ message: '...' })  — typed via Hey API gen
```

### 9.4 Dependências a adotar

| Package | Version | Justification | Wave |
|---|---|---|---|
| `http-proxy-3` | `^1.x` | Battle-tested Node proxy; Vite already uses it | 2 (Node adapter prod path) |
| `ufo` | `^1.x` | URL utils (`joinURL`, `withQuery`, `withoutBase`, `withLeadingSlash`); Nitro uses extensively | 2 |
| `@hey-api/openapi-ts` | `^0.x` (latest stable) | OpenAPI → TS client (de facto 2026; Vercel/OpenCode/PayPal use) | 2 |
| `@hey-api/client-fetch` | `^0.x` | Fetch-based runtime client (no axios) | 2 |
| `@hey-api/zod` plugin | latest | Optional runtime validation (opt-in via `validate: true`) | 2 (opt-in) |

Caddy and Docker Compose are **runtime artifacts generated by TheoKit**, not npm deps.

No new deps for path-scope (port the function directly from Nitro `route-rules.ts:113-126` with attribution).

### 9.5 Test strategy

**Unit (TDD primary):**

- `services-schema.test.ts` — Zod schema accepts valid configs, rejects:
  - missing `runtime`
  - `proxy` not starting with `/`
  - `port` out of range
  - `runtime: 'go'` (Wave 2 only Python+Node)
  - circular `dependsOn`
- `services-proxy.test.ts` — Hono-style proxy:
  - happy path GET (status, body, headers forwarded)
  - hop-by-hop headers stripped on request
  - hop-by-hop headers stripped on response
  - `content-encoding` + `content-length` deleted on response
  - `accept-encoding` deleted on outgoing request
  - body streamed with `duplex: 'half'`
  - `customFetch` override
  - upstream 5xx → relayed as-is
  - `stripBase` for `/**` patterns
- `services-path-scope.test.ts` — Nitro port:
  - `/api/agent/x` in scope `/api/agent` → true
  - `/api/agent/../escape` in scope `/api/agent` → false (after canonicalization)
  - `/api/agent%2Fescape` → decodes to `/api/agent/escape` → true
  - `/api%2Fagent%2F..%2Fescape` → decodes + canonicalizes → false (GHSA case)
  - `/api/agent\\foo` (`%5C`) → decoded → false
  - malformed URL → false (no throw)
- `services-manifest.test.ts` — snapshot test of generated `.theo/services.json` from fixture config
- `services-compose-gen.test.ts` — snapshot test of generated `docker-compose.yml` from fixture services
- `services-healthcheck.test.ts` — poller:
  - returns true on first 200
  - returns false on N consecutive 503s
  - backoff between attempts
  - timeout abort

**Integration:**

- `services-dev-python.test.ts` — spawn real uvicorn, hit proxy endpoint, expect 200 with body, verify traceparent in upstream logs
- `services-dev-node.test.ts` — spawn real Hono service via tsx, same assertions
- `services-prod-vercel.test.ts` — run vercel adapter on services fixture, assert `vercel.json` shape includes services block matching 2026 schema
- `services-prod-node.test.ts` — run node adapter, assert `docker-compose.yml` shape includes web + service(s) + caddy + healthchecks

**E2E (Playwright):**

- `services-fullstack.spec.ts` — `pnpm dev` boots TheoKit + FastAPI service, browser navigates to `/`, clicks a button that calls `/api/agent/echo` via typed client, response renders. Verify traceparent propagated end-to-end via log assertion.

**Fixtures:**

- `services-python-basic/` — minimal scaffold reproducing `--backend python` output
- `services-node-basic/` — minimal scaffold reproducing `--backend node` output
- `services-both/` — multi-service scenario for adapter tests

### 9.6 Phases of rollout

**Phase 1 — Schema + manifest + proxy helper (week 1)**
- `services` Zod schema in `config/schema.ts`
- `proxy.ts` + `path-scope.ts` (port from Nitro + Hono)
- `manifest.ts` emit/read
- Unit tests green (target: 30+ tests)
- **Done when:** `defineConfig({ services: {} })` accepts empty (BC), and a fixture config validates + roundtrips through manifest

**Phase 2 — Dev orchestration (week 1-2)**
- `vite-plugin/services-dev.ts` wires `server.proxy` from `services: {}`
- `process-spawn.ts` boots services on `pnpm dev`
- `healthcheck-poller.ts` blocks readiness until all services healthy
- Log merge (with `[service-name]` prefix)
- **Done when:** fixture `services-python-basic` boots end-to-end with `pnpm dev` and proxy works in browser

**Phase 3 — Production adapters (week 2-3)**
- Vercel adapter: write `vercel.json` services block (per 2026 spec)
- Node adapter: emit `docker-compose.yml` + `Caddyfile`
- Cloudflare adapter: reject `runtime: 'python'` with actionable error
- Other adapters (Bun/Deno/Lambda/Netlify): assess + reject loudly if `services` is non-empty (deferred)
- **Done when:** `theokit build --target vercel` produces a valid Vercel Services deployment artifact

**Phase 4 — Scaffolder absorption (week 3)**
- `--backend python` flag generates `services/agent-python/` (FastAPI template absorbed from theo-stacks)
- `--backend node` flag generates `services/agent-node/` (NEW Hono template)
- `--backend python --backend node` supported (multi-service)
- `theo-stacks` repo gets MIGRATION.md pointing here
- **Done when:** `npx create-theokit my-app --backend python && cd my-app && pnpm dev` works end-to-end

**Phase 5 — Typed client + docs (week 3-4)**
- Hey API integration via Vite plugin
- `services.agent.chat({ ... })` typed accessor (virtual module)
- `docs/concepts/services.md` + `docs/concepts/services-runtime-contract.md`
- **Done when:** type errors surface in frontend when backend OpenAPI changes

### 9.7 Acceptance criteria

- [ ] `defineConfig({ services: {} })` accepts empty (Wave 1 BC preserved)
- [ ] `defineConfig({ services: { agent: {...} } })` validates with Zod; clear errors on invalid
- [ ] `pnpm dev` with services boots all services + waits for healthchecks
- [ ] `pnpm build` emits `.theo/services.json` matching the manifest schema
- [ ] Vercel adapter produces a valid Vercel Services artifact (2026 spec)
- [ ] Node adapter produces a `docker-compose.yml` + `Caddyfile` that runs end-to-end
- [ ] Cloudflare adapter rejects `runtime: 'python'` with actionable error
- [ ] `npx create-theokit my-app --backend python` scaffolds a working FastAPI sidecar
- [ ] `npx create-theokit my-app --backend node` scaffolds a working Hono sidecar
- [ ] Typed client generation via Hey API works on dev (hot-reload) and build
- [ ] `traceparent` propagates end-to-end (TheoKit → service → logs)
- [ ] Path traversal blocked via `isPathInScope` (GHSA-5w89-w975-hf9q)
- [ ] Hop-by-hop headers stripped both directions
- [ ] All 12 edge cases from §8 have tests
- [ ] `tsc --noEmit` clean
- [ ] `pnpm test` green (target: 60+ new tests)
- [ ] Playwright spec passes (`services-fullstack.spec.ts`)
- [ ] Dogfood check: `theokit dogfood --full` health ≥ 80/100
- [ ] `docs/concepts/services.md` published with decision table (server/ covers end-to-end; sidecars opt-in)

### 9.8 Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cross-product contract divergence (Vercel adapter accepts shape A; TheoCloud adapter wants shape B) | MEDIUM | Manifest schema versioned (`version: 1`); each adapter PR includes integration test asserting it accepts the canonical manifest; ADR-0015 invariant #4 (cross-product global) |
| Vercel Services API changes (it's new in 2026) | MEDIUM | Pin against the docs snapshot; subscribe to Vercel changelog; smoke test in CI against a real Vercel deploy |
| Hey API tool churn (new version breaks generated client shape) | LOW | Pin Hey API version; freeze generated output via snapshot test on a fixture's `clients/agent.ts` |
| Python on Vercel exceeds 500 MB | MEDIUM | Generate `excludeFiles` glob in `vercel.json`; README warning for users adding heavy deps |
| User runs `pnpm dev` but uvicorn fails to start | HIGH | Healthcheck poller fails fast with actionable message ("service 'agent' on port 8001 did not respond on /health after 30s") |
| Caddy version drift (2.11 → newer) breaks generated config | LOW | Pin Caddy version in generated `docker-compose.yml`; document upgrade in CHANGELOG |
| WebSocket proxy not supported in Wave 2 | known limit | Document: "Wave 2 `services: {}` proxies HTTP only. For WebSocket sidecars, file an issue with use case." |
| Bun/Deno/Lambda adapters reject `services: {}` non-empty | known limit | Loud actionable error: "Adapter X does not support polyglot services. Use Vercel/Node/TheoCloud." |
| Python and Node templates require Docker for prod-like local dev | accepted | Documented in `--backend` templates' README; lighter "Vite proxy only" path remains for simpler use |
| `Set-Cookie` from service leaks to TheoKit's session | MEDIUM | Proxy strips upstream `Set-Cookie` by default; opt-in pass-through via `services.<name>.passSetCookie: true` |

---

## 10. Open questions

These items DID NOT reach a confident answer in research. Each becomes a TODO before implementation:

1. **Hey API plugin choice for Vite integration:** `@hey-api/openapi-ts` has a Vite plugin AND a CLI. Which is better for TheoKit's vite-plugin layer? Vite plugin is more native but adds a build-time dep; CLI is more portable. **Spike needed:** prototype both in the Phase 1 fixture.

2. **Vercel Services manifest exact schema:** Vercel docs describe the feature but the JSON shape of `vercel.json > services` block needs to be captured from a real Vercel project as of 2026. **Resolve by:** create a 5-min throwaway Vercel project with Node + Python sidecar, snapshot the `vercel.json`. Pin against snapshot.

3. **Node service template — Hono vs Fastify vs Express:** Hono is the fetch-handler-native choice (matches Like-Vercel). Fastify has wider adoption but uses IncomingMessage. Express is legacy. **Recommendation:** Hono (decided in ADR-0013). **Open:** confirm with `dogfood-npm` smoke testing before finalizing.

4. **Service discovery vs explicit declaration:** Encore uses `encore.service.ts` convention; TheoKit Wave 2 plan uses explicit `services: {}`. **Should we also auto-discover services in `services/*/`?** Convention reduces config but adds magic. **Recommendation:** explicit only in Wave 2; revisit if friction surfaces.

5. **`@usetheo/sdk` agent runtime in a Python service?** ADR-0012 invariant #2 says TS-only for Wave 2. But the boundary "Python service is tool/data provider, not agent" needs concrete documentation: what if a Python service WANTS to call an LLM directly (e.g., specialized embedding pipeline)? It can — but it MUST NOT be advertised as "running an Agent". **Resolve by:** doc in `docs/concepts/services.md` with examples and counter-examples.

6. **CSRF for cross-origin proxy targets:** if `services.agent.target` is `http://external-api.com` (not local), the TheoKit's CSRF defenses become brittle. **Should `services: {}` reject non-localhost targets in Wave 2?** Lean: yes (Wave 2 is for local-or-managed sidecars; external API integration is out of scope; use a Hono route handler in `server/routes/` for that).

7. **Telegram/gateway sidecar pattern:** `@usetheo/gateway-telegram` runs in the TheoKit TS process today. Should it become a "service" in `services: {}` for operational isolation? **Recommendation:** keep in-process by default; document the migration path to sidecar for users who want isolation.

---

## 11. Referências citadas (todos os arquivos do inventário)

### nitro

#### Core
- `referencias/nitro/src/config/resolvers/route-rules.ts:1-73` — route rules resolution (declarative → runtime); §3.1 (algoritmo), §5 (pattern)
- `referencias/nitro/src/runtime/internal/route-rules.ts:1-127` — runtime proxy executor; §3.1, §7 (isPathInScope), §8 (path traversal)
- `referencias/nitro/src/runtime/internal/app.ts:1-200+` — Nitro app fetch handler + route rule application; §3.1
- `referencias/nitro/src/routing.ts` — routeRules wiring (seletivo); §3.1
- `referencias/nitro/src/build/virtual/routing.ts` — RuntimeRouteRules type (must keep in sync per comment in `route-rules.ts:8`); §3.1

#### Support
- `referencias/nitro/src/types/config.ts` — NitroRouteConfig type; §3.1
- `referencias/nitro/src/types/nitro.ts` — RuntimeRouteRules type; §3.1
- `referencias/nitro/src/cli/commands/dev.ts` — dev orchestration (seletivo); §3.1

#### Doc / adapters
- `referencias/nitro/src/presets/vercel/utils.ts` — Vercel preset; §5 (adapter translation)
- `referencias/nitro/src/presets/cloudflare/utils.ts` — Cloudflare preset; §5
- `referencias/nitro/src/presets/netlify/utils.ts` — Netlify preset; §5

### hono

#### Core
- `referencias/hono/src/helper/proxy/index.ts:1-190` — canonical fetch-handler proxy; §3.2, §6 (deps), §7 (hop-by-hop), §8 (header injection)

#### Test (seletivo)
- `referencias/hono/src/helper/proxy/index.test.ts:1-336` — proxy test cases; §8 (edge case enumeration)

#### Support (seletivo)
- `referencias/hono/src/hono-base.ts` — fetch handler base; §3.2

### vite

#### Core
- `referencias/vite/packages/vite/src/node/server/middlewares/proxy.ts:1-236` — Vite dev-server proxy middleware; §3.3, §6 (`http-proxy-3`), §7 (per-context lazy bind), §8 (WS upgrade)

### encore

#### Core
- `referencias/encore/runtimes/js/encore.dev/service/mod.ts:1-25` — Service class definition; §3.4
- `referencias/encore/tsparser/src/builder/templates/entrypoints/services/*` — codegen entrypoints (seletivo); §3.4

#### Doc (fixtures showing pattern)
- `referencias/encore/e2e-tests/testdata/tsapp/service1/encore.service.ts:1-18` — convention file pattern; §3.4
- `referencias/encore/e2e-tests/testdata/tsapp/service1/api.ts:1-80` — `api()` + `~encore/clients` virtual module usage; §3.4

### nitric

#### Doc / Core
- `referencias/nitric/README.md` — positioning (multi-language framework); §3.5
- `referencias/nitric/core/pkg/server/server.go` — membrane (seletivo); §3.5
- `referencias/nitric/core/pkg/workers/{apis,http,jobs,topics,schedules}/*.go` — worker registration patterns (seletivo); §3.5

### dapr

#### Doc
- `referencias/dapr/README.md` — positioning (infrastructure sidecar); §3.6
- `referencias/dapr/docs/decision_records/api/API-007-tracing-endpoint.md` — Dapr tracing ADR; §3.6 (gap analysis vs TheoKit invariant #6)
- `referencias/dapr/docs/decision_records/architecture/ARC-002-multitenancy.md` (seletivo); §3.6
- `referencias/dapr/docs/decision_records/architecture/ARC-003-grpc-protobuf-coding-convention.md` (seletivo); §3.6

### sveltekit

#### Core
- `referencias/sveltekit/packages/adapter-vercel/index.js:1-80+` — adapter shape; §3.7
- `referencias/sveltekit/packages/adapter-{node,cloudflare,netlify,static,auto}/index.js` — adapter-per-platform (seletivo); §3.7

### next.js

#### Core (seletivo)
- `referencias/next.js/packages/next/src/server/server-route-utils.ts` — rewrites resolution; §3.8
- `referencias/next.js/packages/next/src/server/config-schema.ts` — rewrites schema; §3.8
- `referencias/next.js/packages/next/src/server/server-utils.ts` — rewrite resolver runtime; §3.8

### URLs externas

- [Vercel Services docs](https://vercel.com/docs/services) — 2026 polyglot deploy primitive; §3.9, §6, §9.6 Phase 3, §10.2
- [Vercel FastAPI runtime docs](https://vercel.com/docs/frameworks/backend/fastapi) — FastAPI on Vercel native; §3.9
- [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python) — 500MB limit, entrypoints; §3.9, §8 (bundle limit)
- [Nemanja Mitic — Deploying FastAPI + Next.js to Vercel (Feb 2026)](https://nemanjamitic.com/blog/2026-02-22-vercel-deploy-fastapi-nextjs/) — monorepo config tips; §3.9, §8 (race condition)
- [Vinta Software — FastAPI + Next.js Monorepo Guide](https://www.vintasoftware.com/blog/nextjs-fastapi-monorepo) — typed client integration; §3.11, §8 (hot-reload race)
- [vintasoftware/nextjs-fastapi-template](https://github.com/vintasoftware/nextjs-fastapi-template) — reference repo; §3.11
- [Hey API openapi-ts GitHub](https://github.com/hey-api/openapi-ts) — codegen tool; §3.11, §6
- [Hey API DeepWiki](https://deepwiki.com/hey-api/openapi-ts) — plugin ecosystem; §3.11
- [FastAPI Generate Clients docs](https://fastapi.tiangolo.com/advanced/generate-clients/) — OpenAPI gen guide; §3.11
- [OneUptime — Caddy W3C Trace Context (Feb 2026)](https://oneuptime.com/blog/post/2026-02-06-caddy-reverse-proxy-trace-context-propagation/view) — traceparent auto-propagation; §3.10, §4 (convergent pattern #7)
- [Nerd Level Tech — Caddy Docker Compose 2026](https://nerdleveltech.com/caddy-reverse-proxy-docker-compose-production-https-tutorial) — production HTTPS setup; §3.10
- [Bomberbot — Mastering Caddy with Docker](https://www.bomberbot.com/proxy/mastering-caddy-with-docker-the-definitive-guide/) — service routing labels; §3.10
- [Caddy reverse_proxy directive](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) — official ref; §3.10
- [Caddy reverse_proxy health checks](https://caddyserver.com/docs/json/apps/http/servers/routes/handle/reverse_proxy/health_checks/) — health probes; §3.10
- [MyAngle — Caddy Reverse Proxy Docker Compose (Feb 2026)](https://myangle.net/caddy-reverse-proxy-docker-compose-example/) — segmented networks; §3.10
- [GHSA-5w89-w975-hf9q](https://github.com/h3js/h3/security/advisories/GHSA-5w89-w975-hf9q) — original CVE that motivated Nitro's `isPathInScope`; §7, §8

### Internal TheoKit references consulted

- `packages/theo/src/adapters/vercel.ts:19-60` — current Vercel adapter shape (fetch-handler wrap reference); §3.7 (informs Wave 2 modification)
- `packages/theo/src/config/schema.ts` — existing config schema (to be extended with `services` field); §9.3
- `packages/create-theo/templates/default/` — current TheoKit scaffolder templates (precedent for `--backend` flag); §9.6 Phase 4

---

## Validation — automated check before finalizing

```bash
SLUG="polyglot-services-orchestration"
DOC=".claude/knowledge-base/reference/$SLUG.md"

# Frameworks deep-read: 9 (nitro, hono, vite, encore, nitric, dapr, sveltekit, next.js, vercel-external)  ≥ 3 ✓
# Patterns identified: 7 convergent + 5 divergent = 12  ≥ 5 ✓
# Edge cases with source: 12  ≥ 5 ✓
# Implementation Guide subsections: 9.1-9.8 = 8  ✓
# Open questions: 7  ≥ 2 ✓
# References section: all inventory files + external URLs cited  ✓
# Discarded files have explicit justification  ✓
```
