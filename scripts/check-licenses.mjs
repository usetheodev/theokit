#!/usr/bin/env node
// License compliance gate — pnpm-native (uses `pnpm licenses list --json`).
//
// Why a custom script: license-checker(-rseidelsohn) assumes the npm flat
// node_modules layout. pnpm hoists into `.pnpm/` so the tool reports
// "No packages found." `pnpm licenses` reads the lockfile directly and
// works on every package manager mode.
//
// Policy: only allow permissive licenses compatible with Apache-2.0.
// Anything with a copyleft (GPL/AGPL/LGPL/MPL) or no declared license
// blocks the gate. Update ALLOWLIST below to add/remove licenses.

import { execSync } from 'node:child_process'
import process from 'node:process'

const ALLOWLIST = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'Unlicense',
  'Python-2.0',
  'BlueOak-1.0.0',
  'WTFPL',
  'PSF-2.0',
])

// Strip surrounding parentheses with simple character iteration — keeps
// the function regex-free so the lint security warning does not flag
// pathological backtracking patterns (the original regex was safe but
// SonarJS flagged it conservatively).
function stripParens(s) {
  let result = s
  while (result.length > 0 && (result.startsWith('(') || result.startsWith(')'))) {
    result = result.slice(1)
  }
  while (result.length > 0 && (result.endsWith('(') || result.endsWith(')'))) {
    result = result.slice(0, -1)
  }
  return result
}

// Some packages declare composite/SPDX-expression licenses. Decompose them
// at the OR-boundary; if any single license in the OR is allowed, accept.
function isAllowed(spdx) {
  if (!spdx || spdx === 'UNKNOWN') return false
  const orParts = spdx.split(' OR ').map((s) => stripParens(s.trim()))
  for (const part of orParts) {
    const andParts = part.split(' AND ').map((s) => s.trim())
    if (andParts.every((p) => ALLOWLIST.has(stripParens(p)))) return true
  }
  // Fall back to single-license check (covers "(MIT)" style)
  return ALLOWLIST.has(stripParens(spdx.trim()))
}

let raw
try {
  // Build-time license gate. We resolve `pnpm` via PATH because this
  // script is invoked only as a manual / CI step inside the repo —
  // there is no untrusted attacker who can manipulate the developer's
  // PATH between cloning and running the gate.
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local build tool
  raw = execSync('pnpm licenses list --prod --json', { encoding: 'utf8' })
} catch (err) {
  console.error('Failed to run `pnpm licenses list`:', err.message)
  process.exit(2)
}

const data = JSON.parse(raw)
const violations = []
let total = 0

for (const [license, pkgs] of Object.entries(data)) {
  total += pkgs.length
  if (!isAllowed(license)) {
    for (const pkg of pkgs) {
      violations.push({ name: pkg.name, version: pkg.versions?.[0] ?? '?', license })
    }
  }
}

if (violations.length > 0) {
  console.error(`License compliance: FAIL — ${violations.length} disallowed packages`)
  console.error('')
  for (const v of violations) {
    console.error(`  ${v.name}@${v.version}  →  ${v.license}`)
  }
  console.error('')
  console.error(`Allowed: ${[...ALLOWLIST].sort().join(', ')}`)
  process.exit(1)
}

console.log(`License compliance: OK — ${total} packages, all permissive.`)
