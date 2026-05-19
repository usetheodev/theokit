# Edge Case Review — security-hardening-plan.md

**Data:** 2026-05-19
**Tasks analisadas:** 14 (Phases 1-7) + Phase 8 Dogfood
**Plano:** `docs/plans/security-hardening-plan.md` (1860 LOC, 10 ADRs)
**Edge cases encontrados:** 13 (MUST FIX: 4, SHOULD TEST: 5, DOCUMENT: 4)

---

## MUST FIX

### EC-1: Array de secrets sem limite enforced — array.length > 5 silenciosa
- **Task afetada:** T3.1 (Accept `secret: string | string[]` in SessionManager)
- **Família:** Input / State
- **Cenário:** Plano afirma "Array length cap: 5 (prevents pathological accumulation)" mas Deep Dives → Edge cases não lista o que fazer quando o usuário passa `secret: [s1, s2, s3, s4, s5, s6]`. Sem enforce explícito, a sexta entrada é silenciosamente aceita ou truncada.
- **Impacto:** Operador continua acumulando secrets antigos; cada decrypt fallback paga ~ 1 ms CPU extra; em prod com 10k req/min e 10 secrets na array, ~ 100 segundos de CPU/min só em fallback. Pior: dá falsa segurança ("rotacionei!") sem nunca remover keys comprometidas.
- **Fix sugerido:** No `normalizeSecrets()` helper (REFACTOR step do T3.1), adicionar `if (arr.length > 5) throw new Error('Session secret array exceeds maximum of 5 entries — drop the oldest before adding a new one')`. Adicionar 1 test RED: `test_session_array_with_more_than_5_secrets_throws()`.

### EC-2: `normalizeLegacy(null)` crash quando browser envia `{"csp-report": null}` ou body vazio
- **Task afetada:** T5.1 (`/__theo/csp-report` route auto-registered)
- **Família:** Input
- **Cenário:** Algoritmo do plano faz `violations = [normalizeLegacy(JSON.parse(raw)['csp-report'])]`. Se o body é `{"csp-report": null}` (browsers podem enviar isso para policies disposição='report' sem violation real), `JSON.parse(raw)['csp-report']` retorna `null`. `normalizeLegacy(null)` desreferencia campos e crasha.
- **Impacto:** Endpoint built-in retorna 500, audit log polui, atacker pode floodar endpoint com body legítimo-mas-vazio para forçar exceptions.
- **Fix sugerido:** No handler, antes de chamar `normalizeLegacy`: `const inner = JSON.parse(raw)['csp-report']; if (!inner || typeof inner !== 'object') { res.statusCode = 204; res.end(); return }`. Idem para `application/reports+json`: filtrar entries onde `entry.body` é falsy ANTES do `normalizeNew`. Adicionar 2 testes RED ao TDD existente.

### EC-3: Header injection via `permissionsPolicy: '...; \r\nX-Injected: ...'`
- **Task afetada:** T1.1 (Permissions-Policy default-deny header)
- **Família:** Security / Boundary
- **Cenário:** Schema atual é `z.union([z.string(), z.literal(false)]).optional()` — aceita qualquer string. Se o app deriva `permissionsPolicy` de input do usuário (ex: feature flag, config de tenant), atacante injeta `\r\n` para fazer header splitting + injeção de outros headers (Set-Cookie, Location).
- **Impacto:** CWE-113 HTTP Response Splitting. Cookies maliciosos, cache poisoning, XSS via Set-Cookie injetado.
- **Fix sugerido:** Refinement no Zod schema:
  ```ts
  z.string().refine((s) => !/[\r\n]/.test(s), { message: 'Header value must not contain CR/LF' })
  ```
  Adicionar test RED: `test_permissions_policy_rejects_crlf_injection() — Given config.permissionsPolicy='x=(); \r\nX-Injected: yes', Then schema.parse throws`. **Aplicar o MESMO refinement a TODAS as opções string que viram header value no plano (CORS `exposedHeaders`, `allowedHeaders`, qualquer header config).**

### EC-4: Re-encrypt depois de `res.writeHead`/primeiro byte = no-op silencioso
- **Task afetada:** T3.2 (Transparent re-encrypt on legacy-secret decrypt)
- **Família:** Timing / State
- **Cenário:** Plano diz "Re-encrypt happens at MOST once per request" mas não define QUANDO no lifecycle. Para rotas que streamam (`renderToPipeableStream` com `onShellReady`), `Set-Cookie` precisa estar setado ANTES do shell flush. Se `getSessionWithMeta` for chamado dentro do componente RSC/render, o Set-Cookie chega tarde demais — browser nunca vê o re-encrypt → user fica preso no secret legado para SEMPRE.
- **Impacto:** Re-encrypt declarado "transparent" só funciona em rotas não-streaming. Rotas SSR streamed (default do framework) silenciosamente NÃO rotacionam. Bug invisível até secret antigo ser removido da array — daí users com session legacy são deslogados em massa.
- **Fix sugerido:** (a) Documentar invariante "re-encrypt SOMENTE em middleware pré-handler, não em handler/render"; (b) implementar via hook em `api-middleware.ts` ANTES do handler (já lê session para `requireAuth`); (c) adicionar test integration RED: `test_streaming_route_with_legacy_session_still_reencrypts() — Given SSR route + legacy cookie, When response streams, Then Set-Cookie present in response headers (before first byte)`. Adicionar essa garantia ao Invariants section do T3.2.

---

## SHOULD TEST

### EC-5: Path normalization no per-route rate limit — `/api/login` vs `/api/login/`
- **Task afetada:** T2.2 (Per-route + per-user rate limit)
- **Cenário:** Plano define `routes: { '/api/login': {...} }` com "exact-string OR regex". Não diz se faz match de trailing slash. Atacante pode bypassar limit estrito hitando `/api/login/` (Node http parser aceita).
- **Teste sugerido:** `test_route_match_normalizes_trailing_slash() — Given config.routes={'/api/login': {max:5}}, When path='/api/login/' (trailing slash), Then strict limit applies (5, not default 100)`. Implementar normalização em `matchRoute()`: strip trailing slash exceto na raiz.

### EC-6: `keyBy: 'session'` usa cookie name hardcoded
- **Task afetada:** T2.2 (Per-route + per-user rate limit)
- **Cenário:** Pseudocódigo do plano: `const cookie = getCookie(req, 'theo_session')`. Se app configura `sessionCookieName: 'app_session'` em `config.security.session.cookieName`, `keyBy: 'session'` puxa cookie errado → todos anônimos viram `ip:...` → defeats the keying.
- **Teste sugerido:** `test_keyBy_session_uses_configured_cookie_name() — Given config.session.cookieName='custom', When deriveKey('session', req with custom cookie), Then key='session:<hash>' (not 'ip:...')`. No `deriveKey`, ler cookie name do config injetado, não hardcoded.

### EC-7: OIDC discovery sem HTTPS enforce → MITM risk
- **Task afetada:** T7.4 (`oauth-state.ts` + `oidc-discovery.ts`)
- **Cenário:** `discoverOidcProvider('http://evil.com/.well-known/openid-configuration')` funciona — fetch HTTP sem warning. Atacker em rede local intercepta, devolve metadata maliciosa apontando token endpoint para servidor controlado, rouba código de auth.
- **Teste sugerido:** `test_oidc_discovery_rejects_http_in_production() — Given issuer 'http://provider.example', Then throws ('OIDC issuer must use HTTPS in production')`. Exceção: `localhost` ou `127.0.0.1` (dev). Implementação:
  ```ts
  const url = new URL(issuer)
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('OIDC issuer must use HTTPS (RFC 8414 §3)')
  }
  ```

### EC-8: CORS callback que lança exceção → fail-open (origin aceito)
- **Task afetada:** T1.2 (CORS middleware + config schema)
- **Cenário:** `origins: (origin) => { return userDB.isAllowed(origin) }` — se `userDB` está offline e lança, `matchesOrigin()` não tem try/catch documentado. Pior caso (fail-open): exceção propaga, request pipeline trata, mas headers já incluem `Access-Control-Allow-Origin` echoed → wide-open CORS durante outage.
- **Teste sugerido:** `test_origin_callback_throws_denies_request() — Given config.origins=fn that throws, When preflight, Then 403 (fail-closed)`. Em `matchesOrigin()`: `try { return cb(origin) } catch { return false }`.

### EC-9: Audit log emite `actor.id: keyOrIp` que pode conter session hash
- **Task afetada:** T4.2 (Wire framework events to audit logger)
- **Cenário:** Em `rate-limit.exceeded`, plano emite `actor: { type: 'anonymous', id: keyOrIp }`. Se `keyBy: 'session'`, `keyOrIp` é `session:<hash>`. Audit log fica com identifier estável por session — vaza info de existência de sessions, dá fingerprint para correlation attacks no log.
- **Teste sugerido:** `test_rate_limit_audit_uses_ip_only_for_anonymous() — Given keyBy='session', When rate-limit fires, Then audit event metadata contains rate-limit key, but actor.id is the IP (not session hash)`. Separar campos: `actor.id` = IP; `metadata.rateLimitKey` = derived key (com hash session).

---

## DOCUMENT

### EC-10: `JsonStdoutSink` em edge runtimes pode perder eventos
- **Task afetada:** T4.1 (AuditLogger interface + JsonStdoutSink)
- **Risco aceito:** Cloudflare Workers limita `console.log` a 256 KB/req. Vercel Edge intercepta stdout via custom logger. Lambda buffer drops em cold start. Documentar no JSDoc do `JsonStdoutSink`: "For high-volume audit in edge runtimes, implement a custom `AuditLogger` writing to a queue/HTTP sink. JsonStdoutSink is reliable in Node/Bun/Deno; in edge environments, audit events may be truncated or rate-limited by the platform."

### EC-11: Verify backup code é caro (~ 60ms × N hashes argon2id)
- **Task afetada:** T6.3 (Backup codes primitive)
- **Risco aceito:** Constant-time iteration sobre N hashes argon2id = lento por design. Com 10 codes × 60ms = 600ms por verify attempt. Endpoint de verify deve ser rate-limited (T6.1). Documentar no JSDoc: "verifyBackupCode is O(N) in hash count by design (constant-time). Combine with throttleLoginAttempts to prevent DoS via repeated wrong codes."

### EC-12: Permissions-Policy é replace, não merge
- **Task afetada:** T1.1 (Permissions-Policy default-deny header)
- **Risco aceito:** Usuário que quer adicionar `accelerometer=(self)` ao default precisa retypar TODA a policy. Não vamos shippar merge helper neste plano (KISS). Documentar no JSDoc + na docs page: "permissionsPolicy replaces the default entirely. To add to the default, copy DEFAULT_PERMISSIONS_POLICY and append your overrides. A merge helper is not provided — see issue tracker if you need this."

### EC-13: TOTP secret storage deve ser encrypted-at-rest (responsabilidade do usuário)
- **Task afetada:** T6.2 (TOTP primitive RFC 6238)
- **Risco aceito:** Framework gera secret e verifica TOTP — não armazena. Se app salva secret em plaintext na DB e DB vaza, TODOS os usuários perdem 2FA. Documentar no `auth-providers.md` (T7.2) com um aviso bem grande: "TOTP secrets are equivalent to passwords. Encrypt at rest using a separate KMS key from your session secret. If your DB leaks, all 2FA is compromised — rotate by forcing all users to re-enroll."

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T1.1 (Permissions-Policy) | 2 | 1 (EC-3) | 0 | 1 (EC-12) |
| T1.2 (CORS) | 1 | 0 | 1 (EC-8) | 0 |
| T2.1 (RateLimitStore) | 0 | 0 | 0 | 0 |
| T2.2 (per-route/per-user) | 2 | 0 | 2 (EC-5, EC-6) | 0 |
| T3.1 (secret array) | 1 | 1 (EC-1) | 0 | 0 |
| T3.2 (re-encrypt) | 1 | 1 (EC-4) | 0 | 0 |
| T3.3 (rotateSession) | 0 | 0 | 0 | 0 |
| T4.1 (AuditLogger) | 1 | 0 | 0 | 1 (EC-10) |
| T4.2 (wire events) | 1 | 0 | 1 (EC-9) | 0 |
| T5.1 (CSP report) | 1 | 1 (EC-2) | 0 | 0 |
| T6.1 (throttle) | 0 | 0 | 0 | 0 |
| T6.2 (TOTP) | 1 | 0 | 0 | 1 (EC-13) |
| T6.3 (backup codes) | 1 | 0 | 0 | 1 (EC-11) |
| T7.3 (PKCE) | 0 | 0 | 0 | 0 |
| T7.4 (state + OIDC) | 1 | 0 | 1 (EC-7) | 0 |
| T7.5 (fixtures) | 0 | 0 | 0 | 0 |
| **TOTAL** | **13** | **4** | **5** | **4** |

**Veredicto:** PLANO PRECISA DE AJUSTE — 4 MUST FIX devem ser incorporados antes da implementação começar. EC-3 (header injection) e EC-4 (re-encrypt timing em streaming) são os mais críticos: bug de segurança real (CWE-113) e bug funcional silencioso na rota mais comum do framework (SSR streaming).

**Sugestão:** Incorporar os 4 MUST FIX como novos invariants + testes RED nas tasks correspondentes. Os 5 SHOULD TEST viram tests RED adicionais sem mudar a estrutura. Os 4 DOCUMENT viram entries no JSDoc + auth-providers.md sem custo de implementação.
