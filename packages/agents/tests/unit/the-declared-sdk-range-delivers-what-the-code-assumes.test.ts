import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The declared range promised a floor that delivered none of the parity it advertises.
 *
 * `packages/agents` declared `"@theokit/sdk": "^4.52.1 || ^5.0.0"`. Measured 2026-09-12 by
 * unpacking the published tarballs, against a control of `AgentOptions` (83-86 files in every one):
 *
 * | surface                 | 4.52.1 | 5.0.0 | 5.3.0 | 5.4.0 |
 * |-------------------------|--------|-------|-------|-------|
 * | `CompatSurface`         | 0      | 10    | 10    | 10    |
 * | `.claude/rules/*` spec  | 0      | 4     | 4     | 4     |
 * | `settings.local.json`   | 0      | 4     | 4     | 4     |
 * | `CLAUDE_PROJECT_DIR`    | 0      | 14    | 14    | 14    |
 *
 * So the boundary is the 4→5 major exactly, and the lower half of the declared range delivered ZERO
 * parity. Not one missing surface: every surface at once, invisibly, because the package resolves,
 * compiles and runs. This repository's own lockfile resolved 4.52.1, so its 1887 green tests were
 * green against an SDK where `compatSources` does not exist as an option.
 *
 * ## Why the range was narrowed rather than guarded with a fourth runtime check
 *
 * Three version guards already exist — `HOOK_GATE_SINCE`, `COMPAT_IMPORT_SINCE`, and the
 * `compatSources` warning — and each one is on a path where this layer PASSES AN OPTION to the SDK.
 * The three surfaces above are not like that: nothing is passed, the SDK simply reads a file or does
 * not, so there is no call site to guard. A fourth check could not have been written.
 *
 * The reason the floor stayed low is recorded in `sdk-adapter-create-options.ts` and has expired:
 * *"Until this package's floor can name a stable 5.x"*. `@theokit/sdk@5.5.0` is published and is
 * `latest`; stable 5.x has existed since 5.3.0.
 *
 * ## The invariant this file pins
 *
 * **Every version inside the declared range either works, or fails with a typed error naming what it
 * needs. None fails in silence.** That is the whole distinction between the two kinds of gap:
 *
 * - below 5.0.0 the surfaces are simply absent and nothing says so → closed by the RANGE
 * - between 5.0.0 and 5.4.0 `local.hooks` and the narrowed `import` are absent → guarded by
 *   `HookGateUnsupportedError` and `CompatImportUnsupportedError`, which name the version
 *
 * A test that only asserted the string would pass on a range someone widened back by hand with a
 * different spelling, so the floor is PARSED and compared numerically.
 */
/** The repo root, reached out of `packages/agents/tests/unit`. */
const ROOT = join(__dirname, '..', '..', '..', '..')

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const

/**
 * EVERY declaration of `@theokit/sdk` anywhere in the workspace, enumerated from disk.
 *
 * Enumerated rather than listed, and that is this file's own scar. The first version took a
 * hardcoded pair — `packages/agents` dependencies, `packages/theo` peerDependencies — narrowed
 * exactly those two, and passed. The installed copy did not move: the root `package.json` and two
 * `devDependencies` still admitted 4.x, and a devDependency is what a workspace actually installs.
 * So `sdk-floor.test.ts` reported two live copies, `['4.52.1', '5.5.0']`, while this file reported
 * agreement.
 *
 * A test that checks the places its author remembered measures the author's memory. The defect this
 * whole item is about is a declared range disagreeing with the installed reality, and a hardcoded
 * list reproduces it one layer up.
 */
function everySdkDeclaration(): Array<{ pkg: string; field: string; range: string }> {
  const manifests = [
    'package.json',
    ...readdirSync(join(ROOT, 'packages')).map((d) => join('packages', d, 'package.json')),
  ]
  const out: Array<{ pkg: string; field: string; range: string }> = []
  for (const rel of manifests) {
    const path = join(ROOT, rel)
    if (!existsSync(path)) continue
    const json = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >
    for (const field of DEPENDENCY_FIELDS) {
      const range = json[field]?.['@theokit/sdk']
      if (range !== undefined) out.push({ pkg: rel, field, range })
    }
  }
  return out
}

function declaredSdkRange(pkg: string, field: string): string {
  const found = everySdkDeclaration().find(
    (d) => d.pkg === `${pkg}/package.json` && d.field === field,
  )
  // A narrowing `tsc` understands, rather than `as` or `!`. Both of those tell the compiler to stop
  // asking while leaving the runtime unprotected; a throw is the same line count and is true.
  if (found === undefined) throw new Error(`${pkg} declares no @theokit/sdk under ${field}`)
  return found.range
}

/** Every `major.minor` this range admits as its lowest point, per disjunct. */
function floorsOf(range: string): Array<{ major: number; minor: number }> {
  return range.split('||').map((part) => {
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(part.trim())
    expect(m, `cannot parse a floor out of "${part.trim()}"`).not.toBeNull()
    return { major: Number(m?.[1]), minor: Number(m?.[2]) }
  })
}

/** The major below which every `.claude` parity surface is absent from the SDK. Measured, not assumed. */
const PARITY_SINCE_MAJOR = 5

describe('the declared SDK range delivers the parity the package advertises', () => {
  it('has at least one declaration to check, so a silent zero cannot pass', () => {
    // The control. `everySdkDeclaration()` reads the filesystem, and a rename or a moved root would
    // make it return nothing — at which point every loop below passes over an empty set and this
    // file reports agreement it never measured.
    expect(everySdkDeclaration().length).toBeGreaterThanOrEqual(4)
  })

  it('admits no major below the one that introduced the compat root, in ANY declaration', () => {
    for (const { pkg, field, range } of everySdkDeclaration()) {
      for (const floor of floorsOf(range)) {
        expect(
          floor.major,
          `${pkg} [${field}] admits @theokit/sdk@${floor.major}.${floor.minor}.x, where ` +
            `CompatSurface, the .claude/rules spec, settings.local.json and CLAUDE_PROJECT_DIR ` +
            `are all absent — so that floor delivers zero parity and nothing tells anyone. ` +
            `A devDependency counts: it is what the workspace installs.`,
        ).toBeGreaterThanOrEqual(PARITY_SINCE_MAJOR)
      }
    }
  })

  it('keeps `theo` from advertising a floor its own dependency refuses', () => {
    // `theo` depends on `agents` (workspace:^), so a peer range admitting a major that `agents`
    // rejects is unsatisfiable for the consumer and says nothing until they try to install. The two
    // must move together; narrowing one alone relocates the defect rather than closing it.
    const agents = floorsOf(declaredSdkRange('packages/agents', 'dependencies'))
    const theo = floorsOf(declaredSdkRange('packages/theo', 'peerDependencies'))

    const lowest = (fs: Array<{ major: number; minor: number }>) =>
      Math.min(...fs.map((f) => f.major))

    expect(
      lowest(theo),
      'theo peer-advertises an SDK major that its own agents dependency will not resolve',
    ).toBeGreaterThanOrEqual(lowest(agents))
  })

  it('leaves the guarded gaps guarded rather than folding them into the range', () => {
    // The invariant's other half, and the reason the floor is 5.0.0 and not 5.4.0. `local.hooks` and
    // the narrowed `import` landed in 5.4.0, which is INSIDE this range — and that is fine, because
    // both throw a typed error naming the version. Raising the floor to 5.4.0 to cover them would
    // strand every 5.0-5.3 consumer who uses neither, to remove a failure that already announces
    // itself. A silent gap is closed by the range; a named one is not.
    const floors = floorsOf(declaredSdkRange('packages/agents', 'dependencies'))
    expect(floors).toHaveLength(1)
    expect(floors[0]?.major).toBe(5)
    expect(
      floors[0]?.minor,
      'the floor was raised past the silent gap into the guarded one, stranding consumers to ' +
        'duplicate a refusal HookGateUnsupportedError already makes',
    ).toBe(0)
  })
})
