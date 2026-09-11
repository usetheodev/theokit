import { describe, expect, it } from 'vitest'

import { __matchesForTests as matches } from '../../src/hooks/hook-spec.js'

/**
 * `matcher: "*"` never fired, and it is the spelling an author is most likely to write for "always".
 *
 * The format defines `"*"`, `""` and an omitted matcher as identical: fire on every occurrence.
 * `new RegExp("*")` THROWS — "nothing to repeat" — and the catch below treats a throw as no-match,
 * so the one documented way to say "always" became the one way to say "never".
 *
 * Measured end to end before the fix, `pre_tool_call` with `command: "exit 1"` against tool `Bash`:
 *
 *     matcher "*"          -> allowed through   <- documented match-all, guard never ran
 *     matcher ""           -> VETOED
 *     matcher "Bash"       -> VETOED
 *     matcher omitted      -> VETOED
 *     matcher "Edit, Write" -> allowed through  <- documented exact-list form, matched nothing
 *
 * Treating an invalid regex as no-match stays as it is, and is deliberate: a hook whose matcher
 * cannot compile must not take down the turn. What changes is that the two shapes the format
 * defines are recognised BEFORE they reach the regex engine, so neither depends on being valid
 * regex syntax.
 */
describe('a match-all matcher fires', () => {
  it('test_a_star_matches_every_tool', () => {
    expect(
      matches({ event: 'pre_tool_call', command: 'x', timeout_ms: 1000, matcher: '*' }, 'Bash'),
      'the documented match-all spelling never ran the guard',
    ).toBe(true)
  })

  it('test_an_empty_matcher_matches_every_tool', () => {
    expect(
      matches({ event: 'pre_tool_call', command: 'x', timeout_ms: 1000, matcher: '' }, 'Bash'),
    ).toBe(true)
  })

  it('test_an_omitted_matcher_still_matches', () => {
    expect(matches({ event: 'pre_tool_call', command: 'x', timeout_ms: 1000 }, 'Bash')).toBe(true)
  })

  it('test_a_comma_separated_list_matches_its_members', () => {
    const spec = {
      event: 'pre_tool_call' as const,
      command: 'x',
      timeout_ms: 1000,
      matcher: 'Edit, Write',
    }
    expect(matches(spec, 'Edit'), 'the documented exact-list form matched nothing').toBe(true)
    expect(matches(spec, 'Write')).toBe(true)
    expect(matches(spec, 'Bash'), 'a list must not become a match-all').toBe(false)
  })

  it('test_a_regex_matcher_still_works', () => {
    // The control. A fix that made everything match would satisfy the tests above and disarm scoping.
    const spec = {
      event: 'pre_tool_call' as const,
      command: 'x',
      timeout_ms: 1000,
      matcher: 'Edit|Write',
    }
    expect(matches(spec, 'Edit')).toBe(true)
    expect(matches(spec, 'Bash')).toBe(false)
  })

  it('test_an_uncompilable_matcher_still_does_not_match', () => {
    // Unchanged and deliberate: a broken matcher must not take down the turn.
    expect(
      matches({ event: 'pre_tool_call', command: 'x', timeout_ms: 1000, matcher: '[' }, 'Bash'),
    ).toBe(false)
  })
})
