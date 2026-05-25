# Edge Case Review (Pass 2 — Post-Incorporation Verification) — caching-and-revalidation

Data: 2026-05-23
Tasks analisadas: 13 (T1.1, T1.2, T1.3, T2.1, T2.2, T3.1, T4.1, T5.1, T6.1, T7.1, T7.2, T8.1, T8.2)
Previous review: `caching-and-revalidation-edge-cases-2026-05-23.md` (Pass 1)
Edge cases found in Pass 2: 1 (MUST FIX: 0, SHOULD TEST: 1, DOCUMENT: 0)

---

## Verification of Pass 1 MUST FIX incorporation

All 5 MUST FIX from Pass 1 are confirmed incorporated into the plan with both structural changes AND new RED tests:

| EC | Status | Plan location | Test added |
|---|---|---|---|
| **EC-1** (validateTags non-array crash) | ✅ Fixed | T1.1 Deep Dives line 250, RED test line 279 | `validateTags_non_array_returns_dropped` |
| **EC-2** (varies cookie fragments cache) | ✅ Fixed | T5.1 Algorithm step 4.1 line 1135, RED test line 1207 | `dcr_varies_cookie_filtered_with_warn` |
| **EC-3** (large body OOMs cache) | ✅ Fixed | T5.1 config type line 1114, algorithm line 1147, 2 RED tests line 1208-1209 | `dcr_oversized_response_bypasses_cache_with_warn`, `dcr_undersized_response_cached_normally` |
| **EC-4** (cache before auth = data leak) | ✅ Fixed | T5.1 SECURITY INVARIANT line 1171, RED test line 1210, Global DoD line 1792 | `dcr_security_cache_runs_after_auth_in_default_chain` |
| **EC-5** (picomatch not direct dep) | ✅ Fixed | T7.2 Tasks line 1554, RED test line 1568, AC line 1583 | `picomatch_resolvable_in_published_package` |

All 7 SHOULD TEST from Pass 1 (EC-6 through EC-12) confirmed added as RED tests in respective TDD blocks.
All 6 DOCUMENT items from Pass 1 (EC-13 through EC-18) confirmed in T8.2 docs outline (line 1784+).

## New edge cases discovered in Pass 2

After incorporating the Pass 1 fixes, only ONE new edge case was discovered. It is minor (SHOULD TEST tier), pragmatic, and does not block plan implementation.

---

## SHOULD TEST

### EC-19: `cache.maxEntrySize` not validated at config-time
- **Task afetada:** T5.1
- **Family:** Input
- **Scenario:** EC-3 fix added `cache.maxEntrySize?: number` config field. The `Algorithm — defineCachedRoute(config)` validation step (line 1117–1122) lists checks for `maxAge`, `swr`, `cacheVersion` but NOT `maxEntrySize`. If user passes `maxEntrySize: -1` or `maxEntrySize: 0`, EVERY request bypasses cache silently (since `body.byteLength > -1` is always true for any non-empty body, and `byteLength > 0` is true for everything except 0-byte responses).
- **Impacto:** User thinks cache is enabled, but cache hit rate is 0%. Performance regression invisible until measured. Same family as EC-2 (silent performance cliff).
- **Teste sugerido:**
  - Test 1 (validation): `dcr_validates_maxEntrySize_at_config_time()` — Given `defineCachedRoute({ cache: { maxEntrySize: -1 } })`, When called, Then throws `Error("Invalid maxEntrySize ... must be a non-negative finite number")`.
  - Test 2 (zero is valid intentional): `dcr_maxEntrySize_zero_disables_cache_explicitly()` — Given `cache.maxEntrySize: 0`, When request, Then handler called every time (documented "0 = disable", consistent with `maxAge: 0` semantics).
- **Fix sugerido:** In T5.1 Algorithm step 1 (config-time validation), add: `If cache.maxEntrySize defined: if (!Number.isFinite(cache.maxEntrySize) || cache.maxEntrySize < 0) throw Error("Invalid maxEntrySize ...")`. 2 lines.

---

## Resumo (Pass 2)

| Task | New Edges | MUST FIX | SHOULD TEST | DOCUMENT |
|------|-----------|----------|-------------|----------|
| T1.1 | 0 | 0 | 0 | 0 |
| T1.2 | 0 | 0 | 0 | 0 |
| T1.3 | 0 | 0 | 0 | 0 |
| T2.1 | 0 | 0 | 0 | 0 |
| T2.2 | 0 | 0 | 0 | 0 |
| T3.1 | 0 | 0 | 0 | 0 |
| T4.1 | 0 | 0 | 0 | 0 |
| T5.1 | 1 | 0 | 1 (EC-19) | 0 |
| T6.1 | 0 | 0 | 0 | 0 |
| T7.1 | 0 | 0 | 0 | 0 |
| T7.2 | 0 | 0 | 0 | 0 |
| T8.1 | 0 | 0 | 0 | 0 |
| T8.2 | 0 | 0 | 0 | 0 |
| **Total** | **1** | **0** | **1** | **0** |

**Cumulative across Pass 1 + Pass 2:**
- 19 edge cases identified total
- 5 MUST FIX (all addressed)
- 8 SHOULD TEST (7 from Pass 1 + 1 from Pass 2)
- 6 DOCUMENT

**Veredicto:** **PLANO OK** — zero MUST FIX restantes. Pass 2's single new edge (EC-19) is SHOULD TEST tier and addressable with 2 lines + 2 tests during T5.1 implementation. Plan is ready for implementation.

### Action items for EC-19 (to incorporate before starting T5.1)

1. Add to T5.1 Algorithm step 1 (config-time validation): `if cache.maxEntrySize defined: validate is finite non-negative number; throw on violation`.
2. Add 2 RED tests in T5.1 TDD block tagged `(EC-19)`.
3. Document semantics in T8.2 caching.md: "`maxEntrySize: 0` explicitly disables cache for that route (consistent with `maxAge: 0`)."
