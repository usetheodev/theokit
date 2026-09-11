import { describe, expect, it } from 'vitest'

import { expandCommandTemplate } from '../../src/config/command-template.js'

/**
 * `` KEY=!`cmd` `` executed, and the specification says it must not.
 *
 * The contract is explicit: the inline form is recognised only when `!` starts a line or follows
 * whitespace. When it follows another character the placeholder stays literal and the command does
 * NOT run. The regex applied the leading-boundary guard `(?<!\S)` to the `@file` branch only, so the
 * shell branch matched anywhere.
 *
 * This is the one divergence in the whole parity survey where this product executes MORE than the
 * specification permits, and the trigger is a markdown file loaded from a working directory. Every
 * other finding is something that fails to happen; this one is something that happens.
 *
 * The two positive cases are kept deliberately: a fix that closes the hole by refusing every inline
 * command would pass the negative test and break the feature.
 */
const deps = {
  shell: (cmd: string) => Promise.resolve({ text: `<ran:${cmd}>`, ok: true }),
  readFile: () => undefined,
  warn: () => {},
}

describe('an inline command is recognised only at a boundary', () => {
  it('test_a_bang_after_a_non_space_character_stays_literal', async () => {
    const out = await expandCommandTemplate('KEY=!`echo boom`', '', deps)
    expect(out, 'the command ran from a position the spec defines as literal text').toBe(
      'KEY=!`echo boom`',
    )
  })

  it('test_a_bang_after_whitespace_still_runs', async () => {
    const out = await expandCommandTemplate('inline !`echo hi`', '', deps)
    expect(out, 'the documented position must keep working').toBe('inline <ran:echo hi>')
  })

  it('test_a_bang_at_the_start_of_the_template_still_runs', async () => {
    const out = await expandCommandTemplate('!`echo first`', '', deps)
    expect(out).toBe('<ran:echo first>')
  })

  it('test_a_bang_at_the_start_of_a_later_line_still_runs', async () => {
    const out = await expandCommandTemplate('title\n!`echo second`', '', deps)
    expect(out).toBe('title\n<ran:echo second>')
  })
})
