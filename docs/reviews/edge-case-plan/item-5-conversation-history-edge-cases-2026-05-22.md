# Edge Case Review — item-5-conversation-history-plan

Data: 2026-05-22
Tasks analisadas: 4 (T1.1, T2.1, T3.1, T4.1)
Edge cases encontrados: 9 (MUST FIX: 2, SHOULD TEST: 4, DOCUMENT: 3, IGNORE: 12)

---

## MUST FIX

### EC-1: agentId from cookie/explicit is attacker-controlled → path traversal + header injection

- **Task afetada:** T1.1 (`createConversationHistory`)
- **Família:** Security
- **Cenário:** Plan reads `theo_conversation` cookie raw and passes the value to `Agent.getOrCreate(conversationId, options)`. SDK uses `agentId` as a filesystem path component: `<cwd>/.theokit/agents/<agentId>/messages.jsonl` (verified at `theokit-sdk/.../agent-session.ts:9`). I grep'd the SDK — **`Agent.getOrCreate` does NOT validate agentId character set** (agent.ts:279-296, resume:119-165). An attacker setting `Cookie: theo_conversation=../../../etc/passwd` could make the SDK write a `messages.jsonl` outside the intended directory. Even worse for header injection: an explicit `args.agentId` containing `\r\n` could inject extra HTTP headers when the cookie is serialized (Phase 2's `setCookie('theo_conversation', value, ...)`). The same regex fix kills both attacks.
- **Impacto:** (a) Arbitrary file write outside `.theokit/agents/`; potential RCE if attacker can place files in writable + executed paths. (b) HTTP response header injection (XSS via Set-Cookie + arbitrary cookie poisoning).
- **Fix sugerido:** Validate `agentId` against `^[a-zA-Z0-9_-]{1,128}$` at every entry point (cookie read, session-derived, explicit override). Reject (treat as "missing") rather than throw — caller doesn't need to know an attacker probed. 3 lines:
  ```typescript
  const AGENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/
  function isValidAgentId(s: string | undefined): s is string {
    return typeof s === 'string' && AGENT_ID_REGEX.test(s)
  }
  ```
  Apply in the 4-step fallback chain (ADR D3): only accept the source if `isValidAgentId(value)`; otherwise fall through.

### EC-2: `await import('@usetheo/sdk')` throws with cryptic ESM error when SDK not installed

- **Task afetada:** T1.1 (`createConversationHistory`)
- **Família:** Integration / DX
- **Cenário:** Plan uses lazy `import('@usetheo/sdk')` so the SDK isn't loaded for consumers who never call the primitive. If a user calls `createConversationHistory()` WITHOUT having installed `@usetheo/sdk` (the npm package), Node throws `ERR_MODULE_NOT_FOUND: Cannot find package '@usetheo/sdk'`. The error fires deep in the promise chain — surfaces as a generic SSE `error` event with stack trace, not an actionable "install the SDK" message. The scaffold ships `@usetheo/sdk` as a dep (item #3 T3.1) so this is rare, but power users running TheoKit without scaffold OR upgrading partially WILL hit this.
- **Impacto:** Confusing failure. User sees `MODULE_NOT_FOUND` in logs, doesn't know to `pnpm add @usetheo/sdk`.
- **Fix sugerido:** Wrap the dynamic import with a try/catch that re-throws an actionable error:
  ```typescript
  let sdk: typeof import('@usetheo/sdk')
  try { sdk = await import('@usetheo/sdk') } catch (cause) {
    throw new Error('createConversationHistory requires @usetheo/sdk. Install: pnpm add @usetheo/sdk', { cause })
  }
  const agent = await sdk.Agent.getOrCreate(conversationId, args.options)
  ```
  4 lines including the catch.

---

## SHOULD TEST

### EC-3: Concurrent first-time requests from same client → two UUIDs issued, one orphaned

- **Task afetada:** T1.1
- **Teste sugerido:** `test_concurrent_first_requests_each_get_their_own_uuid` — Given two simultaneous calls with no existing cookie, When `createConversationHistory(args)` is called twice in parallel with independent `response.headers` instances, Then both `result.isNew === true` AND both `conversationIds` are distinct AND both `set-cookie` headers are independently set. (Plan documents this in the Phase-1 edge cases narrative but no test pins it. Race-orphan is acceptable behavior — the test exists to prevent a future "fix" that introduces a shared UUID generator with locking.)

### EC-4: cookie max-age boundary — value of 0 or negative

- **Task afetada:** T1.1
- **Teste sugerido:** `test_cookieMaxAge_zero_uses_default_30d` (or alternatively pins explicit zero-handling) — Given `args.cookieMaxAge = 0`, When the cookie is serialized, Then either the default (30d) is used OR the cookie is set as a session cookie (no Max-Age attribute). Pick one behavior and pin it. The plan doesn't say which. Currently the algorithm uses `args.cookieMaxAge ?? 60 * 60 * 24 * 30` — `??` lets `0` through, producing `Max-Age=0` which means "delete immediately". That's almost certainly NOT what a caller passing `0` meant.

### EC-5: Multi-Cookie header with theo_conversation appearing twice

- **Task afetada:** T1.1
- **Teste sugerido:** `test_readCookieValue_returns_first_match_on_duplicate_cookie_name` — Given `request.headers.cookie = 'theo_conversation=abc; theo_conversation=def'`, When `readCookieValue` is called, Then it returns the FIRST match ('abc') and ignores the second. Browsers can produce this via subdomain + parent-domain cookies. Without a test, implementation could return 'def' (last-wins) or undefined (parser error) — both wrong.

### EC-6: Playwright spec cookie assertion races SSE response completion

- **Task afetada:** T3.1
- **Teste sugerido:** Already in the plan but needs explicit wait — `test_e2e_conversation_cookie_issued_on_first_post` must `await expect(page.getByText(/Agent error|content/).first()).toBeVisible({ timeout: 15_000 })` BEFORE calling `page.context().cookies()`. The cookie is committed when the response headers commit; SSE response headers commit before the stream starts, but Playwright needs at least one yielded body chunk before browser exposes the cookie reliably. Without the wait, ~5% flake.

---

## DOCUMENT

### EC-7: SDK cold-start hydration tax — first POST after Node restart is slow

- **Risco aceito:** First call to `Agent.getOrCreate` triggers `hydrateRegistryFromDisk(cwd)` which reads `<cwd>/.theokit/agents/registry.json`. For deployments with thousands of agents in the registry, this is a one-time ~50-200ms tax per process. Subsequent calls hit the in-memory cache. Out of scope for v1 — mitigation (lazy-load per-agent vs eager-load all) is a future SDK optimization, not a TheoKit primitive concern.

### EC-8: Abandoned conversations accumulate forever on disk

- **Risco aceito:** Cookie max-age is 30d (default). Browser forgets after that, but the SDK's `messages.jsonl` + `registry.json` entries persist indefinitely. For long-running production, disk usage grows ~50-200 KB per abandoned conversation. No GC mechanism in TheoKit or SDK today. Manual cleanup via `Agent.delete(agentId)` for known-stale ids. Document as a known operational concern; full GC is a Phase C item (post-1.0).

### EC-9: Serverless platforms with read-only filesystem silently lose persistence

- **Risco aceito:** Vercel Edge / CF Workers (without R2 binding) have no writable `<cwd>`. `appendSessionMessage` in the SDK catches the write failure + logs to stderr (`agent-session.ts:51-54`) but doesn't surface to the caller. The conversation appears to work for the duration of the request but doesn't survive. Already documented in plan's "Out of scope" + tied to item #7 (deploy adapter validation). Elevating it here so the dogfood report captures it explicitly when serverless smoke fails.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T1.1 (createConversationHistory) | 5 | 2 (EC-1, EC-2) | 2 (EC-3, EC-4, EC-5) | 2 (EC-7, EC-8) |
| T2.1 (fixture+template+defineAgentEndpoint ext) | 1 | 0 | 0 | 0 (EC-1 fix covers Phase 2 header injection) |
| T3.1 (Playwright) | 1 | 0 | 1 (EC-6) | 0 |
| T4.1 (dogfood) | 1 | 0 | 0 | 1 (EC-9) |
| **Total** | **9** | **2** | **4** (EC-3, EC-4, EC-5, EC-6) | **3** (EC-7, EC-8, EC-9) |

(EC-5 counted under T1.1; total of 4 SHOULD TEST entries match the count above)

**Veredicto:** **PLANO PRECISA DE AJUSTE (mínimo)** — 2 MUST FIX são fixes pequenos (~10 LOC total no T1.1) e fecham um vetor real de segurança (path traversal + header injection via cookie) + uma melhoria honesta de DX (mensagem de erro acionável quando SDK não instalado). 4 SHOULD TEST são testes adicionais sem mudança de código. 3 DOCUMENT são notas operacionais que já têm raízes no plano — elevar à seção "Out of scope" ou Risks. Nenhum novo módulo. Nenhuma abstração nova. KISS preservado.
