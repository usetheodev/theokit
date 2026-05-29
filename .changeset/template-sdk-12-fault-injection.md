---
'theokit': patch
'create-theokit': patch
---

**Template SDK bump → `@usetheo/sdk@^1.2.0` (D14 fault injection available).**

New scaffolds get the SDK with `THEOKIT_TEST_RESPONSE_OVERRIDE` fault-injection seam built in. Documented in the SDK's `docs.md` § "Test fault injection (v1.22+)". Use in `dogfood-stranger` Phase 13 (rate-limit chaos) for zero-cost / zero-quota-burn deterministic 429 / 5xx / 401 scenarios.

No theokit code changes — this is a template-side dep bump.
