/**
 * T1.1 — the base error class is reachable from the LAYER, and this pins it.
 *
 * ## Why this test exists instead of the re-export the plan originally called for
 *
 * Registered gap 16 and the consumer's U-11 caveat both stated that `@theokit/agents` does not
 * re-export `TheokitAgentError`, so a consumer's `catch (e instanceof TheokitAgentError)` could not
 * be written without importing `@theokit/sdk` — a dependency TheoCode deliberately does not take
 * (`packages/shared/src/agent.test.ts:52` pins "82 imports of @theokit/agents, 0 of @theokit/sdk").
 *
 * Both measurements were wrong, and wrong the same way: each grepped the emitted `.d.ts` for the
 * symbol and found only `import { TheokitAgentError } from '@theokit/sdk/errors'`. **Grep does not
 * follow `export *`.** `dist/index.d.ts` forwards that whole module, so the class and
 * `isTransientError` are on the layer's root barrel and always were. Agreement between two runs of
 * the same blind technique is not corroboration.
 *
 * So there is nothing to add — `rules/parsimony-ladder.md` rung 1. What was missing is a test that
 * would have contradicted the claim, and that keeps contradicting it: if a future refactor replaces
 * the star forwards with explicit lists, the base class drops off the surface silently and a
 * consumer's error handling degrades to `catch (e)`.
 *
 * ## Why it reads `dist/`, not `src/`
 *
 * The published entry is what a consumer resolves. Importing from source would stay green even if
 * the build dropped the forward — which is precisely the regression being pinned.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST_ENTRY = join(PKG_ROOT, 'dist', 'index.js')
const DIST_BUILT = existsSync(DIST_ENTRY)

/**
 * The layer's published root barrel, loaded ONCE in `beforeAll` rather than per test.
 *
 * B-009: the import used to sit inside the `it()` bodies. Node memoizes a module, so the FIRST test
 * paid for the whole barrel inside vitest's 5-second per-test budget, and the later tests paid
 * nothing.
 *
 * What the barrel actually costs: `index.js` plus its chunk graph — seven files under `dist/`,
 * traced with `strace -e trace=openat` on a cold `import()`, of which `index.js` is smaller than
 * the other six combined.
 *
 * "of which `index.js` itself is the smallest part" is what this sentence said for one round, and
 * it was the FOURTH wrong quantitative claim in the paragraph whose subject is getting this number
 * wrong: measured, `index.js` is the third largest of the seven and bigger than four of them.
 *
 * NO BYTE COUNT, deliberately, after three rounds of getting one wrong. "Multi-megabyte" was
 * invented; "~330 KB" was `du -cb dist/*.js`, every entry point in the package including ones this
 * import never pulls; "179,974 across 8 files" counted `openat` LINES rather than successful opens
 * — the eighth was `dist/package.json` returning ENOENT thirty-six times — and was measured against
 * a dist built before an edit in the same commit. A fourth measurement here read 180,360.
 *
 * Each correction was smaller than the last and each was still wrong, because the quantity itself
 * is unstable: it is a build output, and it moves whenever the bundler does. A docblock that quotes
 * it is quoting something that will be false by the next release, so it does not quote it. What
 * matters for this file is the SHAPE — a module graph, loaded once in a hook — and that does not
 * move.
 *
 * Measured 2026-09-10: four tests failed with `Test timed out in 5000ms` at load average 32.9 and
 * the same four passed idle, minutes apart. A timeout is indistinguishable from a regression until
 * somebody measures the load, and it cost two investigations before anyone did.
 *
 * The fix is not a bigger budget — that only moves the failure to higher load, and CI runners are
 * shared. It is doing the I/O once, in a hook, so the assertions that follow touch nothing but
 * memory. Independently measured after the change: the worst test went from 3382ms to 4ms under a
 * concurrently running suite. THAT is the evidence the fix works; five green runs are not, because
 * the unfixed version also passes five green runs at the same load.
 *
 * The hook carries no explicit timeout. It had `30_000`, which exceeded this item's own 15000ms
 * ceiling, while vitest's default `hookTimeout` is 10000ms — verified against the installed vitest
 * by timing out a deliberately slow hook, not read from documentation.
 */
let barrel: Record<string, unknown> | undefined

beforeAll(async () => {
  if (DIST_BUILT) barrel = (await import(DIST_ENTRY)) as Record<string, unknown>
})

/** The already-loaded barrel. Throws rather than re-importing, so a slow read cannot come back. */
function layer(): Record<string, unknown> {
  if (barrel === undefined) throw new Error('dist barrel was not loaded — see beforeAll')
  return barrel
}

describe('the framework error base class is reachable from @theokit/agents', () => {
  it('test_base_error_is_importable_from_the_published_entry', async () => {
    if (!DIST_BUILT) {
      // EC-22 — an unbuilt dist is an ordinary local state; failing on it would train people to
      // ignore this file. It is never silently a pass: the reason is printed.
      console.warn('[error-base-reachable] SKIPPED — packages/agents/dist is unbuilt')
      return
    }
    const m = layer()
    expect(
      typeof m.TheokitAgentError,
      'TheokitAgentError must be reachable from the layer root barrel — a consumer that depends ' +
        'on @theokit/agents alone cannot import @theokit/sdk/errors',
    ).toBe('function')
  })

  it('test_is_transient_error_is_reachable_from_the_layer', async () => {
    if (!DIST_BUILT) return
    const m = layer()
    expect(typeof m.isTransientError).toBe('function')
  })

  it('test_sdk_thrown_error_is_instanceof_the_symbol_imported_from_the_layer', async () => {
    if (!DIST_BUILT) return
    const m = layer()
    const Base = m.TheokitAgentError as new (msg: string) => Error

    // Identity, not mere presence. A re-export forwards the SAME class object; a re-declaration
    // would give a look-alike whose `instanceof` fails across the seam — the exact defect ADR-0006
    // closed for `ConfigurationError`, and the reason that fix was a re-export rather than a copy.
    const ConfigurationError = m.ConfigurationError as new (msg: string) => Error
    const thrown = new ConfigurationError('constructed through the layer')

    expect(
      thrown instanceof Base,
      'an error constructed from the layer must satisfy `instanceof` the layer base class',
    ).toBe(true)
    expect(thrown).toBeInstanceOf(Error)
  })
})
