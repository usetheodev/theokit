import { describe, expect, it, vi } from 'vitest'

import type { TemplateDeps } from '../../src/config/command-template.js'
import { expandCommandTemplate, templateHints } from '../../src/config/command-template.js'

/**
 * `$ARGUMENTS` — the documented placeholder for everything the user typed — did not exist.
 *
 * The module understood `$1`, `$2`, … and nothing else, so a command that wanted the whole argument
 * string had to guess how many positions to concatenate and stop being correct at the first
 * invocation that passed one more. Measured: `$ARGUMENTS` returned 0 hits against a control of 31.
 *
 * It is the RAW string, not the split tokens rejoined. Splitting strips the quotes that decided the
 * grouping — `"two words" solo` is two arguments and five words — so rejoining `args` would hand the
 * model `two words solo` and lose the only mark saying which three belonged together. A placeholder
 * whose whole job is "what the user typed" must not quietly retype it.
 *
 * The escape works the same way `$N`'s does, for the same reason: an author writing about the
 * placeholder in prose needs a way to say so.
 */
// Typed, not duck-shaped: the first version named the shell dependency `runShell`, which
// `TemplateDeps` does not have. Vitest passed — no test here reaches the shell branch — and `tsc`
// said so. Neither placeholder under test runs a command, so both injected functions exist to be
// unreachable.
const deps: TemplateDeps = {
  warn: vi.fn(),
  shell: vi.fn(async () => ({ text: '', ok: true })),
  readFile: vi.fn(() => undefined),
}

describe('the whole argument string has a placeholder', () => {
  it('expands $ARGUMENTS to everything the user typed', async () => {
    const out = await expandCommandTemplate('Review: $ARGUMENTS', 'src/a.ts src/b.ts', deps)
    expect(out, 'a command could not reach the arguments it was invoked with').toBe(
      'Review: src/a.ts src/b.ts',
    )
  })

  it('keeps the quoting that decided the grouping', async () => {
    const out = await expandCommandTemplate('$ARGUMENTS', '"two words" solo', deps)
    expect(
      out,
      'the raw string was rebuilt from split tokens, so the grouping the user typed was lost',
    ).toBe('"two words" solo')
  })

  it('expands to nothing when the command was invoked bare', async () => {
    const out = await expandCommandTemplate('Review: $ARGUMENTS', '', deps)
    expect(out).toBe('Review: ')
  })

  it('honours the backslash escape', async () => {
    const out = await expandCommandTemplate('Write \\$ARGUMENTS to mean the placeholder', 'x', deps)
    expect(out).toBe('Write $ARGUMENTS to mean the placeholder')
  })

  it('lists $ARGUMENTS in the hints, before the positions', () => {
    // A palette reading `$3, $ARGUMENTS` suggests a fourth position. It is the whole string.
    expect(templateHints('$2 $ARGUMENTS $1')).toEqual(['$ARGUMENTS', '$1', '$2'])
  })

  it('does not ask the user for an escaped placeholder', () => {
    // `\\$1` is prose ABOUT a placeholder, not a request for one; listing it asks for an argument
    // the template will never substitute. It also broke the sort outright — the match carries the
    // backslash, so `slice(1)` gave `"$1"`, `Number` gave `NaN`, and a comparator returning `NaN`
    // leaves the order unspecified.
    expect(templateHints('costs \\$1 and takes $2')).toEqual(['$2'])
  })

  it('still expands positional placeholders', async () => {
    // The control. `$ARGUMENTS` must not eat `$1`, and a shared regex is exactly where that goes
    // wrong: `$ARGUMENTS` starts with `$A`, and a pattern that matched greedily across both would
    // change what `$1` means.
    const out = await expandCommandTemplate('first=$1 second=$2', 'alpha beta', deps)
    expect(out).toBe('first=alpha second=beta')
  })
})
