#!/usr/bin/env node
/**
 * theokit-evolution-ci-and-dx Phase 1B (T1B.1) — Dist-tag CI guard generalized.
 *
 * Validates dist-tag drift across 4 packages:
 *   - theokit          (alpha-track) — latest >= alpha
 *   - create-theokit   (alpha-track) — latest >= alpha
 *   - @usetheo/sdk     (stable)      — only latest matters
 *   - @usetheo/ui      (next-track)  — latest >= next
 *
 * Exit codes:
 *   0 — all dist-tags consistent (latest >= floor for every checked package)
 *   1 — drift detected (latest < floor for at least one package)
 *   2 — network failure (npm registry unreachable) — workflow retries on this
 *
 * Background: sessão 2026-05-28 detectou drift 3x manualmente
 * (theokit@latest=alpha.8 enquanto alpha.13 publicado, create-theokit idem,
 * @usetheo/ui@latest=0.1.0 enquanto 0.12.0 disponível).
 * Substitui scripts/validate-ui-latest-tag.mjs (cobre 1 pkg apenas).
 *
 * EC-2 (v1.1) — workflow caller distingue exit 1 (hard drift) vs exit 2
 * (retryable network).
 */
import { execFileSync } from 'node:child_process'

/** @type {Array<{ name: string, floorTag: string | null }>} */
const PACKAGES = [
  { name: 'theokit', floorTag: 'alpha' },
  { name: 'create-theokit', floorTag: 'alpha' },
  { name: '@usetheo/sdk', floorTag: null }, // stable-only, no pre-release track
  { name: '@usetheo/ui', floorTag: 'next' },
]

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/.exec(v)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ?? null,
    preNum: m[5] ? Number(m[5]) : 0,
  }
}

function compareSemverPrerelease(a, b) {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  // Pre-release: missing pre > pre (1.0.0 > 1.0.0-alpha)
  if (a.pre === null && b.pre !== null) return 1
  if (a.pre !== null && b.pre === null) return -1
  if (a.pre !== b.pre) return (a.pre || '').localeCompare(b.pre || '')
  return a.preNum - b.preNum
}

/**
 * Fetch dist-tags for a package via `npm view`. Throws on network failure.
 * Returns { dist: Record<string,string> } on success.
 */
function fetchDistTags(pkgName) {
  try {
    const out = execFileSync('npm', ['view', pkgName, 'dist-tags', '--json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    })
    return { ok: true, dist: JSON.parse(out) }
  } catch (err) {
    // Distinguish: 404 (pkg not published) vs network err
    const stderr = err.stderr?.toString() ?? ''
    if (stderr.includes('E404') || stderr.includes('Not found')) {
      return { ok: true, dist: {} } // treat 404 as "no tags" — skip gracefully
    }
    return { ok: false, error: err.message, network: true }
  }
}

function validatePackage(pkg) {
  const result = fetchDistTags(pkg.name)
  if (!result.ok) {
    return { pkg: pkg.name, status: 'network-error', message: result.error }
  }
  const dist = result.dist
  const latest = dist.latest
  if (!latest) {
    return { pkg: pkg.name, status: 'skip', message: 'no latest tag (package not published?)' }
  }
  if (pkg.floorTag === null) {
    return { pkg: pkg.name, status: 'ok', message: `latest=${latest} (no floor-tag required)` }
  }
  const floor = dist[pkg.floorTag]
  if (!floor) {
    return {
      pkg: pkg.name,
      status: 'ok',
      message: `latest=${latest} (no @${pkg.floorTag} published, nothing to compare)`,
    }
  }
  const latestParsed = parseSemver(latest)
  const floorParsed = parseSemver(floor)
  if (!latestParsed || !floorParsed) {
    return {
      pkg: pkg.name,
      status: 'drift',
      message: `unparseable semver: latest=${latest} floor=${floor}`,
    }
  }
  const cmp = compareSemverPrerelease(latestParsed, floorParsed)
  if (cmp < 0) {
    return {
      pkg: pkg.name,
      status: 'drift',
      message: `latest=${latest} < @${pkg.floorTag}=${floor}`,
    }
  }
  return {
    pkg: pkg.name,
    status: 'ok',
    message: `latest=${latest} >= @${pkg.floorTag}=${floor}`,
  }
}

const results = PACKAGES.map(validatePackage)
let networkErrors = 0
let driftErrors = 0
for (const r of results) {
  const icon = r.status === 'ok' ? '✓' : r.status === 'skip' ? '⚠' : '✗'
  console.log(`${icon} ${r.pkg}: ${r.message}`)
  if (r.status === 'drift') driftErrors++
  if (r.status === 'network-error') networkErrors++
}

if (driftErrors > 0) {
  console.error('')
  console.error(`✗ Dist-tag drift detected in ${driftErrors} package(s).`)
  console.error('  Fix: npm dist-tag add <pkg>@<version> latest')
  process.exit(1)
}

if (networkErrors > 0) {
  console.error('')
  console.error(`✗ Network failure on ${networkErrors} package(s). Retry recommended.`)
  process.exit(2)
}

console.log('')
console.log('All dist-tags consistent.')
process.exit(0)
