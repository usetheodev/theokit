import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Where `THEO.md` lives, and why the answer is tied to a version this template declares.
 *
 * `usetheokit/theokit#642` asked whether the scaffold should keep two context files once the SDK
 * could read a root `THEO.md`. It can, since `@theokit/sdk@5.0.0-next.3`.
 *
 * THE PIN MOVED, and this file is the mechanism that made that a decision instead of an accident.
 * It used to read: the template pins a 4.x range, where a root copy is read by nothing, silently —
 * so the file stays under `.theokit/`, and moving the pin past 4.x makes the explanation stop
 * matching the manifest. B-029 moved it to `^5.0.0`, this test went red, and the prose was rewritten
 * rather than quietly becoming wrong. That is the failure mode the whole issue was filed about, and
 * it is the one thing here that must keep working.
 *
 * The answer did not change, but its REASON did. On 5.x both locations are read — root `THEO.md` at
 * priority 55, `.theokit/THEO.md` at 60 — so the file stays here because it WINS a conflict, not
 * because the root is unreadable.
 */
const TEMPLATE = join(import.meta.dirname, '../../templates/default')
const read = (rel: string): string => readFileSync(join(TEMPLATE, rel), 'utf-8')

describe('the THEO.md location decision (#642)', () => {
  it('stays under .theokit/, the path that wins on the pinned SDK', () => {
    expect(read('dot-theokit/THEO.md')).toContain('# Product context')
    // Still no root copy, and the reason changed with the pin. On 4.x a root copy was inert, so
    // shipping one taught the wrong location. On 5.x it is READ and then loses to this one at 60 —
    // shipping both would scaffold two files that say the same thing, where one silently never
    // takes effect. A worse lesson than the first, because it looks like it works.
    expect(() => read('THEO.md')).toThrow()
  })

  it('the explanation cites the range the template actually declares', () => {
    const pinned = JSON.parse(read('package.json.tmpl')).dependencies['@theokit/sdk'] as string
    // Not a literal in the test: the point is that the two agree. If the pin moves, this fails and
    // the prose gets re-read — the alternative is an explanation that outlives its own premise.
    expect(read('dot-theokit/THEO.md')).toContain(pinned)
  })

  it('names the version that changed the answer, so the note expires on a fact', () => {
    // The note must stay anchored to something falsifiable rather than to an opinion. It was
    // anchored to "5.x is on `next` only"; that expired — 5.5.0 is `latest`, measured — and the
    // anchor moved with it. `531` is the change that made the root path readable, and `55` / `60`
    // are the two priorities whose ORDER is the whole reason the file stays where it is. If the SDK
    // ever reorders them, this fails and the prose gets re-read.
    const theo = read('dot-theokit/THEO.md')
    expect(theo).toContain('theokit-sdk#531')
    expect(theo).toContain('55')
    expect(theo).toContain('60')
  })

  it('keeps the pair, and says the reason is audience rather than the SDK', () => {
    // The two-file split predates the SDK limitation and outlives it: AGENTS.md addresses agents
    // that WRITE the code (and is read by other tools), THEO.md the agent that talks to users.
    // Recording that here means a future reader cannot mistake the pair for a leftover workaround.
    const theo = read('dot-theokit/THEO.md')
    expect(theo).toContain('AGENTS.md')
    expect(theo.toLowerCase()).toContain('audience')
  })
})
