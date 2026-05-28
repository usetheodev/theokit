# Edge Case Review — `examples/full-stack-agent`

Date: 2026-05-22
Tasks analisadas: 11 (T0.1, T0.2, T1.1, T2.1, T2.2, T2.3, T2.4, T3.1, T4.1, T5.1, T5.2)
Edge cases encontrados: 16 (MUST FIX: 6, SHOULD TEST: 6, DOCUMENT: 4)

The plan is solid — well-scoped ADRs, sandbox + allowlist already baked in, dogfood gate mandatory. The findings below are concrete real-world cases the current plan glosses over. None of them suggests new abstractions; each fix is a single `if`, a test, or a one-sentence plan tweak.

---

## MUST FIX

### EC-1: `calculator` regex allows division-by-zero and exponential blowup → `Infinity`/`NaN`/string-of-300-digits

- **Task afetada:** T2.1
- **Família:** Input / Resource
- **Cenário:** Allowlist `/^[\d\s+\-*/().]+$/` lets the LLM pass `1/0` (→ `Infinity`), `0/0` (→ `NaN`), or `9**9**9` if `**` later sneaks in. Even today, `(2*2*2*2*2*2*2*2*2*2*2*2*2*2*2*2*2)` is fine arithmetically but a long chain like `9999999999*9999999999*9999999999...` returns a huge BigInt-style stringified number the LLM has to interpret. Returning `Infinity`/`NaN` as the tool result confuses agents and breaks JSON serialization on some paths.
- **Impacto:** Tool returns `Infinity`/`NaN` (JSON-unsafe in strict serializers — `JSON.stringify(NaN)` = `"null"`) → LLM gets `null` and re-asks → demo looks broken.
- **Fix sugerido:** After eval, `if (!Number.isFinite(result)) throw new Error('result not finite (overflow or division by zero)')`. One line in the handler.

### EC-2: `calculator` safe-eval implementation choice is not pinned — plan says "Shunting Yard or tiny recursive parser" but mentions "no `eval()` / `Function()`"; if the implementer reaches for `Function('return ' + expr)()`, the allowlist regex still lets a subset of XSS-ish payloads through

- **Task afetada:** T2.1
- **Família:** Security
- **Cenário:** The plan explicitly forbids `eval`/`Function`, but the "30 LOC" hand-wave makes it likely someone implements with `new Function(`return (${expr})`)` because it's 1 LOC. Regex `/^[\d\s+\-*/().]+$/` does block letters, but the regex string in the spec has `\d\s+\-*/().` — if the implementer drops a char (forgets `\-` escape, allows `-` placement edge cases) or adds `,` for thousands separators, `Function` becomes a full JS eval surface.
- **Impacto:** Code execution from LLM input. Demo turns into RCE on the host.
- **Fix sugerido:** Pin in T2.1 plan: "MUST use a recursive-descent parser; `eval`/`Function`/`vm` are forbidden — assert in unit test that source file does not contain `eval(` or `new Function`". Add the assertion test alongside the 12 existing tests.

### EC-3: `web_fetch` allowlist suffix-match (`wikipedia.org` matches `en.wikipedia.org`) also matches `evilwikipedia.org` if naively implemented as `hostname.endsWith(entry)`

- **Task afetada:** T2.2
- **Família:** Security
- **Cenário:** Plan says "Exact match OR suffix match (`wikipedia.org` matches `en.wikipedia.org`). Standard cookie-domain semantics." `hostname.endsWith('wikipedia.org')` returns true for `evilwikipedia.org` and `nicewikipedia.org.attacker.com`. SSRF defense bypassed. This is the classic CORS/cookie suffix-match bug.
- **Impacto:** SSRF restored. An LLM tricked into `https://aws.metadata.attacker.com.wikipedia.org` (or registering `evilwikipedia.org`) gets through.
- **Fix sugerido:** Match logic: `hostname === entry || hostname.endsWith('.' + entry)` — the leading dot guarantees a subdomain boundary. Add a test `test_web_fetch_rejects_evilwikipedia_org_lookalike`.

### EC-4: `_workspace.resolveSafePath` startsWith check has off-by-one — `base + path.sep` excludes the base itself

- **Task afetada:** T2.3
- **Família:** Security
- **Cenário:** Plan code:
  ```typescript
  if (!absolute.startsWith(base + path.sep) && absolute !== base) {
    throw new Error(`path traversal blocked: ${relativePath}`)
  }
  ```
  This works, BUT there's a sibling-prefix risk: if base is `/cwd/.theokit/workspace/web-abc` and the LLM somehow gets `web-abc-evil` as agentId (unlikely given regex, but `path.resolve(base, '../web-abc-evil/notes.md')` resolves to `/cwd/.theokit/workspace/web-abc-evil/notes.md` which does NOT start with `base + path.sep` → correctly rejected). So this is actually safe — BUT the plan never checks that `relativePath` doesn't already start with `/` or contain a Windows drive letter (`C:\`). `path.resolve('/cwd/.theokit/workspace/web-abc', '/etc/passwd')` returns `/etc/passwd` (absolute overrides base), and the startsWith check correctly rejects it. Confirmed safe on POSIX. **But on Windows**, `path.resolve(base, 'C:/Windows/system32')` returns `C:\Windows\system32`. Same startsWith check rejects it. So the algorithm is actually correct.

  The real bug: **the plan does NOT validate `relativePath`'s Zod schema rejects strings containing NUL bytes** (`\0`). On Linux, `fs.writeFile('file\0.txt', ...)` truncates the filename at the NUL — a 2010-era classic for bypassing extension checks. Zod `.string()` accepts NUL.
- **Impacto:** LLM passes `notes.md\0../../../etc/passwd` → after the lexical startsWith check (which passes — string still starts with base), `fs.writeFile` truncates to `notes.md` OR breaks weirdly depending on Node version. Inconsistent behavior is the security problem.
- **Fix sugerido:** In `_workspace.ts` Zod schema for `path`: `z.string().refine(p => !p.includes('\0'), 'NUL byte not allowed')`. One refine. Add `test_workspace_blocks_nul_byte_in_path`.

### EC-5: `chat.ts` double-touch pattern (`probedId` then `agentId: probedId`) — if `createConversationHistory` decides to use a DIFFERENT id (e.g. its own cookie precedence rule overrides the passed `agentId`), the workspace tools sandbox to the wrong directory

- **Task afetada:** T3.1
- **Família:** State / Integração
- **Cenário:** Plan acknowledges the wrinkle but the proposed pattern relies on `createConversationHistory` respecting the `agentId` override. If `createConversationHistory` has internal precedence (cookie wins over override, or vice versa), the workspace tools built from `probedId` might run under a different `conversationId` returned by the function — meaning `workspace_write({ path: 'a.md' })` writes to `.theokit/workspace/<probedId>/a.md` while the agent thinks its id is `<conversationId>`. Future `workspace_read` from the same agent reads from the wrong sandbox → "file doesn't exist". Silently broken demo.
- **Impacto:** Workspace tools work intermittently. Hard to debug. The demo's persistence story breaks for users.
- **Fix sugerido:** In T3.1 plan, ADD: "After `createConversationHistory` returns, assert `conversationId === probedId` (it MUST when `agentId` is overridden). If they diverge, throw — `createConversationHistory` contract violation". One `if` after the call. Already a regression test: T3.1 should add `test_chat_route_conversationId_matches_probedId`.

### EC-6: T0.2 `applySecurityHeaders` says "API routes returning JSON — still get security headers but no nonce" but the EXISTING dev `api-middleware.ts` may already attach a nonce to all responses (including JSON) — divergence between dev and prod headers will appear as test flake

- **Task afetada:** T0.2
- **Família:** Integração / Boundary
- **Cenário:** Plan adds nonce-aware header builder in prod start.ts, conditional on `ssrEnabled`. If dev mode unconditionally generates a nonce on every request (per the 0.3.0 enforce-mode work landed in commit `3ee9dac`), then dev returns `CSP: ...nonce-X` for `/api/health` while prod returns `CSP: ...` without the nonce. Tests asserting "API route has CSP but no nonce" (test #4 in T0.2 TDD) pass in prod but might fail when somebody later runs the SAME test in dev. Also, the prod behavior diverges from the framework's stated 0.3.0 "every response gets nonce" promise.
- **Impacto:** Dev/prod parity broken. Tests assert one behavior in prod, another in dev. The 0.3.0 cutover's "CSP enforces in prod" promise is half-kept — JSON API responses still allow inline scripts (cosmetic, since JSON has no scripts, but the header is inconsistent).
- **Fix sugerido:** In T0.2, generate the nonce UNCONDITIONALLY (whether SSR or not, whether HTML or JSON) and include it in CSP. Remove the "JSON has no inline scripts" optimization. The cost is 16 bytes of randomness per request — negligible. Updates test #4 to assert `nonce-` IS present in API responses too. Matches dev mode.

---

## SHOULD TEST

### EC-7: `web_fetch` 4 KB cap — does it count bytes or characters? Multi-byte UTF-8 (Japanese, emoji) at 4 KB chars is 12 KB bytes; at 4 KB bytes is ~1300 characters

- **Task afetada:** T2.2
- **Teste sugerido:** `test_web_fetch_4kb_cap_counts_bytes_not_characters` — Given a mocked fetch returning a 12 KB UTF-8 response of CJK text, When handler called, Then result.length ≤ 4096 bytes AND `Buffer.byteLength(result, 'utf8') ≤ 4096`. (Trim on byte boundary, don't slice a multi-byte char in half — use `Buffer.subarray(0, 4096).toString('utf8')` carefully to avoid replacement chars.)

### EC-8: `web_search` regex parser is greedy and fragile — DDG sometimes wraps results in extra spans, regex `<a class="result__a"...href="(.+?)".+?>(.+?)<\/a>` can match across multiple results if a result title contains the literal string `</a>` (rare but happens with HTML-in-titles)

- **Task afetada:** T2.2
- **Teste sugerido:** `test_web_search_handles_result_title_with_nested_html` — Given DDG HTML fixture where one result's title is `<a class="result__a" href="x">foo <b>bar</b> baz</a>`, When parsed, Then the result title decodes correctly (or is gracefully skipped) — NOT a regex back-tracking explosion.

### EC-9: `workspace_write` 100 KB cap is per-write — LLM can call it 100 times to fill disk

- **Task afetada:** T2.3
- **Teste sugerido:** `test_workspace_write_does_not_enforce_total_quota_by_design` — pin the behavior intentionally (the test exists to DOCUMENT that there is no aggregate quota; if someone later adds one they'll see this test and update). One assertion: "calling write 5 times with 100 KB each succeeds; total dir size = 500 KB". Aligns with DOCUMENT EC-15 below.

### EC-10: Telegram bot `Agent.send` may hang for >60s on slow models (long tool chains) — Telegram's `ctx.reply` has its own deadline, and `await run.wait()` blocks the polling loop

- **Task afetada:** T4.1
- **Teste sugerido:** `test_bot_does_not_block_polling_loop_on_slow_send` — mock `Agent.send` to take 30s, simulate a second message arriving 5s in. Assert the second message is queued/processed (not dropped). If grammy serializes per-chat handlers, document; otherwise add a sane timeout.

### EC-11: T0.1 `.mjs` then `.js` resolution — what if BOTH `.mjs` and `.js` exist (mixed build output) and the `.mjs` is stale from a previous build?

- **Task afetada:** T0.1
- **Teste sugerido:** `test_resolveSsrEntry_warns_when_both_extensions_exist` — Given distDir with BOTH files, When resolved, Then return `.mjs` AND log a warning ("Both `.mjs` and `.js` present — using `.mjs`. Clear `dist/` to avoid stale builds."). Already plan-mentioned in JSDoc; promote to test.

### EC-12: `telegram-bot.ts` does NOT import `dotenv` or rely on framework env loading — `process.env.TELEGRAM_BOT_TOKEN` will be undefined when run via `tsx server/telegram-bot.ts` outside the dev server

- **Task afetada:** T4.1
- **Teste sugerido:** `test_bot_can_load_env_from_dotenv_when_run_standalone` — boot the bot with `.env` file in cwd containing `TELEGRAM_BOT_TOKEN=test`, assert it reads it. If the answer is "user has to `node --env-file=.env`" or "use `tsx --env-file=.env`", DOCUMENT in the bot script's first comment line.

---

## DOCUMENT

### EC-13: OpenRouter rate-limit (429) is not handled — first-impression demo with a low-tier key hits 20 req/min cap

- **Risco aceito:** The error event from `streamAgentRun` propagates the 429 to the UI as `AgentErrorCard kind="rate_limit"`. Demo visitor sees a real error message. Adding retry/backoff in a DEMO is over-engineering. Document in README under "Troubleshooting" — "If you see rate-limit errors, upgrade your OpenRouter plan or switch to a self-hosted model".

### EC-14: `web_search` DDG endpoint may serve a CAPTCHA when called from cloud IPs (AWS/GCP) — demo deployed to Vercel/CF gets HTML the parser can't read

- **Risco aceito:** DDG anti-bot is part of life. Defensive parser already returns `{ results: [], note: '...' }` per the plan. Demo runs locally for primary audience. README mentions the limitation. Adding a fallback search provider doubles the surface — out of scope.

### EC-15: Workspace tools have no aggregate disk quota — LLM can write many 100 KB files

- **Risco aceito:** Per-agentId scoping means cleanup is `rm -rf .theokit/workspace/<id>`. Demo, not production. README "Production notes" mentions adding an aggregate quota for multi-tenant deployments. EC-9 pins the current behavior as a test so any future change is intentional.

### EC-16: Telegram bot polling and web server share the same process — if the web server crashes, the bot dies (and vice versa). No supervisor.

- **Risco aceito:** ADR D3 already documents this trade-off ("for production Telegram with multiple instances, switch to webhook mode"). README repeats it. Adding a supervisor or split processes is exactly the "over-engineering" the demo avoids. The plan's "🔁 If multi-process scaling becomes needed, the gateway runner is detachable" line is the right escape hatch.

---

## Resumo

| Task | Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-------|----------|-------------|----------|
| T0.1 | 1 | 0 | 1 | 0 |
| T0.2 | 1 | 1 | 0 | 0 |
| T1.1 | 0 | 0 | 0 | 0 |
| T2.1 | 2 | 2 | 0 | 0 |
| T2.2 | 3 | 1 | 2 | 0 |
| T2.3 | 2 | 1 | 1 | 0 |
| T2.4 | 0 | 0 | 0 | 0 |
| T3.1 | 1 | 1 | 0 | 0 |
| T4.1 | 3 | 0 | 2 | 1 |
| T5.1 | 0 | 0 | 0 | 0 |
| T5.2 | 0 | 0 | 0 | 0 |
| Cross-cutting | 3 | 0 | 0 | 3 |

**Veredicto:** PLANO PRECISA DE AJUSTE — 6 MUST FIX items are real production/security bugs, but every fix is one `if`, one Zod refine, one one-line assertion, or one regex tweak. No new modules, no new abstractions. Plan stays KISS-compliant after applying fixes; estimated total impact: ~15 lines of source + 6 new tests across 5 tasks.
