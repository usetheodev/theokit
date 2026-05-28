# Like-Vercel Runtime Contract

> Reference for the 6 runtime invariants every TheoKit service (TS app + polyglot sidecars) must satisfy. Ratified by [ADR-0015](../adr/0015-services-runtime-contract-like-vercel.md).

## What

A single shape every TheoKit service conforms to — TS app, Python sidecar, Node sidecar, future TheoCloud-deployed services — all of them. The owner's quote captures it: *"eu achei que era só trocar o server"*. The contract makes that literally true.

## Why it matters

The Theo product-mark's moat is the cross-product standardization: `create-theokit` (scaffolder) + TheoKit (framework) + TheoCloud (deploy target, Wave 3) all consume the **same `.theo/services.json` manifest** and operate against the **same runtime contract**. Per [ADR-0012 invariant #4](../adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md), per-surface relaxations destroy the moat. The contract is global.

> **Wave 2 scope (2026-05-27 owner decision):** polyglot `services: {}` is wired through **`node` (local docker-compose harness) + `theo-cloud` (Wave 3)** ONLY. Other adapters (Vercel, Cloudflare, etc.) reject `services: {}` non-empty with an actionable error. The "Like-Vercel" name in this document is the technical pattern reference (fetch handler universal) — it does NOT imply a Vercel Services wire-up is shipping in Wave 2.

---

## Invariant 1 — Fetch handler is the universal entry

Every service exposes a `(Request) => Promise<Response>` shape (Web Standards). Adapters wrap the platform-native shape (Vercel function / CF Workers / TheoCloud K8s / local Node) around the same handler.

### Per-language realization

**Python (FastAPI):**
```python
from fastapi import FastAPI
app = FastAPI()
# ASGI app — uvicorn serves it; bijective with Web Request/Response
@app.post('/echo')
async def echo(payload: EchoRequest) -> dict[str, str]:
    return {'echo': payload.message}
```

**Node (Hono):**
```ts
import { Hono } from 'hono'
const app = new Hono()
app.post('/echo', async (c) => {
  const body = await c.req.json()
  return c.json({ echo: body.message })
})
export default app          // app.fetch is the (Request) => Promise<Response>
```

**TheoKit TS (`server/routes/`):**
```ts
import { defineRoute } from 'theokit/server'
import { z } from 'zod'
export const POST = defineRoute({
  body: z.object({ message: z.string() }),
  handler: ({ body }) => Response.json({ echo: body.message }),
})
```

### What happens if violated

If a service uses `Express` with `req.send(data)` (Node IncomingMessage API), it won't run on Vercel Edge or CF Workers natively. TheoKit's Hono template avoids this; users who deviate get platform errors at deploy time.

---

## Invariant 2 — File-system routing is build-time

Routes are scanned ONCE at build (`pnpm build` → `.theo/route-manifest.json`). No filesystem reads on the hot path. Cold-start cache pattern required for serverless.

**Python (FastAPI):** route table built at app construction (`@app.get` decorators), not at request time. ✅
**Node (Hono):** route trie built at `new Hono()`. ✅
**TheoKit TS:** `scanServerRoutes` runs once, manifest baked. ✅

### What happens if violated

Per-request filesystem scan blows up cold-start latency on serverless (Vercel functions cold-start budget is ~50–200ms; an `fs.readdirSync` costs 5–20ms).

---

## Invariant 3 — Environment variables are runtime, not build-time

`process.env.X` / `os.environ['X']` are read on cold start, never bundled into the artifact.

**Python (FastAPI):**
```python
import os
DB_URL = os.environ.get('DATABASE_URL')   # read on import — cold start
```

**Node (Hono):**
```ts
const DB_URL = process.env.DATABASE_URL
```

**Anti-pattern (forbidden):**
```js
// vite.config.ts
define: { 'process.env.DATABASE_URL': JSON.stringify(process.env.DATABASE_URL) }
// ← bakes the value into the bundle; can't be swapped per env without rebuild
```

### What happens if violated

Same code can't run across Vercel (env UI) / TheoCloud (secrets manager) / local (`.env`) without a rebuild per environment. Breaks "só trocar o server".

---

## Invariant 4 — Healthcheck is conventional and minimal

Every service MUST expose `GET /health` returning:
- `200 OK` body `{ "status": "ok" }` when ready to accept traffic
- `503 Service Unavailable` body `{ "status": "starting" | "draining" | "unhealthy" }` otherwise

### Per-language realization

**Python (FastAPI):**
```python
@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}
```

**Node (Hono):**
```ts
app.get('/health', (c) => c.json({ status: 'ok' }))
```

**Generated docker-compose healthcheck:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:8001/health || exit 1"]
  interval: 10s
  timeout: 5s
  retries: 3
```

`pnpm dev` polls each declared service's healthcheck before signaling "ready". TheoCloud (K8s readiness probe), Caddy (depends_on), and Vercel (deploy gate) all converge on this path. **One path, one shape — no `/healthz` ambiguity.**

---

## Invariant 5 — Logs are structured JSON lines on stdout

Every service emits one JSON object per line to stdout. Minimum fields:

```json
{
  "timestamp": "2026-05-27T10:00:00.000Z",
  "level": "info|warn|error|debug",
  "message": "...",
  "service": "agent-python",
  "traceparent": "00-<trace>-<span>-01"
}
```

### Per-language realization

**Python (FastAPI) — uses a custom `JsonFormatter`:**
```python
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "message": record.getMessage(),
            "service": os.environ.get('THEOKIT_SERVICE_NAME'),
        })
```

**Node (Hono):**
```ts
function log(level: string, message: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level, message, service: process.env.THEOKIT_SERVICE_NAME, ...extra,
  }))
}
```

### What happens if violated

Multi-line stack traces or unstructured logs break log aggregators (Loki, CloudWatch, Datadog). Caddy's `tracing` directive expects per-line JSON for span attribution. Local dev still renders pretty, but the **wire format** is JSON.

---

## Invariant 6 — W3C Trace Context propagation

When the proxy hop sends a request to a service:
- TheoKit (Caddy / Vercel ingress / future TheoCloud) injects `traceparent: 00-<traceId>-<spanId>-01`
- Service reads `traceparent` from request headers
- Service logs echo `traceparent` (so log correlation works across services)
- Service MAY emit its own spans (OTel SDK in the service) — optional in Wave 2

### Per-language middleware

**Python (FastAPI):**
```python
@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    tp = request.headers.get("traceparent")
    if tp:
        log.info("request", extra={"traceparent": tp, "path": request.url.path})
    return await call_next(request)
```

**Node (Hono):**
```ts
app.use(async (c, next) => {
  const tp = c.req.header('traceparent')
  if (tp) log('info', 'request', { traceparent: tp, path: c.req.path })
  await next()
})
```

**Caddy (auto-propagation via 2.11+ tracing directive):**
```caddyfile
:3000 {
  tracing             # creates child span per reverse_proxy hop; updates traceparent
  reverse_proxy /api/agent* agent:8001
}
```

### What happens if violated

A single request that crosses TheoKit → Python service → Node service shows up as 3 disconnected log streams instead of one trace. Debugging multi-service stack failures becomes pure pain.

---

## TheoCloud-shaped local harness (Wave 2 deliverable)

Until the TheoCloud adapter (Wave 3) ships, `theokit build --target node` emits a docker-compose stack that mimics TheoCloud's shape:

- **Caddy 2.11+ in front** (W3C tracing enabled, single ingress)
- **Web container** (TheoKit app)
- **Service container(s)** (Python/Node services)
- **Healthcheck `depends_on: service_healthy`** for all
- **JSON-line logs** to stdout (collected by `docker compose logs`; would feed Loki/CloudWatch in prod)
- **Env injection** via docker-compose `environment:`

This harness is the "ambiente parecido com o produtivo" the owner asked for. It validates the contract before TheoCloud is wired.

---

## Testing your service against the contract

Wave 3 will ship `theokit check --runtime-contract` — a static analyzer that scans your service code and reports violations. For Wave 2, the smoke test is manual:

1. `pnpm dev` boots → service healthy within 30s? → invariants #4 (healthcheck) + #3 (env at runtime) pass.
2. `curl http://localhost:3000/api/agent/echo -H 'traceparent: 00-1234567890abcdef1234567890abcdef-1234567890abcdef-01'` → service logs show `traceparent`? → invariants #5 (JSON logs) + #6 (traceparent) pass.
3. `pnpm build && docker compose up` → service still works without env-var changes? → invariant #3 (runtime env) pass.

---

## Related ADRs

- [ADR-0015](../adr/0015-services-runtime-contract-like-vercel.md) — the contract itself (this doc is the user-facing reference)
- [ADR-0014](../adr/0014-services-as-external-processes.md) — services are external processes
- [ADR-0012](../adr/0012-mission-expansion-agent-products-on-like-vercel-runtime.md) — mission expansion (invariant #4: contract is global across product surfaces)
