import { describe, expect, it } from 'vitest'

import { resolveCompatSources } from '../../src/bridge/setting-sources-gate.js'
import type {
  CompatSurface,
  SettingSourcesSelection,
} from '../../src/bridge/setting-sources-gate.js'

const trusted = {
  trustedBy: {
    level: 'trusted',
    source: 'test',
    allows: { projectSettings: true },
  },
} as unknown as NonNullable<SettingSourcesSelection['claudeCode']>

/**
 * `.claude/rules/*.md` had no name a caller could write.
 *
 * `CompatSurface` was `'commands' | 'hooks' | 'plugins' | 'skills' | 'subagents'` — five names for a
 * root that feeds six things. The sixth is the foreign root's INSTRUCTIONS, and the gate's own
 * docblock had already written the rule this violated:
 *
 *   "An enumeration used to NARROW a root must cover every surface that root feeds: a name absent
 *    from the vocabulary is a surface the caller cannot ask for and cannot be told it lost."
 *
 * It was measured in the other direction first. `theokit-sdk` #652: `FileContextManager` consulted
 * no foreign-dialect grant at all, so `.claude/rules/*.md` reached the system prompt of a consumer
 * who had declared only its own `.theokit/`. Closing that gate down there is what makes the missing
 * name up here load-bearing: once the SDK honours a `context` grant, a caller with no word for it
 * loses the rules silently.
 *
 * ## Why this lands BEFORE the SDK release that honours it
 *
 * The ordering is safe in exactly one direction, and only one. The SDK matches a narrowed `import`
 * list PER SURFACE, so a name it does not recognise is never matched and changes nothing: on
 * today's SDK the rules load as they always did, and on the next one the grant is what keeps them
 * loading. Shipping the SDK gate first and this vocabulary second would take `.claude/rules` from
 * every caller here with no name they could write to ask for it back.
 */
describe('the foreign root has a name for its instructions', () => {
  it('carries a narrowed grant naming the rules through untouched', () => {
    // The name has to survive resolution, not merely exist in the type. A surface the gate drops on
    // the way out is the same silence as one that was never declarable.
    expect(resolveCompatSources({ claudeCode: { ...trusted, import: ['context'] } })).toEqual([
      { kind: 'claude-code', import: ['context'] },
    ])
  })

  it('lets a caller take the rules and refuse everything else', () => {
    // The case the whole surface vocabulary exists for: instructions are TEXT entering the system
    // prompt, and wanting them is not wanting command execution. A consumer who can only say
    // "all or nothing" has to choose between losing the rules and granting hooks.
    const resolved = resolveCompatSources({
      claudeCode: { ...trusted, import: ['context', 'skills'] },
    })

    const surfaces = resolved.flatMap((r) => (typeof r === 'string' ? [] : [...r.import]))
    expect(surfaces).toContain('context')
    expect(surfaces, 'taking the rules must not drag command execution along').not.toContain(
      'hooks',
    )
  })

  it('still refuses the whole thing without the grant', () => {
    // The control. Adding a surface must not open a door: an untrusted root that names `context`
    // is refused exactly as one that names `skills` is.
    const untrusted = {
      trustedBy: { level: 'untrusted', source: 'test', allows: { projectSettings: false } },
    } as unknown as NonNullable<SettingSourcesSelection['claudeCode']>

    expect(() =>
      resolveCompatSources({ claudeCode: { ...untrusted, import: ['context'] } }),
    ).toThrow()
  })

  it('is a real member of the type, not a string that happens to pass', () => {
    // Type-level. `CompatSurface` is what a consumer's `import` array is checked against, so the
    // runtime expansion agreeing while the TYPE disagrees would give a caller a value the compiler
    // refuses — which is the `TS2345` the gate's docblock describes for the SDK divergence.
    const surface: CompatSurface = 'context'
    expect(surface).toBe('context')
  })
})
