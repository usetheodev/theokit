import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadCustomCommands } from '../../src/config/custom-commands.js'
import { reportUnloadedSurfaces } from '../../src/bridge/unloaded-surfaces.js'

/**
 * `.claude/workflows/*.js` is found, reported, and deliberately NOT executed.
 *
 * B-027 measured the gap and its Definition of Done named the two acceptable answers: load the
 * surface, or declare it out of scope with a reason that is about THIS PRODUCT rather than about
 * effort. It then supplied the reason itself, which is the one that holds up:
 *
 *   "an executable JS file that orchestrates subagents is a different trust proposition from a
 *    markdown prompt, and that is a legitimate reason to refuse it"
 *
 * Every other surface this layer admits — `commands`, `hooks`, `plugins`, `skills`, `subagents` — is
 * DATA. A workflow file is CODE, and the difference is not stylistic. In the reference, a person
 * chose to start a CLI in that directory. Here the directory is an argument to a library, and a
 * consumer who passes a path they did not write would execute its JavaScript by doing so. Loading
 * this surface would make `cwd` an execution vector for every consumer of the package, which is a
 * decision that belongs to them and not to us.
 *
 * ## The orchestration itself is NOT refused
 *
 * `@theokit/sdk` ships `Workflow`, `agentStep` and `createSquad`; composing many subagents from a
 * script is supported and typed. What is refused is DISCOVERING AND EXECUTING a file found on disk.
 * A refusal that did not say where the capability lives would send the reader to a changelog.
 *
 * ## Why a report and not silence
 *
 * The DoD's third bullet: a consumer pointing at a directory with workflows must not be left
 * believing they loaded. Silence here is the same defect as the dropped `alwaysLoad` in
 * `mcp-file.ts` and the ignored output style in B-022 — the author sees no complaint and concludes
 * the thing took effect.
 */
function projectWith(entries: Record<string, string>, dir = '.claude/workflows'): string {
  const cwd = mkdtempSync(join(tmpdir(), 'theokit-workflows-'))
  const full = join(cwd, ...dir.split('/'))
  mkdirSync(full, { recursive: true })
  for (const [name, body] of Object.entries(entries)) writeFileSync(join(full, name), body)
  return cwd
}

describe('a workflows directory is reported rather than run', () => {
  it('reports the directory, naming the files it did not execute', () => {
    const warnings: string[] = []
    const cwd = projectWith({ 'triage.js': 'export const meta = {}', 'sweep.js': '' })

    reportUnloadedSurfaces({ cwd, onWarn: (w) => warnings.push(w) })

    const said = warnings.join('\n')
    expect(said, 'the directory was found and nothing was said').toContain('workflows')
    expect(said).toContain('triage.js')
    expect(said).toContain('sweep.js')
  })

  it('says WHY, in terms of this product rather than of effort', () => {
    const warnings: string[] = []
    const cwd = projectWith({ 'a.js': '' })

    reportUnloadedSurfaces({ cwd, onWarn: (w) => warnings.push(w) })

    // The DoD is explicit that "we did not get to it" is not an acceptable reason. The refusal has
    // to name the trust difference, or it is an apology rather than a decision.
    //
    // The first version of this assertion was /execut|trust/i and it was worthless: "execute" also
    // appears in the neutral half of the report ("does NOT execute"), so it stayed green with the
    // entire justification deleted — caught by mutating the reason away and watching it pass. It now
    // matches the clause that ONLY the reason can satisfy.
    const said = warnings.join('\n')
    expect(said, 'the report does not say a workflow file is code').toMatch(/is code/i)
    expect(said, 'the report does not name whose decision this is').toMatch(/belongs to you/i)
  })

  it('names where the capability DOES live', () => {
    const warnings: string[] = []
    const cwd = projectWith({ 'a.js': '' })

    reportUnloadedSurfaces({ cwd, onWarn: (w) => warnings.push(w) })

    // A refusal that does not point at the supported path sends the reader to a changelog.
    expect(warnings.join('\n')).toMatch(/Workflow|agentStep|createSquad/)
  })

  it('says nothing when there is no workflows directory', () => {
    // The control. A reporter that fired unconditionally would be noise in every project that never
    // wrote a workflow, and noise is how a real report stops being read.
    const warnings: string[] = []
    const cwd = mkdtempSync(join(tmpdir(), 'theokit-no-workflows-'))

    reportUnloadedSurfaces({ cwd, onWarn: (w) => warnings.push(w) })

    expect(warnings).toEqual([])
  })

  it('says nothing when the directory exists but holds no scripts', () => {
    // A second control, and the one that stops the report from becoming a directory-existence alarm:
    // an empty `workflows/` is not a workflow anybody wrote.
    const warnings: string[] = []
    const cwd = projectWith({ 'README.md': 'notes' })

    reportUnloadedSurfaces({ cwd, onWarn: (w) => warnings.push(w) })

    expect(warnings).toEqual([])
  })
})

/**
 * The report reaches the consumer who declared the dialect.
 *
 * A reporter nobody calls is the defect this backlog exists to close, one indirection further out —
 * so the decision of WHERE to call it is the load-bearing half of B-027, not the message text.
 *
 * `loadCustomCommands` is the seam, and its own `COMPAT_COMMANDS_DIR` docblock already states why:
 *
 *   "A partial dialect is worse than none, because whoever watched the other three work has no
 *    reason to suspect the fourth."
 *
 * That was written about commands, the fourth surface. Workflows is the fifth, and the sentence
 * holds unchanged. A consumer who declares `claude-code`, watches rules, skills, subagents and
 * commands load out of `.claude/`, and has a `workflows/` directory sitting in the same folder, has
 * every reason to believe it loaded too.
 *
 * It fires on the DECLARATION, not on the trust grant: an untrusted project still gets the message,
 * because "we did not run your workflows" is true either way and the reason differs. And it stays
 * silent for a caller who never declared the dialect — that caller is not reading `.claude/` at
 * all, and a warning about a directory they never pointed at is noise.
 */
describe('the workflows report reaches the consumer who declared the dialect', () => {
  it('fires from loadCustomCommands when claude-code is declared', () => {
    const warnings: string[] = []
    const cwd = projectWith({ 'triage.js': '' })

    loadCustomCommands({
      projectDir: cwd,
      projectTrusted: true,
      compatSources: ['claude-code'],
      onWarn: (w) => warnings.push(w),
    })

    expect(
      warnings.join('\n'),
      'the dialect was declared and workflows went unmentioned',
    ).toContain('triage.js')
  })

  it('fires for the narrowed declaration too, not only the bare source name', () => {
    // #704 measured this exact trap on commands: `includes('claude-code')` reads the narrowed form
    // as not-declared, and the directory went unread with no message. A second surface repeating
    // the bug is the same silence with a later date.
    const warnings: string[] = []
    const cwd = projectWith({ 'triage.js': '' })

    loadCustomCommands({
      projectDir: cwd,
      projectTrusted: true,
      compatSources: [{ kind: 'claude-code', import: ['skills'] }],
      onWarn: (w) => warnings.push(w),
    })

    expect(warnings.join('\n')).toContain('triage.js')
  })

  it('still fires when the project is NOT trusted', () => {
    // "We did not run your workflows" is true either way; only the reason differs. Reporting it
    // solely on the trusted path would hide the surface from the consumer most likely to be
    // auditing what a foreign repository contains.
    const warnings: string[] = []
    const cwd = projectWith({ 'triage.js': '' })

    loadCustomCommands({
      projectDir: cwd,
      projectTrusted: false,
      compatSources: ['claude-code'],
      onWarn: (w) => warnings.push(w),
    })

    expect(warnings.join('\n')).toContain('triage.js')
  })

  it('says nothing to a caller who never declared the dialect', () => {
    // The control, and the one that keeps this from becoming noise: a caller not reading `.claude/`
    // gets no opinion about a directory they never pointed at.
    const warnings: string[] = []
    const cwd = projectWith({ 'triage.js': '' })

    loadCustomCommands({
      projectDir: cwd,
      projectTrusted: true,
      onWarn: (w) => warnings.push(w),
    })

    expect(warnings.join('\n')).not.toContain('triage.js')
  })
})
