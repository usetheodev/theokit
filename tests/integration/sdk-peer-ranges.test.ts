/**
 * M48 (ecosystem-integration-guarantee) T3.1 — the SDK-family version ranges are CLOSED and
 * aligned to the framework's v4 floor. Guards the drift discovered during discovery: the root
 * devDep pinned a stale `^3.5.0` (so root-level tests resolved 3.5.0, not the framework's 4.0.2)
 * and the `@theokit/sdk-tools` peer was left open (`>=0.11.0`). A closed range is the install-time
 * half of the seam guarantee (the boot check + contract test are the runtime half).
 *
 * ## Rewritten (backlog B-M67-01, item 6)
 *
 * `test_sdk_tools_peer_is_closed_caret` demanded `peerDependencies['@theokit/sdk-tools'] === '^0.11.0'`.
 * Two things changed since, and neither was reflected here: the package moved from optional peer to
 * **dependency** (the `@theokit/agents/tools` subpath does a static `export *` from it — a missing
 * optional peer would break the import), and the line moved 15 minors. The guard went red by default,
 * and a permanently red guard trains the team to ignore red.
 *
 * The property it always meant to express is not the literal: it is that **no SDK-family range is
 * left open**, and that the manifest does not lie about where the dependency lives. This version
 * asserts that, and adds the lens that was missing — a `peerDependenciesMeta` entry with no matching
 * `peerDependencies` entry is inert metadata, a claim of optionality npm never reads.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const readPkg = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as Record<string, unknown>

/** A range is closed when it has a ceiling: caret/tilde, or an explicit `<`/`<=`. */
function isClosed(range: string): boolean {
  if (/^[\^~]/.test(range)) return true
  return /<=?\s*\d/.test(range)
}

const MANIFESTS = ['packages/theo/package.json', 'packages/agents/package.json'] as const
const BUCKETS = ['dependencies', 'peerDependencies'] as const

describe('SDK-family peer/version ranges are closed + aligned (M48 T3.1)', () => {
  it('test_no_open_sdk_family_range_remains', () => {
    // A ceiling-less `>=0.11.0` lets the consumer inherit a new major without review — the original
    // M48 defect, and it applies to `dependencies` just as much as to `peerDependencies`.
    for (const manifest of MANIFESTS) {
      const pkg = readPkg(manifest)
      for (const bucket of BUCKETS) {
        const entries = (pkg[bucket] ?? {}) as Record<string, string>
        for (const [name, range] of Object.entries(entries)) {
          if (!name.startsWith('@theokit/sdk')) continue
          expect(isClosed(range), `${manifest} § ${bucket} declares an open ${name}=${range}`).toBe(
            true,
          )
        }
      }
    }
  })

  it('test_the_sdk_family_lives_in_exactly_one_bucket_per_manifest', () => {
    // Declaring the same package in `dependencies` and `devDependencies` with DIFFERENT ranges is the
    // failure mode ADR 0062 documented on the presenter: the suite runs against one version and the
    // consumer installs another, and the divergence only surfaces in production.
    for (const manifest of MANIFESTS) {
      const pkg = readPkg(manifest)
      const seen = new Map<string, { bucket: string; range: string }>()
      for (const bucket of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
        for (const [name, range] of Object.entries((pkg[bucket] ?? {}) as Record<string, string>)) {
          if (!name.startsWith('@theokit/sdk')) continue
          const prior = seen.get(name)
          if (prior !== undefined && prior.range !== range) {
            expect.fail(
              `${manifest} declares ${name} twice with different ranges: ` +
                `${prior.bucket}=${prior.range} vs ${bucket}=${range}`,
            )
          }
          seen.set(name, { bucket, range })
        }
      }
    }
  })

  it('test_every_peer_meta_entry_has_a_matching_peer', () => {
    // `peerDependenciesMeta` only qualifies an existing peer. An orphan entry makes nothing optional
    // — it merely asserts, in the published manifest, a contract npm never reads.
    for (const manifest of MANIFESTS) {
      const pkg = readPkg(manifest)
      const peers = (pkg.peerDependencies ?? {}) as Record<string, string>
      const meta = (pkg.peerDependenciesMeta ?? {}) as Record<string, unknown>
      for (const name of Object.keys(meta)) {
        expect(
          Object.hasOwn(peers, name),
          `${manifest} marks ${name} optional in peerDependenciesMeta but declares no such peer`,
        ).toBe(true)
      }
    }
  })

  it('test_root_devdep_sdk_aligned_to_v5_line', () => {
    // The root devDep must track the v5 line (not the stale `^3.5.0` hoist EC-C fixed). Assert the
    // caret prefix, NOT an exact pin, so a within-v5 bump (5.0 → 5.1 → 5.2) stays green — only a
    // drop off v5 fails here.
    //
    // Was `/^\^4\./` until B-029. That is not a threshold somebody chose to raise: every `.claude`
    // parity surface this framework advertises — `CompatSurface`, the `.claude/rules` spec,
    // `settings.local.json`, `CLAUDE_PROJECT_DIR` — is absent from 4.x and present from 5.0.0,
    // measured by unpacking the tarballs. A devDep on the v4 line is what the workspace actually
    // installs, so this assertion was pinning the resolution that made the whole suite green
    // against an SDK the packages could not use.
    const root = readPkg('package.json')
    const dev = root.devDependencies as Record<string, string>
    expect(dev['@theokit/sdk']).toMatch(/^\^5\./)
  })

  it('test_isClosed_rejects_the_open_shapes', () => {
    // Negative lens over the oracle: if `isClosed` accepted everything, the first two tests would go
    // green without proving a thing.
    for (const open of ['>=0.11.0', '>0.11.0', '*', 'latest', '']) {
      expect(isClosed(open), `should reject "${open}"`).toBe(false)
    }
    for (const closed of ['^0.26.1', '~1.2.3', '>=0.2.0 <1.0.0', '>=1 <=2']) {
      expect(isClosed(closed), `should accept "${closed}"`).toBe(true)
    }
  })
})
