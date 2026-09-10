---
'@theokit/agents': patch
---

Two test files no longer put filesystem I/O inside vitest's per-test budget.

`error-base-reachable` imported the built `dist/` barrel in every test, and `error-taxonomy` read
every `.ts` under `src/` inside its assertions. Both timed out under machine load — measured at load
average 32.9, passing idle minutes later — and a load-sensitive timeout is indistinguishable from a
regression until somebody measures the load.

The I/O now happens once in `beforeAll`, which carries its own allowance. The per-test budget is
unchanged: raising it would move the same failure to higher load, and CI runners are shared.
Verified by five consecutive runs at load average 40+.
