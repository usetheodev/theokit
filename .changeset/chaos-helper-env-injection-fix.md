---
'theokit': patch
---

**Chaos helper `chaos-providers.sh` invalid-key scenario: env injection fix.**

Previously the helper edited the sandbox `.env` to set an invalid OPENROUTER_API_KEY,
but the parent shell's exported `OPENROUTER_API_KEY` (valid) won the precedence
contest (process.env > .env file). The chaos test never exercised the actual
auth-failure code path → false-negative "no error surfaced" finding.

Fix: helper now passes invalid key via explicit `env "OPENROUTER_API_KEY=..."`
before `theokit dev`, overriding parent shell. Now confirmed end-to-end:
- OpenRouter returns HTTP 401
- SDK surfaces error
- Template `chat.ts` try/catch yields `{type:'error',message:'...auth_failed (HTTP 401)...'}`
- Helper detects error in SSE response → PASS

Vendored copy at `theokit/scripts/dogfood/chaos-providers.sh` byte-identical
to meta-repo source (parity test `dogfood-helpers-vendor-parity.test.ts`
enforces).

Phase 5 dogfood QA final state: **100/100** (4/4 chaos PASS + 4/4 multi-template
PASS + 6/7 lifecycle PASS — the 1 remaining lifecycle SKIP is INTERACTIVE_ONLY
phases per plan design).
