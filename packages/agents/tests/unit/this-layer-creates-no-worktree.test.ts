import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * B-073 — `.worktreeinclude` is NOT implemented, because there is no worktree to copy into.
 *
 * The item was filed on the premise that "worktree isolation exists … we create the worktrees and
 * copy nothing". Re-measured on 2026-09-11 with two controls, that premise is wrong twice:
 *
 * | probe | theokit | theokit-sdk |
 * |---|---|---|
 * | `worktreeinclude` / `worktreeInclude` | 0 files | 0 files |
 * | `'worktree'` as a VALUE | 0 | 0 |
 * | `git worktree` subprocess | 0 | 0 |
 * | an `isolation:` FIELD | 0 | 0 |
 * | control `loadMcpJson` | 5 | 0 (it lives in agents) |
 * | negative control, invented term | 0 | 0 |
 *
 * The four files that mention "worktree" are a trust-store comment, a memory-scope comment, a
 * detector for running INSIDE one, and a sentence in a prompt. None creates one, and the 47
 * `isolation` hits are prose ("isolation boundary", "isolation via bwrap") with no option behind
 * them.
 *
 * So `.worktreeinclude` — a list of gitignored files to copy into a worktree at creation — would be
 * a mechanism for an event that never happens here. Building it would commit, deliberately, the
 * exact defect this backlog exists to remove: a capability declared, exported, documented, and
 * wired to nothing. The item's own Definition of Done anticipated this and allowed it: "or the
 * absence is stated where worktree isolation is configured".
 *
 * ## Why a test and not only a sentence
 *
 * A stated absence rots the moment it stops being true, and it rots silently — which is the failure
 * mode of every other item in this backlog. This test is what makes the statement falsifiable: the
 * day someone adds worktree creation, it goes red and names the obligation that comes with it.
 *
 * ## What remains reachable, and is NOT claimed fixed
 *
 * `DelegateOptions.cwd` lets a consumer aim a sub-agent at any directory, including a worktree they
 * created themselves. Such an agent runs in a checkout with no gitignored files — no `.env` above
 * all — and this layer neither creates that worktree nor copies anything into it. That hazard is
 * real, belongs to the consumer's own worktree, and is documented at the option rather than papered
 * over here.
 */
const SRC = join(import.meta.dirname, '..', '..', 'src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return name.endsWith('.ts') ? [path] : []
  })
}

/** Source text with block comments and line comments stripped — prose must not count as code. */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '')
}

describe('this layer creates no git worktree', () => {
  const files = sources(SRC)

  it('has a working probe — the control finds a term that IS in the tree', () => {
    // Without this, every assertion below is satisfied by a probe that reads nothing, which is how
    // an empty result gets mistaken for a measured absence.
    const hits = files.filter((f) => codeOf(f).includes('loadMcpJson'))
    expect(
      hits.length,
      'the probe found nothing at all — it is not reading the source',
    ).toBeGreaterThan(0)
  })

  it('invokes no `git worktree` subprocess', () => {
    const hits = files.filter((f) => /\bworktree\b/.test(codeOf(f)))
    expect(
      hits.map((f) => f.slice(SRC.length + 1)),
      'something now creates or manipulates a worktree. `.worktreeinclude` (B-073) is the ' +
        'obligation that comes with it: a fresh checkout has none of the gitignored files the ' +
        'project needs, `.env` above all, and an agent spawned there fails in a way that reads as ' +
        'a broken agent rather than a missing file. Implement the copier, or restate the absence.',
    ).toEqual([])
  })

  it('offers no `isolation` option whose value is a worktree', () => {
    // The reference spells the feature `isolation: "worktree"`. Matching the VALUE and not the word
    // keeps the 47 prose uses of "isolation" out of the result.
    const hits = files.filter((f) => /isolation\s*[?:][^\n]*worktree/i.test(codeOf(f)))
    expect(hits.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })
})
