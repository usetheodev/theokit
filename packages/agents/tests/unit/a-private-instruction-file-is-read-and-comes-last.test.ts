import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadInstructionTree } from '../../src/config/instruction-tree.js'

/**
 * The gitignored companion nobody read.
 *
 * `THEO.local.md` / `AGENTS.local.md` is where an operator keeps the standing corrections that
 * matter most to them — the ones too personal or too situational to commit. Measured 2026-09-12: a
 * grep for the four `.local` spellings returned 0 files across every package source tree, against a
 * control of 4 for `AGENTS.md`, and 0 against the newly-resolved `@theokit/sdk@5.5.0` with a control
 * of 23 for `CLAUDE.md`. The gap is in both layers, and raising the SDK floor did not close it.
 *
 * The failure is the silent kind: the file exists, it is named the documented way, nothing loads it,
 * and nothing complains. The agent behaves exactly as it would if the operator had written nothing —
 * which is indistinguishable, from the outside, from the instructions being wrong.
 *
 * ## Two halves, and the second is the one that would have shipped broken
 *
 * Membership is the obvious half. ORDER is the half that looks like it comes free and does not:
 * `localeCompare` sorts `AGENTS.local.md` BEFORE `AGENTS.md` ('l' < 'm'), so simply adding the names
 * to `DEFAULT_FILE_NAMES` composes the operator's correction *before* the rule it was written to
 * correct. That is a subtler version of the original defect — the file loads, and loses. It was
 * measured rather than reasoned about, which is why the two shipped together.
 */
function projectWith(files: Record<string, string>): string {
  const cwd = mkdtempSync(join(tmpdir(), 'theokit-local-instructions-'))
  for (const [rel, body] of Object.entries(files)) {
    const parts = rel.split('/')
    if (parts.length > 1) mkdirSync(join(cwd, ...parts.slice(0, -1)), { recursive: true })
    writeFileSync(join(cwd, ...parts), body)
  }
  return cwd
}

const BUDGET = { maxDepth: 8, maxFiles: 64, maxChars: 200_000 }

const load = (cwd: string) =>
  loadInstructionTree({ cwd, roots: ['.'], budget: BUDGET }).blocks.map((b) => b.content.trim())

describe('a private instruction file is read', () => {
  it('loads THEO.local.md beside THEO.md', () => {
    const cwd = projectWith({ 'THEO.md': 'PUBLIC RULE', 'THEO.local.md': 'PRIVATE RULE' })

    expect(load(cwd), 'the operator wrote a file the documented way and nothing read it').toContain(
      'PRIVATE RULE',
    )
  })

  it('loads AGENTS.local.md beside AGENTS.md', () => {
    const cwd = projectWith({ 'AGENTS.md': 'PUBLIC RULE', 'AGENTS.local.md': 'PRIVATE RULE' })

    expect(load(cwd)).toContain('PRIVATE RULE')
  })

  it('loads a private file with no public sibling at all', () => {
    // The chains are independent, so the private one does not need a public file to hang off.
    const cwd = projectWith({ 'AGENTS.local.md': 'PRIVATE ONLY' })

    expect(load(cwd)).toEqual(['PRIVATE ONLY'])
  })

  it('does not REPLACE the public sibling', () => {
    // The DoD's second bullet. One chain falling back to the other is the trap: adding a `THEO.md`
    // would silently orphan an existing `AGENTS.local.md` — a file the operator wrote, disabled by
    // a file they added for an unrelated reason.
    const cwd = projectWith({ 'THEO.md': 'PUBLIC RULE', 'THEO.local.md': 'PRIVATE RULE' })

    expect(load(cwd)).toEqual(['PUBLIC RULE', 'PRIVATE RULE'])
  })

  it('reads nothing that merely looks local', () => {
    // The control on MEMBERSHIP. A file called `local.md` or `AGENTS.locale.md` is somebody else's
    // file and must stay out of the prompt.
    //
    // Note what this does NOT prove, because the first version of this comment claimed it did: it
    // exercises the name list, not the ordering predicate. Those two files never reach
    // `isPrivateInstructionFile` at all — `accepts()` rejects them first — so relaxing that
    // predicate from a suffix to a substring leaves this test green. Measured by mutation. The
    // assertion that does cover it is the next one.
    const cwd = projectWith({
      'AGENTS.md': 'PUBLIC RULE',
      'local.md': 'NOT AN INSTRUCTION FILE',
      'AGENTS.locale.md': 'ALSO NOT ONE',
    })

    expect(load(cwd)).toEqual(['PUBLIC RULE'])
  })

  it('treats a caller-admitted `locale` file as public, not private', () => {
    // `fileNames` accepts a PREDICATE, so a consumer can admit any name it likes — and whatever it
    // admits is then sorted by the public/private band. That is the reachable path on which suffix
    // and substring differ: `AGENTS.locale.md` contains "local" and is not a `.local.md` file, so
    // it belongs in the public band and must not be pushed behind `ZZZ.md`.
    //
    // Without this, the band's predicate had no test that could fail — the default name list never
    // hands it a name where the two spellings disagree.
    const cwd = projectWith({
      'AGENTS.locale.md': 'LOCALE NOTES',
      'ZZZ.md': 'SORTS LAST ALPHABETICALLY',
    })

    const blocks = loadInstructionTree({
      cwd,
      roots: ['.'],
      budget: BUDGET,
      fileNames: (entry) => entry.endsWith('.md'),
    }).blocks.map((b) => b.content.trim())

    expect(blocks).toEqual(['LOCALE NOTES', 'SORTS LAST ALPHABETICALLY'])
  })
})

describe('the private file is composed AFTER the public one', () => {
  it('puts the local block last in the same directory', () => {
    // Alphabetically `AGENTS.local.md` comes first, which is exactly backwards for what the file
    // means. If this ever regresses, the operator's correction is overridden by the rule it was
    // written to override, and nothing says so.
    const cwd = projectWith({ 'AGENTS.md': 'GENERAL', 'AGENTS.local.md': 'REFINEMENT' })

    expect(load(cwd)).toEqual(['GENERAL', 'REFINEMENT'])
  })

  it('holds the band within a directory, not across the tree', () => {
    // The outer file states the general rule; the inner one refines it. That outranks public-before-
    // private, because a nested directory is a narrower scope than a root `.local` file is.
    const cwd = projectWith({
      'AGENTS.md': 'ROOT GENERAL',
      'AGENTS.local.md': 'ROOT PRIVATE',
      'nested/AGENTS.md': 'NESTED GENERAL',
      'nested/AGENTS.local.md': 'NESTED PRIVATE',
    })

    expect(load(cwd)).toEqual(['ROOT GENERAL', 'ROOT PRIVATE', 'NESTED GENERAL', 'NESTED PRIVATE'])
  })

  it('leaves `lexicographic` literally alphabetical', () => {
    // The documented escape for a caller who wants the raw order. The semantic band must not leak
    // into it, or the mode stops meaning what its name says.
    const cwd = projectWith({ 'AGENTS.md': 'GENERAL', 'AGENTS.local.md': 'REFINEMENT' })

    const blocks = loadInstructionTree({
      cwd,
      roots: ['.'],
      budget: BUDGET,
      order: 'lexicographic',
    }).blocks.map((b) => b.content.trim())

    expect(blocks).toEqual(['REFINEMENT', 'GENERAL'])
  })
})
