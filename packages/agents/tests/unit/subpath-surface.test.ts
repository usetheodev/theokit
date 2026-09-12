import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  INFRA_SUBPATHS,
  enumerateSurface,
  enumerateLayerSurface,
} from '../../scripts/generate-reexports.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const SNAPSHOT = JSON.parse(
  readFileSync(join(ROOT, 'tests/unit/__snapshots__/subpath-surface.json'), 'utf8'),
) as Record<string, { values: string[]; types: string[] }>

/**
 * M90 T0.1/T1.1 — the surface of the five infra subpaths is a contract, not a side effect.
 *
 * ## The defect this file closes
 *
 * Until M90, the whole of `tools-entry.ts` was `export * from '@theokit/sdk-tools'`, and the emitted
 * `dist/tools.d.ts` had **one line** saying the same thing. The layer lent its name without
 * interposing a decision: an upstream rename propagated verbatim, **with no build error here**, and
 * the consumer found out at a call site. The consumer's boundary gate pins the *specifier string*,
 * not the type surface, so it did not see it either.
 *
 * ## Why the snapshot reads `dist`, and not `src`
 *
 * The `.d.ts` is the artifact the consumer actually sees. A snapshot over the source would prove we
 * wrote the list, not that it reached the package — the same distinction agent-builder's M89 paid
 * dearly to learn, when a gate proved somebody had written the root into a list, and not that the
 * files were in the compiler's program.
 *
 * ## Why it reuses `enumerateSurface` instead of reimplementing
 *
 * Two lists that must stay in sync are a DRY violation with a false claim on top — it is the text of
 * `subpath-coverage.test.ts` itself (M78's F-10 review), which lost `bench` from a copy while the
 * comment swore "same scope".
 */
/**
 * Source symbols the layer deliberately does not re-export, because only ONE of the supported
 * majors has them.
 *
 * The range is `^4.52.1 || ^5.0.0`. A symbol that exists in 5.x and not in 4.x cannot be
 * re-exported unconditionally: the DTS build against 4.52.1 fails on it (measured). This set is
 * therefore a statement about the RANGE, not about the layer being incomplete — and each entry
 * carries its reason in `subpath-coverage.test.ts`'s `gaps`, which is the register for it.
 *
 * Remove an entry when the floor moves past the major that lacks the symbol.
 */
const MAJOR_SCOPED_GAPS = new Set([
  // `LiveTranscriptError` — the 5.x name for `LiveSessionError`, which 5.x keeps working and
  // deprecated. The name that crosses is the one both majors have.
  'persistence: LiveTranscriptError',
])

describe('M90 — the infra subpath surface is locked', () => {
  it('test_the_snapshot_covers_all_four_subpaths', () => {
    // `pty` left this package (#460): it carried `@theokit/sdk-pty`, whose native install step every
    // web application was paying for, and it now lives in `@theokit/agents-pty`. Its six symbols did
    // not disappear — `packages/agents-pty/tests/unit/surface.test.ts` holds the same list and
    // asserts they are the upstream identities rather than a wrapper.
    const credKeys = Object.keys(SNAPSHOT).sort((a, b) => a.localeCompare(b))
    expect(credKeys).toEqual(['interactive', 'persistence', 'sandbox', 'tools'])
  })

  /**
   * Anti-truncation floor. The number is measured, and it rises when the source grows — 173 until
   * `@theokit/sdk` started exporting `sessionHasWriter` (then under its Portuguese name, renamed in
   * `4.39.0`), `transcriptRoot`, `TranscriptBlock` and `TranscriptMessage` from `/persistence`
   * (theokit#161 A), 177 since then — the rename does not change the count, only the name.
   *
   * **181 since M67.** The `@theokit/sdk` floor moved from `^4.40.0` to `^4.49.0` (ADR 0060) and the
   * source grew by four: `/persistence` gained `atomicWriteTempTarget`, `classifySessionArtifact` and
   * its return type `SessionArtifact`; `/sandbox` gained `writableRootsFor`. All four now cross.
   * `classifySessionArtifact` is worth naming — the roadmap's M72 was about to re-implement it under
   * another name, and crossing it here is what makes that unnecessary.
   *
   * Not redundant with the identity gate below: that one compares the snapshot against the LAYER, so
   * a regeneration that produced an empty file from a broken layer would pass on both sides. This one
   * fails a snapshot that shrank, whatever the cause.
   */
  it('test_snapshot_holds_the_178_measured_symbols', () => {
    // 181 until `pty` moved out (#460). The drop is exactly its six — five values and one type —
    // and it is the one kind of shrink this floor is not meant to catch: the symbols were relocated,
    // not lost, and the package that received them asserts the same six.
    //
    // 178 since `@theokit/sdk-tools` moved to ^0.27.1. The growth is exactly the image tool's three
    // — `createViewImageTool`, `DEFAULT_MAX_IMAGE_BYTES` and `CreateViewImageToolOptions` — which
    // `tools-view-image-parity.test.ts` had been skipping loudly while the dependency was short.
    // Raising the floor is what turned that skip back into an assertion.
    // Still 178 after the SDK range widened to `^4.52.1 || ^5.0.0`. 5.x renamed this class to
    // `LiveTranscriptError` and kept `LiveSessionError` working and deprecated; only the name BOTH
    // majors have crosses, so the layer's surface is the same number under either. That is the
    // property the widening had to preserve — see the gap recorded in `subpath-coverage.test.ts`.
    //
    // 185 since B-029 NARROWED that range to `^5.0.0`. The delta is +7, all in `persistence`, with
    // nothing removed — verified against the committed snapshot rather than inferred from the
    // arithmetic:
    //
    //   LiveTranscriptError   the 5.x name, withheld above only because 4.x lacked it. That note
    //                         ended "revisit when the floor moves past 4.x"; it just did.
    //   legacyTranscriptPath, listSessions, sessionUuidFor,
    //   ListSessionsOptions, SessionIdSource, SessionListing
    //
    // Those six were never a decision. They were unreachable: the workspace resolved 4.52.1, and a
    // barrel generated against the bottom of a range ships the bottom of the range. The number this
    // floor protects had been counting a smaller SDK than the one the package claimed to support.
    const total = Object.values(SNAPSHOT).reduce((n, s) => n + s.values.length + s.types.length, 0)
    expect(total).toBe(185)
  })

  /**
   * THE HEART OF THE GATE — and what its first version did NOT do.
   *
   * It compared `enumerateSurface(spec)` (the SOURCE) against the snapshot. It never compared what the
   * LAYER exports. Result measured by the review: removing four real symbols from `/tools` and `/pty`
   * left the whole suite green — 98 of 173 symbols (57%) with no oracle at all. It was through that
   * crack that `TruncationMode` disappeared from the published surface of `4.25.0`.
   *
   * It now compares both sides **against the source**: nothing from the source may be missing in the
   * layer, and nothing may appear in the layer without existing in the source.
   */
  it('test_the_layer_re_exports_EVERYTHING_the_source_exports', async () => {
    const missing: string[] = []
    for (const [sub, spec] of Object.entries(INFRA_SUBPATHS)) {
      const layerDir = enumerateLayerSurface(sub)
      const sourceText = await enumerateSurface(spec)
      const inTheLayer = new Set([...layerDir.values, ...layerDir.types])
      for (const n of [...sourceText.values, ...sourceText.types]) {
        if (!inTheLayer.has(n) && !MAJOR_SCOPED_GAPS.has(`${sub}: ${n}`))
          missing.push(`${sub}: ${n}`)
      }
    }
    expect(
      [...missing].sort((a, b) => a.localeCompare(b)),
      'SOURCE symbols the layer does not re-export. Regenerate the blocks:\n' +
        '  npx tsx scripts/generate-reexports.mts\n' +
        'paste them into the `*-entry.ts`, run `npm run build`, then rewrite the snapshot IN THE SAME\n' +
        'commit:\n' +
        '  npx tsx scripts/generate-reexports.mts --json > tests/unit/__snapshots__/subpath-surface.json',
    ).toEqual([])
  }, 60_000)

  it('test_the_layer_does_not_invent_a_symbol_the_source_lacks', async () => {
    const invented: string[] = []
    for (const [sub, spec] of Object.entries(INFRA_SUBPATHS)) {
      const layerDir = enumerateLayerSurface(sub)
      const sourceText = await enumerateSurface(spec)
      const inTheSource = new Set([...sourceText.values, ...sourceText.types])
      for (const n of [...layerDir.values, ...layerDir.types]) {
        if (!inTheSource.has(n)) invented.push(`${sub}: ${n}`)
      }
    }
    expect([...invented].sort((a, b) => a.localeCompare(b))).toEqual([])
  }, 60_000)

  it('test_todays_surface_is_IDENTICAL_to_the_snapshot', () => {
    const divergences: string[] = []
    for (const sub of Object.keys(INFRA_SUBPATHS)) {
      const now = enumerateLayerSurface(sub)
      const expected = SNAPSHOT[sub]
      if (expected === undefined) {
        divergences.push(`${sub}: no entry in the snapshot`)
        continue
      }
      const before = new Set([...expected.values, ...expected.types])
      const today = new Set([...now.values, ...now.types])
      for (const n of before) if (!today.has(n)) divergences.push(`${sub}: GONE ${n}`)
      for (const n of today) if (!before.has(n)) divergences.push(`${sub}: NEW ${n}`)
    }
    expect(
      [...divergences].sort((a, b) => a.localeCompare(b)),
      'the layer surface changed. If that was intentional, rewrite the snapshot IN THE SAME commit:\n' +
        '  npx tsx scripts/generate-reexports.mts --json > tests/unit/__snapshots__/subpath-surface.json\n' +
        'the command reproduces the file byte for byte — if `git diff` does not settle at zero after\n' +
        'applying the intended change, a real divergence is left over.',
    ).toEqual([])
  })

  it('test_no_infra_entry_uses_a_star_export', () => {
    const withStar = Object.keys(INFRA_SUBPATHS).filter((sub) =>
      /^export \* from/m.test(readFileSync(join(ROOT, 'src', `${sub}-entry.ts`), 'utf8')),
    )
    expect(withStar).toEqual([])
  })

  /**
   * Sem `catch { return false }`.
   *
   * The first version swallowed a missing `dist/` and returned green — in a clean clone with no
   * build, the only test that looked at the delivered artifact passed by vacuity. A missing build is
   * a test failure, not a silent success (`error-handling.md § 2`).
   */
  it('test_the_EMITTED_dist_exists_and_has_no_star_export — what the consumer sees', () => {
    const withoutBuild = Object.keys(INFRA_SUBPATHS).filter(
      (sub) => !existsSync(join(ROOT, 'dist', `${sub}.d.ts`)),
    )
    expect(
      withoutBuild,
      'run `npm run build` — without `dist/` this gate measures nothing',
    ).toEqual([])
    const withStar = Object.keys(INFRA_SUBPATHS).filter((sub) =>
      /^export \* from/m.test(readFileSync(join(ROOT, 'dist', `${sub}.d.ts`), 'utf8')),
    )
    expect(withStar).toEqual([])
  })
})
