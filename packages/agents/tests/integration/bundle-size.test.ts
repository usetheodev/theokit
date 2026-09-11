import { describe, it, expect } from 'vitest'
import { statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Bundle size regression', () => {
  const distDir = resolve(__dirname, '../../dist')

  /**
   * ## Raised from 35_000 to 36_500 in M80 — measured, not convenient
   *
   * Reparenting eleven error classes onto `TheokitAgentError` cost **751 bytes**, measured by
   * building the barrel with and without the change (34 732 → 35 483). Those bytes are the
   * `code` and `isRetryable` literals: they ARE the milestone, and removing them would undo the
   * fix — the classes go back to being invisible to `isTransientError`, and the consumer goes back
   * to a regex over an eight-level `cause` chain.
   *
   * The alternative considered and rejected: move `capability/` out of the main barrel to make room.
   * It sits there by a decision recorded in M56, and shuffling an unrelated module to fit a ceiling
   * would be paying for this change with someone else's design.
   *
   * The ceiling was 36 500 — the measured 35 483 plus about a kilobyte of headroom, stated so the
   * next milestone that adds barrel surface still meets a guard rather than a formality.
   *
   * ## Raised again to 37 500 for #390 — measured the same way
   *
   * Masking a failure's text before it reaches a browser cost **215 bytes**, attributed by building
   * the barrel with and without the change (36 285 → 36 500), which is exactly ON the old ceiling
   * and therefore failing. The bytes are the `MaskError` type's default and the hook threaded to
   * both entry points; removing them restores a wire that publishes a driver's own words to a
   * browser, which is the defect.
   *
   * Attributed rather than assumed: the same measurement showed #386 — routing the second SSE
   * encoder through the shared translator — cost **zero**, because the translator was already
   * reachable from this barrel through `streamAgentUIMessages`. It would have been easy to blame
   * the larger-looking change.
   *
   * The alternative considered and rejected: shrink by dropping the in-process entry's copy of the
   * option. That is the half the parity gate had just refused, and paying for a security default
   * with a transport-dependent one is not a saving.
   *
   * ## Raised again to 38 500 for B-004 — measured the same way
   *
   * Carrying `CompatImportUnsupportedError` across the barrel cost **64 bytes**, attributed by
   * building with and without only that export line: 37 484 → 37 548. The old ceiling of 37 500 had
   * sixteen bytes of headroom, so any public type crossing the barrel was going to trip it.
   *
   * The bytes buy a consumer the ability to `catch (e) { if (e instanceof CompatImportUnsupportedError) }`
   * instead of matching a message string. The refusal shipped one commit WITHOUT crossing the
   * barrel, while the class it was written to mirror sat beside it — the fifth instance of that
   * shape (#663, #668, #675, #686), and `the-gate-is-nameable-by-a-consumer.test.ts` exists to catch
   * exactly it. Paying 64 bytes to keep that guard honest is the cheaper side of the trade.
   *
   * Headroom is again about a kilobyte, and again stated so the next barrel addition meets a guard
   * rather than a formality.
   */
  it('agents main bundle under 38.5KB', () => {
    const path = resolve(distDir, 'index.js')
    if (!existsSync(path)) {
      console.log('  SKIP: dist/index.js not found (run pnpm build first)')
      return
    }
    const size = statSync(path).size
    expect(size).toBeLessThan(38_500)
    console.log(`  agents/dist/index.js: ${(size / 1024).toFixed(1)} KB`)
  })

  it('agents decorators sub-path under 15KB', () => {
    const path = resolve(distDir, 'decorators.js')
    if (!existsSync(path)) {
      console.log('  SKIP: dist/decorators.js not found')
      return
    }
    const size = statSync(path).size
    expect(size).toBeLessThan(15_000)
    console.log(`  agents/dist/decorators.js: ${(size / 1024).toFixed(1)} KB`)
  })

  it('agents bridge sub-path under 20KB', () => {
    const path = resolve(distDir, 'bridge.js')
    if (!existsSync(path)) {
      console.log('  SKIP: dist/bridge.js not found')
      return
    }
    const size = statSync(path).size
    expect(size).toBeLessThan(20_000)
    console.log(`  agents/dist/bridge.js: ${(size / 1024).toFixed(1)} KB`)
  })
})
