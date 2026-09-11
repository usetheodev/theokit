import { describe, expect, it } from 'vitest'

import { expandCommandTemplate } from '../../src/config/command-template.js'

/**
 * `\$1` is an escaped literal, and it was being substituted.
 *
 * Measured before the fix: `price \$1.00 here` with argument `alpha` produced
 * `price \alpha.00 here`. Prose containing a price became prose containing an argument, and the
 * backslash — the thing the author typed precisely to prevent that — survived into the output as
 * punctuation.
 *
 * Scope note, because this file deliberately does NOT test two neighbouring behaviours that a
 * parity survey flagged alongside it:
 *
 *   - **`$1` is the FIRST argument here, not the second.** That is a deliberate convention of this
 *     module, stated in its docblock, fixed by its existing tests and depended on by its own
 *     `` !`git diff $1` `` example. Changing it would silently rebind every argument of every
 *     command already written. It is a compatibility decision, not a defect.
 *   - **An unmatched `$3` expands to empty, not to the literal.** Also deliberate, and documented at
 *     the call site: "Empty, never the literal. A leaked `$3` reads to the model as text the user
 *     wrote."
 *
 * The escape is the one of the three with no decision behind it.
 */
const deps = {
  shell: () => Promise.resolve({ text: '', ok: true }),
  readFile: () => undefined,
  warn: () => {},
}

describe('a backslash escapes a placeholder', () => {
  it('test_an_escaped_placeholder_keeps_its_dollar_and_drops_the_backslash', async () => {
    const out = await expandCommandTemplate('price \\$1.00 here', 'alpha', deps)
    expect(out, 'the escape was ignored and the price became an argument').toBe('price $1.00 here')
  })

  it('test_an_unescaped_placeholder_still_substitutes', async () => {
    // The control. A fix that stopped substituting would satisfy the test above and break the module.
    const out = await expandCommandTemplate('review $1', 'alpha', deps)
    expect(out).toBe('review alpha')
  })

  it('test_an_escape_and_a_substitution_coexist_in_one_template', async () => {
    const out = await expandCommandTemplate('\\$1 costs $1', 'alpha', deps)
    expect(out).toBe('$1 costs alpha')
  })
})
