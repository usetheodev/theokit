/**
 * Build `packages/theo` BEFORE vitest starts, not from inside it.
 *
 * ## Why it is out here
 *
 * Seven test files need a built `dist/` and each called `buildTheokitPackageOnce()` lazily, so the
 * first one to meet a cold dist built it while the rest of the suite was already running. Measured
 * 2026-09-11: the build is **21s** on an idle machine, and full root runs died twice on the helper's
 * 240s timeout with `Terminated`, taking `devtools-entry-dist` and `r3a-emitted-bundle-node-free`
 * with them.
 *
 * A `globalSetup` was tried first and is NOT what shipped. It measured **20.6s** with all 997 files
 * — so vitest's own startup was never competing with the build, which was the hypothesis — and two
 * cold runs still died at the 240s gate under conditions that were named but never reproduced. A fix
 * whose mechanism is not understood is not a fix.
 *
 * Out here there is nothing to reason about: the build owns the machine, finishes, and vitest starts
 * afterwards. The failure mode it removes is structural rather than statistical.
 *
 * ## The freshness skip is NOT bypassed
 *
 * This calls the same helper the tests call, so a warm dist costs a `stat` rather than a build. The
 * decision still lives in `isDistUsableWithoutRebuilding` and is not reimplemented here — that logic
 * (a per-run marker plus a ten-minute window) was written to fix a real race and duplicating it
 * would be the DRY violation that matters: two copies of one piece of knowledge.
 *
 * ## What still runs lazily, deliberately
 *
 * `npx vitest run` invoked directly bypasses this script. The seven call sites keep their lazy
 * `buildTheokitPackageOnce()`, so that path still works — it simply pays the old contention. Making
 * the script the only path would mean deleting a fallback to protect an invocation nobody is
 * obliged to use.
 */
import { buildTheokitPackageOnce } from '../tests/integration/_helpers/build-theokit-package.js'

const started = Date.now()
buildTheokitPackageOnce()
const took = Date.now() - started
// Under a second means the freshness check skipped the build; anything longer is a real build.
console.log(
  took < 1000
    ? `[ensure-theo-dist] dist is fresh (${String(took)}ms)`
    : `[ensure-theo-dist] built packages/theo in ${String(took)}ms`,
)
