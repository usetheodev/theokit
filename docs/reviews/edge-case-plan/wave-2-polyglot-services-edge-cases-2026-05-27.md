# Edge Case Review — wave-2-polyglot-services

Date: 2026-05-27
Tasks analisadas: 22 (T0.1-T0.4, T1.1-T1.5, T2.1-T2.4, T3.1-T3.4, T4.1-T4.3, T5.1-T5.3)
Edge cases encontrados: 31 (MUST FIX: 10, SHOULD TEST: 13, DOCUMENT: 8)

**Veredicto:** PLANO PRECISA DE AJUSTE — 10 MUST FIX devem ser incorporados antes da implementação. Nenhum exige nova arquitetura; todos resolvem com 1-3 LOC ou Zod refine.

---

## MUST FIX

### EC-1: Port collision across services não é detectado pelo schema

- **Task afetada:** T1.1
- **Família:** Input / Validation
- **Cenário:** User declara `services: { a: { port: 8001, ... }, b: { port: 8001, ... } }`. Schema individual valida cada entry mas não cross-service. Em dev, ambos spawn-tentam bindar `:8001` → segundo falha com `EADDRINUSE`. T2.4 healthcheck timeout captura — mas error message vago ("service b failed to be healthy").
- **Impacto:** Confusing dev failure; user demora a achar a causa.
- **Fix sugerido:** Adicionar `z.refine` no `ServicesConfigSchema` em T1.1:
  ```ts
  .refine((s) => {
    const ports = Object.values(s).map(v => v.port)
    return new Set(ports).size === ports.length
  }, { message: 'duplicate port across services' })
  ```

### EC-2: `service.port` colide com TheoKit web port (3000 default)

- **Task afetada:** T1.1
- **Família:** Input / Validation
- **Cenário:** User declara `services: { agent: { port: 3000, ... } }`. TheoKit web também usa 3000. EADDRINUSE no startup. Sintoma idêntico a EC-1 mas raiz diferente.
- **Impacto:** Mesmo do EC-1 — confusion.
- **Fix sugerido:** Refine cross-config:
  ```ts
  // após config root está disponível, em config/schema.ts no .refine() do TheoConfigSchema:
  .refine((cfg) => !Object.values(cfg.services ?? {}).some(s => s.port === cfg.port),
    { message: 'service.port collides with TheoKit web port' })
  ```

### EC-3: Service name colide com nome reservado (`web`, `caddy`)

- **Task afetada:** T1.1
- **Família:** Input / Validation
- **Cenário:** User declara `services: { web: { ... } }` ou `services: { caddy: { ... } }`. Em T3.3, o docker-compose generator emite tanto `services: { web: ..., caddy: ... }` quanto o user-declared. Compose YAML colide.
- **Impacto:** Build fails OR worse, override silently — compose produces malformed stack.
- **Fix sugerido:** Refine no schema rejeitando reserved names:
  ```ts
  const RESERVED = ['web', 'caddy', 'postgres', 'redis']
  ServicesConfigSchema.refine(s => !Object.keys(s).some(k => RESERVED.includes(k)),
    { message: 'service name conflicts with reserved name (web/caddy/postgres/redis)' })
  ```

### EC-4: `service.proxy === '/'` captura tudo, conflita com TheoKit's próprio routing

- **Task afetada:** T1.1
- **Família:** Input / Boundary
- **Cenário:** User declara `proxy: '/'`. Regex atual `/^\/[a-zA-Z0-9\-_/]*$/` aceita `/`. Vite proxy / Caddy `reverse_proxy /*` capturariam TODAS as requests, inclusive `/`, `/api/auth/login`, etc. — TheoKit app fica inacessível.
- **Impacto:** Catastrophic — TheoKit's próprias rotas viram unreachable.
- **Fix sugerido:** Tightening do regex em T1.1:
  ```ts
  proxy: z.string().regex(/^\/[a-zA-Z0-9\-_/]+$/, 'proxy must be a non-root path starting with /')
  // mudança: + em vez de * — exige pelo menos 1 caractere após /
  ```

### EC-5: `Host` header forwarded to upstream → quebra virtual-hosted services

- **Task afetada:** T1.3
- **Família:** I/O / Boundary
- **Cenário:** TheoKit recebe request `Host: theokit.example.com`. `proxyFetch` re-emite Request para `http://localhost:8001` mas Host header ainda diz `theokit.example.com`. Hono apps com host-based routing tratam errado; SSRF defense detection pode bloquear; logs upstream registram domain errado.
- **Impacto:** Subtle bug — sometimes works (uvicorn/FastAPI ignoram Host), sometimes break.
- **Fix sugerido:** Em `proxyFetch` (T1.3), após construir outgoing headers, set Host para target:
  ```ts
  const targetUrl = new URL(target)
  outgoingHeaders.set('host', targetUrl.host)
  ```
  Hono's proxy helper não faz isso explicitamente; é uma melhoria explícita para o caso TheoKit.

### EC-6: `writeManifest` falha se `.theo/` não existe

- **Task afetada:** T1.4
- **Família:** I/O / Resource
- **Cenário:** Fresh project, `pnpm build` rodando pela primeira vez. `.theo/` ainda não existe → `fs.writeFileSync('.theo/services.json', ...)` lança ENOENT.
- **Impacto:** Build falha de forma confusa no fresh project.
- **Fix sugerido:** Em `writeManifest` (T1.4):
  ```ts
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2))
  ```

### EC-7: Orphan child processes quando TheoKit parent recebe SIGKILL

- **Task afetada:** T2.2
- **Família:** State / Resource
- **Cenário:** `pnpm dev` rodando; user fecha terminal abruptamente (SIGKILL no Node parent). Child processes (uvicorn, tsx) permanecem rodando, bindados em :8001/:8002. Próximo `pnpm dev` → EADDRINUSE. User fica sem entender.
- **Impacto:** "Why is port 8001 in use?" debugging session every time terminal is force-closed.
- **Fix sugerido:** Em `spawnServices` (T2.2), registrar handlers:
  ```ts
  process.on('exit', () => { children.forEach(c => c.process.kill('SIGKILL')) })
  process.on('SIGINT', async () => { await stopAllServices(children); process.exit(130) })
  process.on('SIGTERM', async () => { await stopAllServices(children); process.exit(143) })
  ```
  Nota: SIGKILL no parent não pode disparar JS handlers — mas SIGINT/SIGTERM podem; `process.on('exit')` cobre normal shutdown. O caso SIGKILL fica como DOCUMENT (impossível de prevenir).

### EC-8: Templates referenciam `THEOKIT_SERVICE_NAME` mas T2.2 não injeta

- **Task afetada:** T2.2 + T4.1 + T4.2
- **Família:** Integration
- **Cenário:** Template Python (T4.1) `main.py` lê `os.environ.get("THEOKIT_SERVICE_NAME", "agent-python")`. Template Node (T4.2) similar. Mas `spawnServices` (T2.2) só injeta `service.env` user-declared, não nenhum env convention da framework. → logs sempre mostram fallback `"agent-python"`, mesmo quando service se chama `agent`.
- **Impacto:** Logs identificam service errado; debugging multi-service vira pesadelo.
- **Fix sugerido:** Em `spawnServices` (T2.2), auto-inject convention env vars:
  ```ts
  const env = {
    ...process.env,
    THEOKIT_SERVICE_NAME: name,
    THEOKIT_SERVICE_PORT: String(service.port),
    ...(service.env ?? {}),  // user env wins
  }
  ```

### EC-9: Vercel adapter overwrite `vercel.json` apaga config user-side

- **Task afetada:** T3.1
- **Família:** State
- **Cenário:** User tem `vercel.json` no root com config custom (env vars, headers, redirects, etc.). Adapter atual em T3.1 emite shape novo de `vercel.json` → user fields perdidos.
- **Impacto:** Silent destruction of user config; deploys quebram em prod.
- **Fix sugerido:** Em T3.1, ler `vercel.json` existente, fazer deep-merge:
  ```ts
  const existing = fs.existsSync('vercel.json') ? JSON.parse(fs.readFileSync('vercel.json', 'utf-8')) : {}
  const merged = { ...existing, services: buildServicesBlock(manifest) }
  fs.writeFileSync('vercel.json', JSON.stringify(merged, null, 2))
  ```
  Adicionar BDD test em T3.1: "preserves user vercel.json fields when adapter runs".

### EC-10: Hey API generated client importa de package não declarado

- **Task afetada:** T4.1, T4.2, T5.1
- **Família:** Integration / Type
- **Cenário:** T5.1 wires Hey API → generated `clients/agent.ts` importa `@hey-api/client-fetch` at runtime. Mas templates de T4.1 (Python) e T4.2 (Node) `package.json.tmpl` NÃO declaram esse dep no TheoKit app. → `npx create-theokit my-app --backend python` produz projeto que falha ao importar clients.
- **Impacto:** Generated code não compila no projeto fresh-scaffolded.
- **Fix sugerido:** Em `packages/create-theo/templates/default/package.json.tmpl` (ou um arquivo compartilhado), adicionar dep ao gerador:
  ```json
  "dependencies": {
    "@hey-api/client-fetch": "^0.x"
  }
  ```
  Adicionar BDD test em T4.1/T4.2: "scaffolded project has @hey-api/client-fetch in package.json deps".

---

## SHOULD TEST

### EC-11: Spike snapshot pode vazar segredos

- **Task afetada:** T0.2
- **Teste sugerido:** `test_vercel_snapshot_no_secrets` — Given `tests/fixtures/spike-vercel-services/vercel.json`, When grep for patterns `/vercel_[a-z0-9]{16,}/`, `/sk_live_/`, `/[a-f0-9]{32,}/` (Vercel tokens, Stripe keys, generic hex secrets), Then ZERO matches.

### EC-12: Service name docker-compose-safe regex

- **Task afetada:** T1.1
- **Teste sugerido:** `test_services_name_regex_docker_safe` — Given services keys `{ 'my-service': {...}, 'agent.v2': {...} }`, When schema parses, Then accepts `my-service` and rejects `agent.v2` (period invalid in compose service name). Pinns service-name regex to `^[a-z][a-z0-9-]*$`.

### EC-13: `dependsOn: []` (empty array) accepted as no-dep

- **Task afetada:** T1.1
- **Teste sugerido:** `test_services_dependson_empty_array` — Given `services.a.dependsOn = []`, When schema parses, Then no error; service has no deps (treated same as `undefined`).

### EC-14: Raw `\` in pathname (not encoded)

- **Task afetada:** T1.2
- **Teste sugerido:** `test_path_scope_raw_backslash` — Given `pathname='/api/agent\\..\\escape'` (literal `\`, not `%5C`), `base='/api/agent'`, When isPathInScope, Then false (WHATWG URL canonicalizes `\` → `/` in some contexts; verify expected behavior and pin).

### EC-15: Base ending with `/`

- **Task afetada:** T1.2
- **Teste sugerido:** `test_path_scope_base_trailing_slash` — Given `base='/api/agent/'`, `pathname='/api/agent/foo'`, When isPathInScope, Then true (or document behavior if false — depends on algorithm choice).

### EC-16: HEAD/OPTIONS request doesn't forward body

- **Task afetada:** T1.3
- **Teste sugerido:** `test_proxy_head_no_body` — Given HEAD request with body=null, When `proxyFetch`, Then outgoing Request has body=null and NO `duplex: 'half'`.

### EC-17: 304 Not Modified relay preserves status without body

- **Task afetada:** T1.3
- **Teste sugerido:** `test_proxy_relays_304` — Given customFetch returns Response 304 with no body, When `proxyFetch`, Then returned response status=304 and body is null/empty.

### EC-18: Pre-aborted signal returns immediately

- **Task afetada:** T1.5
- **Teste sugerido:** `test_healthcheck_pre_aborted_signal` — Given AbortController already aborted, When `pollHealthcheck` called with that signal, Then resolves within <50ms with `healthy=false, lastError='aborted'`.

### EC-19: Vite plugin runs even when config not yet loaded → graceful no-op

- **Task afetada:** T2.1
- **Teste sugerido:** `test_vite_plugin_no_config_noop` — Given Vite calls `config()` hook before TheoKit config is loaded (theoretical race; covers defensive coding), When plugin runs, Then returns input config unchanged (no throw).

### EC-20: Log line spans multiple stdout chunks (>64KB or split mid-newline)

- **Task afetada:** T2.3
- **Teste sugerido:** `test_log_merge_chunked_line` — Given two `onLog` calls: chunk1=`'{"level":"info","message":"abc'`, chunk2=`'def"}\n'`, When merger handles them, Then output renders ONE complete JSON-parsed log line (not two raw/invalid lines). Requires line buffering in implementation.

### EC-21: Service emits ANSI codes in stdout

- **Task afetada:** T2.3
- **Teste sugerido:** `test_log_merge_ansi_codes_stripped_in_ci` — Given `onLog('agent', 'stdout', '\x1b[31mred\x1b[0m')` and `process.env.CI=true`, When merger handles, Then output has NO ANSI codes (stripped). Without `CI=true`, ANSI is preserved.

### EC-22: CF adapter error lists ALL Python services, not just first

- **Task afetada:** T3.2
- **Teste sugerido:** `test_cf_adapter_lists_all_python_services` — Given services `{a: {runtime:'python'}, b: {runtime:'node'}, c: {runtime:'python'}}`, When CF adapter runs, Then thrown error message names BOTH `a` and `c` (not just `a`).

### EC-23: Caddyfile orders reverse_proxy by prefix length desc

- **Task afetada:** T3.3
- **Teste sugerido:** `test_caddy_gen_orders_by_prefix_length` — Given services `{ short: {proxy:'/api'}, long: {proxy:'/api/agent'} }`, When `generateCaddyfile`, Then `/api/agent` `reverse_proxy` directive appears BEFORE `/api` (Caddy matches longest-prefix in the order they appear in the Caddyfile).

---

## DOCUMENT

### EC-24: Vercel Services feature pode mudar shape

- **Risco aceito:** Vercel Services é feature 2026-Q1; pode evoluir. Snapshot filename includes date (`spike-vercel-services-shape-2026-05.md`). Quando shape mudar, novo spike + ADR-0012/0015 amendment se contrato precisa mudar. Documentar em T0.2 doc: "Snapshot válido em 2026-05; reverify after major Vercel platform releases".

### EC-25: Cookie header forwarded to upstream service por default

- **Risco aceito:** `proxyFetch` (T1.3) strips `Set-Cookie` da response (default `passSetCookie: false`) mas NÃO strip `Cookie` da request. Services veem TheoKit session cookies. Trusted-zone assumption: services são parte do mesmo app, intencional. Documentar em `docs/concepts/services.md` (T5.2): "Sidecar services receive TheoKit session cookies via Cookie header. Treat them as trusted-zone".

### EC-26: 3xx redirect relay-as-is via `redirect: 'manual'`

- **Risco aceito:** Plan não especifica como `proxyFetch` lida com upstream 3xx redirects. Default `fetch` segue até 20 hops. Para proxy, é melhor relay-as-is. Adicionar em T1.3 implementation: `redirect: 'manual'` no outgoing Request init. Documentar como behavior em `docs/concepts/services-runtime-contract.md`.

### EC-27: Wave 2 dev orchestration testado em Linux/macOS, não Windows

- **Risco aceito:** `child_process.spawn({ shell: true })` em Windows usa `cmd.exe` que tem syntax diferente para `&&`/`;`/etc. Wave 2 templates de `services.dev` command podem não funcionar em Win. Documentar em `docs/concepts/services.md` (T5.2): "Wave 2 dev orchestration tested on Linux + macOS. Windows support is best-effort; report issues."

### EC-28: Manifest schema versioning para Wave 3

- **Risco aceito:** `services.json` shipping with `version: 1`. Wave 3 (TheoCloud adapter) ou futuros podem precisar de campos novos. Add to T1.4 manifest.ts comment: "Bumping version to 2 is a breaking change — all adapters must update read logic. Prefer adding optional fields within v1.".

### EC-29: Hot config reload (theo.config.ts editado em runtime)

- **Risco aceito:** Edit em `theo.config.ts > services` enquanto `pnpm dev` está rodando → muda no disk mas plugin já passou de config hook. User precisa restart. Document em `docs/concepts/services.md` troubleshooting: "Changing services config requires restart of pnpm dev".

### EC-30: Python 3.11+ required; uv assumed in PATH

- **Risco aceito:** Template Python (T4.1) `pyproject.toml.tmpl` declara `requires-python = ">=3.11"`. User com 3.9 vê erro de uv install. Document em `services/agent-python/README.md` (gerado no scaffold) e em CLI flag doc: "--backend python requires Python 3.11+ and uv installed in PATH".

### EC-31: Generated `clients/*.ts` é gitignored e regen apaga edits manuais

- **Risco aceito:** Hey API regenera `clients/agent.ts` ao detectar OpenAPI mudou. User que editou manualmente perde edits. Document via comment header injetado pelo generator: `// AUTO-GENERATED by @hey-api/openapi-ts. DO NOT EDIT — changes lost on next regeneration.`. Test em T5.1 verify este comment está presente.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 0 | 0 | 0 | 0 |
| T0.2 | 2 | 0 | 1 | 1 |
| T0.3 | 0 | 0 | 0 | 0 |
| T0.4 | 0 | 0 | 0 | 0 |
| T1.1 | 6 | 4 | 2 | 0 |
| T1.2 | 2 | 0 | 2 | 0 |
| T1.3 | 5 | 1 | 2 | 2 |
| T1.4 | 2 | 1 | 0 | 1 |
| T1.5 | 1 | 0 | 1 | 0 |
| T2.1 | 2 | 0 | 1 | 1 |
| T2.2 | 2 | 2 | 0 | 1 |
| T2.3 | 2 | 0 | 2 | 0 |
| T2.4 | 0 | 0 | 0 | 0 |
| T3.1 | 1 | 1 | 0 | 0 |
| T3.2 | 1 | 0 | 1 | 0 |
| T3.3 | 1 | 0 | 1 | 0 |
| T3.4 | 0 | 0 | 0 | 0 |
| T4.1 | 2 | 1 (shared T2.2) | 0 | 1 |
| T4.2 | 1 | 1 (shared T2.2) | 0 | 0 |
| T4.3 | 0 | 0 | 0 | 0 |
| T5.1 | 2 | 1 | 0 | 1 |
| T5.2 | 0 | 0 | 0 | 0 |
| T5.3 | 0 | 0 | 0 | 0 |
| **Totals** | **31** | **10** | **13** | **8** |

**Veredicto: PLANO PRECISA DE AJUSTE.** Os 10 MUST FIX devem ser incorporados ao plano antes da implementação começar. Nenhum exige nova arquitetura ou camada de abstração — todos resolvem com Zod refine, 1-3 LOC de implementação adicional, ou ajuste no template `package.json`.

**Nenhum SHOULD TEST muda design; todos são casos de teste adicionais nos blocos TDD+BDD já existentes.**

**Nenhum DOCUMENT bloqueia implementação; todos viram notas em docs/concepts/services.md ou troubleshooting.**
