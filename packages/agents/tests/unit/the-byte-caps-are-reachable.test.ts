import { describe, expect, it } from 'vitest'

import { compileContextWindow } from '../../src/bridge/compile-context-window.js'

/**
 * The two byte caps the SDK publishes were unreachable from this authoring surface.
 *
 * `ContextSettings` declares `maxBytesPerFile` (default 40 000 characters, per-file truncation with
 * a head/tail marker) and `maxBytesTotal` (default 120 000, after which lower-priority sources are
 * DROPPED). Both are `@public` on the SDK type with real behaviour. `ContextWindowOptions` carried
 * one key — `maxTokens` — so nothing here could set either.
 *
 * That is not a cosmetic gap. `@ContextWindow` is the switch that turns instruction discovery on
 * (see the module docblock), so the surface that enables `CLAUDE.md` discovery is the same surface
 * that could not raise the cap at which a `CLAUDE.md` gets truncated. A 60 000-character
 * instruction file was silently cut to 40 000, and the only knob on offer was named after tokens.
 *
 * Recorded as "remain unreachable from this surface" when the discovery coupling was first
 * documented. Writing a limitation down is not the same as deciding it, and the item asked for a
 * decision.
 */
describe('the context byte caps are reachable from the authoring surface', () => {
  it('maps maxBytesPerFile onto the SDK setting', () => {
    const { context } = compileContextWindow({ maxBytesPerFile: 80_000 })
    expect(
      context.maxBytesPerFile,
      'a CLAUDE.md larger than the default was truncated with no way to raise the cap',
    ).toBe(80_000)
  })

  it('maps maxBytesTotal onto the SDK setting', () => {
    const { context } = compileContextWindow({ maxBytesTotal: 300_000 })
    expect(
      context.maxBytesTotal,
      'lower-priority context sources were dropped with no way to raise the aggregate cap',
    ).toBe(300_000)
  })

  it('still maps maxTokens, and writes no key that was not declared', () => {
    // The control, in both directions. A change that wrote all three keys unconditionally would
    // override the SDK's own defaults for every agent that never asked.
    const { context } = compileContextWindow({ maxTokens: 1_000 })
    // `toStrictEqual`, not `toEqual`: the latter treats `{ maxTokens, maxBytesTotal: undefined }` as
    // equal to `{ maxTokens }`, so a mapping that wrote every key unconditionally passed this
    // control. Measured — the mutation survived until this line changed.
    expect(context).toStrictEqual({ maxTokens: 1_000 })
  })

  it('declares nothing when nothing was declared', () => {
    // The empty object still matters: it is what makes `options.context !== undefined` true, which
    // is what turns instruction discovery on. A change that returned `undefined` here would silence
    // every CLAUDE.md on disk.
    expect(compileContextWindow({}).context).toStrictEqual({})
  })
})
