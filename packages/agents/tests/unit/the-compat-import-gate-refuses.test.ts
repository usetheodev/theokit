import { describe, expect, it } from 'vitest'

import {
  assertSdkCanReadNarrowedImport,
  CompatImportUnsupportedError,
} from '../../src/bridge/sdk-adapter-create-options.js'
import { resolveSettingSources } from '../../src/bridge/setting-sources-gate.js'
import { compatSourcesForSdk } from '../../src/bridge/sdk-adapter-create-options.js'

/**
 * B-004, seventh review round — a refusal that was documented and did not exist.
 *
 * `claudeCode.import` narrows WHICH surfaces of a foreign configuration root to read. Its docblock
 * said the narrowed form is "refused at resolve time" on an SDK older than 5.4.0. Nothing read a
 * version for it: the only two version checks in this layer are the hook gate (5.4.0, a different
 * option) and a compat-sources WARNING that returns silently for any major >= 5.
 *
 * So on 5.0.0 <= SDK < 5.4.0 — squarely inside this package's declared `^4.52.1 || ^5.0.0` — a
 * narrowed `import` was forwarded, dropped by the runtime in silence, and the foreign root was not
 * read AT ALL. A consumer asking for "the skills but not the hooks" got nothing, which is further
 * from what they asked for than the un-narrowed form would have been.
 *
 * `compatSources` itself landed in 5.0.0 and the NARROWED shape in 5.4.0. Treating those two
 * versions as one is the whole defect.
 */
describe('the narrowed compat import is refused when the SDK cannot read it', () => {
  it('test_an_sdk_that_can_read_the_narrowed_shape_is_accepted', () => {
    expect(() => {
      assertSdkCanReadNarrowedImport('5.4.0')
    }).not.toThrow()
    expect(() => {
      assertSdkCanReadNarrowedImport('6.0.0')
    }).not.toThrow()
  })

  it('test_an_sdk_that_knows_compatSources_but_not_the_narrowing_is_refused', () => {
    // The exact window the defect lived in: `compatSources` works, `import` does not.
    expect(() => {
      assertSdkCanReadNarrowedImport('5.3.9')
    }).toThrow(CompatImportUnsupportedError)
    expect(() => {
      assertSdkCanReadNarrowedImport('5.0.0')
    }).toThrow(CompatImportUnsupportedError)
  })

  it('test_an_unreadable_version_is_refused_rather_than_assumed', () => {
    // "Cannot tell" and "is supported" must not collapse — unproven is not proven, and this whole
    // finding is one instance of that confusion. Same posture as the hook gate.
    expect(() => {
      assertSdkCanReadNarrowedImport(undefined)
    }).toThrow(CompatImportUnsupportedError)
    expect(() => {
      assertSdkCanReadNarrowedImport('not-a-version')
    }).toThrow(CompatImportUnsupportedError)
  })

  it('test_the_refusal_names_the_version_it_needs_and_what_would_happen_without_it', () => {
    // A refusal an operator cannot act on is a refusal they route around.
    let message = ''
    try {
      assertSdkCanReadNarrowedImport('5.1.0')
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause)
    }
    expect(message).toContain('5.4.0')
    expect(message).toContain('5.1.0')
    expect(message).toMatch(/not be read AT ALL|less than you asked for/)
  })
})

describe('resolveSettingSources reads the declaration, not merely its presence', () => {
  it('test_user_false_is_a_refusal_not_a_declaration', () => {
    // Found unpinned by the seventh review: mutating `selection.user === true` to
    // `!== undefined` left every setting-sources test green. Two docblocks assert that omitting is
    // not enabling and that `false` means "did not turn it on"; nothing measured it.
    expect(resolveSettingSources({ user: false })).toEqual([])
    expect(resolveSettingSources({ user: true })).toEqual(['user'])
    expect(resolveSettingSources({})).toEqual([])
  })
})

describe('the SDK is asked only for the surfaces the SDK handles', () => {
  // Tested through the pure projection rather than `assembleM8CreateOptions`: on the SDK floor this
  // package declares (4.52.1), the version gate above refuses a narrowed import before the
  // projection runs, so the assembled path cannot reach this code at all.

  it('test_commands_is_subtracted_because_the_sdk_does_not_read_it', () => {
    // The two vocabularies diverge by one name on purpose: `commands` is this layer's, because
    // `.claude/commands/*.md` is read by `config/custom-commands.ts` and never by the SDK.
    expect(compatSourcesForSdk([{ kind: 'claude-code', import: ['commands', 'skills'] }])).toEqual([
      { kind: 'claude-code', import: ['skills'] },
    ])
  })

  it('test_a_source_the_sdk_cannot_use_is_dropped_rather_than_sent_empty', () => {
    // `resolveCompatSources` REFUSES `import: []` because "none" and "unset, so all of them" are
    // both defensible and differ by whether `.claude/hooks.json` executes. Forwarding
    // `import: ['commands']` reproduced that exact ambiguity one layer down, in silence: the SDK
    // received a list with zero names it defines. The source is dropped instead.
    expect(compatSourcesForSdk([{ kind: 'claude-code', import: ['commands'] }])).toEqual([])
  })

  it('test_the_whole_root_is_forwarded_unchanged', () => {
    expect(compatSourcesForSdk(['claude-code'])).toEqual(['claude-code'])
  })
})
