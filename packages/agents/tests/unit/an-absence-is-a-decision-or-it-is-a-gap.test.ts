import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * B-074 — an absence that reads as an oversight is re-investigated at full cost by the next person.
 *
 * The `.claude` sweep produced a table with absences in it, and shipping that without separating
 * "we decided not to" from "we have not got to it" reproduces the defect this backlog exists to
 * close. Four decisions across three files — `keybindings.json`, `themes/*.json`, and
 * `~/.claude.json` split into its two halves — are now declared where a reader meets them.
 *
 * ## Why the README and not only the rule
 *
 * `.claude/rules/foreign-config-surfaces.md` is this project's source of truth and is **gitignored**,
 * so nothing in it reaches somebody who installs the package. The README is the copy that travels.
 * A decision recorded only in the rule is a decision made for one checkout.
 *
 * ## Why a test at all
 *
 * Without one, the declaration is prose that nothing verifies, which is the same shape as the
 * capability-with-no-caller this backlog keeps finding — one genre over. These cases assert the
 * three properties the item's Definition of Done names, not the wording.
 */
const README = readFileSync(join(import.meta.dirname, '..', '..', 'README.md'), 'utf8')

const OUT_OF_SCOPE = ['keybindings.json', 'themes/*.json'] as const

describe('an absence is a decision, or it is a gap', () => {
  /** The surface's row in the table, or `undefined` — prose elsewhere in the file does not count. */
  const verdictRowFor = (surface: string): string | undefined =>
    README.split('\n').find((l) => l.startsWith('| ') && l.includes(surface) && l.includes('|', 2))

  it.each(OUT_OF_SCOPE)('gives %s a row in the table, with a verdict', (surface) => {
    // Asserted as a ROW rather than as a substring, and the difference was measured: the first
    // version used `toContain(surface)`, and deleting the table row left it green because the same
    // name appears in the prose below — prose this test's own author wrote. An assertion that
    // passes from the explanation of a decision, rather than from the decision, verifies nothing.
    const row = verdictRowFor(surface)

    expect(row, `${surface} has no row, so its absence reads as an oversight`).toBeDefined()
    expect(row, `${surface}'s row carries no verdict`).toMatch(/out of scope|refused|read/)
  })

  it('never says "out of scope" without naming who owns it instead', () => {
    // The DoD's third bullet. "Not supported" with no successor sends the reader looking for a bug.
    for (const line of README.split('\n').filter((l) => l.includes('out of scope'))) {
      expect(
        /@theokit\/tui|a CLI's own state/.test(line),
        `"${line.trim()}" refuses a surface without naming who owns it`,
      ).toBe(true)
    }
  })

  it('splits `~/.claude.json` rather than deciding it whole', () => {
    // The DoD's second bullet, and the one a summary would flatten. The file holds a CLI's session
    // state AND the operator's personal-scope MCP servers; those belong to different owners, so one
    // verdict over the whole file would be wrong about one half whichever way it went.
    const rows = README.split('\n').filter((l) => l.includes('~/.claude.json'))

    expect(
      rows.length,
      '`~/.claude.json` got a single verdict, so one of its halves is misfiled',
    ).toBeGreaterThanOrEqual(2)
    expect(rows.some((r) => r.includes('out of scope'))).toBe(true)
    expect(
      rows.some((r) => r.includes('not read yet')),
      'the MCP-server half is filed as refused rather than as undone',
    ).toBe(true)
  })

  it('keeps "not read yet" distinguishable from "refused"', () => {
    // The whole point of the item: the two must not collapse into one word. A reader deciding
    // whether to file a bug needs to know which one they are looking at.
    expect(README).toContain('not read yet')
    expect(README).toContain('refused')
  })
})
