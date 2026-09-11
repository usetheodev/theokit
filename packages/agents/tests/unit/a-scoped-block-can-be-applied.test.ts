import { describe, expect, it } from 'vitest'

import { blockAppliesTo } from '../../src/config/instruction-tree.js'

/**
 * `scopes` was published and nothing could apply it.
 *
 * `InstructionBlock.scopes` carries the `paths:` frontmatter, and the field's own docblock names the
 * consequence of getting it wrong: "A consumer rendering the block would then apply a rule written
 * for one subtree EVERYWHERE — the one frontmatter failure with a consequence, and a silent one."
 * It then hands the decision to the product: "Products with a fail-closed policy drop the block on
 * this flag instead of publishing it unscoped."
 *
 * Delegating the DECISION is deliberate and stays that way. What was missing is the means: there was
 * no glob matcher anywhere in the package, so a consumer who wanted to honour the scope had to
 * invent the semantics — and two consumers would invent two.
 *
 * Deliberately small: `**`, `*` and `?`, matching what the SDK's own rule activation supports.
 * Brace expansion and character classes are NOT supported, and a caller needing them should say so
 * rather than discover it — hence the explicit case at the bottom.
 */
describe('a scoped instruction block can be applied to a path', () => {
  const block = (scopes: readonly string[], scopesUnreadable = false) =>
    ({ path: 'r.md', content: '', scopes, scopesUnreadable }) as const

  it('test_an_unscoped_block_applies_everywhere', () => {
    expect(blockAppliesTo(block([]), 'anything.ts')).toBe(true)
  })

  it('test_a_double_star_crosses_directories', () => {
    expect(blockAppliesTo(block(['src/api/**/*.ts']), 'src/api/v1/users.ts')).toBe(true)
    expect(blockAppliesTo(block(['src/api/**/*.ts']), 'src/web/page.ts')).toBe(false)
  })

  it('test_a_single_star_does_not_cross_a_separator', () => {
    expect(blockAppliesTo(block(['src/*.ts']), 'src/index.ts')).toBe(true)
    expect(blockAppliesTo(block(['src/*.ts']), 'src/deep/index.ts')).toBe(false)
  })

  it('test_a_question_mark_matches_one_character', () => {
    expect(blockAppliesTo(block(['v?.ts']), 'v1.ts')).toBe(true)
    expect(blockAppliesTo(block(['v?.ts']), 'v10.ts')).toBe(false)
  })

  it('test_any_one_scope_matching_is_enough', () => {
    expect(blockAppliesTo(block(['a/**', 'b/**']), 'b/x.ts')).toBe(true)
  })

  it('test_an_unreadable_scope_does_not_apply_everywhere', () => {
    // The fail-closed half the field was invented for. A block whose `paths:` was declared and
    // yielded nothing must NOT be treated as unscoped — that is the silent failure by name.
    expect(
      blockAppliesTo(block([], true), 'anything.ts'),
      'a block with an unreadable scope was applied everywhere, which is the defect the flag exists to expose',
    ).toBe(false)
  })

  it('test_a_regex_metacharacter_in_a_scope_is_literal', () => {
    // `.` must not mean "any character", or `a.ts` would match `axts`.
    expect(blockAppliesTo(block(['a.ts']), 'axts')).toBe(false)
    expect(blockAppliesTo(block(['a.ts']), 'a.ts')).toBe(true)
  })
})
