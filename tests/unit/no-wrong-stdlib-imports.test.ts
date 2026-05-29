import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

/**
 * T0.2 (dogfood-regressions-fix-plan v1.1) — Regression gate for
 * stdlib-cross-module import typos.
 *
 * Sente bugs como `import { tmpdir } from 'node:path'` (tmpdir mora em
 * `node:os`, NÃO `node:path`). Tal typo NÃO falha runtime imediato; só
 * TypeChecker pega — e mesmo assim alguns paths de import (alias `as`)
 * mascaram o erro até o membro ser usado de verdade.
 *
 * Pattern D85 (theokit lint-grep-not-ast): regex match léxico simples ao
 * invés de AST overkill. False positive impossível porque âncora `^import`
 * + escopo restrito a 2 stdlib modules.
 *
 * Bug original capturado: `theokit/tests/integration/pnpm-11-compat.test.ts:4`
 * fazia `import { join, tmpdir as osTmpdir } from 'node:path'`. RED gate
 * pina a regressão antes do fix; GREEN após T2.1.
 */

const ROOT = resolve(__dirname, '../..')

// Canonical member lists per Node.js stdlib (Node 22.x). When new versions
// add members, extend here — false negatives (missing a member) are
// acceptable; false positives (member in wrong list) are not.
const NODE_OS_MEMBERS = new Set([
  'tmpdir',
  'homedir',
  'hostname',
  'cpus',
  'arch',
  'platform',
  'EOL',
  'endianness',
  'freemem',
  'totalmem',
  'loadavg',
  'networkInterfaces',
  'release',
  'type',
  'uptime',
  'userInfo',
  'availableParallelism',
  'machine',
  'version',
  'constants',
  'getPriority',
  'setPriority',
])

const NODE_PATH_MEMBERS = new Set([
  'basename',
  'delimiter',
  'dirname',
  'extname',
  'format',
  'isAbsolute',
  'join',
  'normalize',
  'parse',
  'posix',
  'relative',
  'resolve',
  'sep',
  'toNamespacedPath',
  'win32',
  'matchesGlob',
])

interface BadImport {
  file: string
  line: number
  source: 'node:os' | 'node:path'
  badMember: string
  belongsTo: 'node:os' | 'node:path'
}

function extractNamedImports(line: string): { source: string; specs: string[] } | null {
  // Match: `import { a, b as c } from 'node:os'` (single OR double quote)
  const m = line.match(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/)
  if (m === null) return null
  const source = m[2]
  // Strip whitespace + extract left side of `as` aliases
  const specs = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.split(/\s+as\s+/)[0].trim())
  return { source, specs }
}

function* walkTs(dir: string): Generator<string> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build') continue
    const full = join(dir, name)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      yield* walkTs(full)
    } else if (stat.isFile() && (name.endsWith('.ts') || name.endsWith('.tsx'))) {
      yield full
    }
  }
}

function findBadImports(roots: string[]): BadImport[] {
  const bad: BadImport[] = []
  for (const root of roots) {
    for (const file of walkTs(root)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        const parsed = extractNamedImports(line)
        if (parsed === null) return
        if (parsed.source !== 'node:os' && parsed.source !== 'node:path') return
        for (const spec of parsed.specs) {
          if (parsed.source === 'node:path' && NODE_OS_MEMBERS.has(spec)) {
            bad.push({
              file: relative(ROOT, file),
              line: i + 1,
              source: 'node:path',
              badMember: spec,
              belongsTo: 'node:os',
            })
          } else if (parsed.source === 'node:os' && NODE_PATH_MEMBERS.has(spec)) {
            bad.push({
              file: relative(ROOT, file),
              line: i + 1,
              source: 'node:os',
              badMember: spec,
              belongsTo: 'node:path',
            })
          }
        }
      })
    }
  }
  return bad
}

describe('no-wrong-stdlib-imports — node:os vs node:path member check', () => {
  it('should reject import of os members from node:path', () => {
    // Given: scan src/ + tests/ + packages/ for cross-source mistakes
    const roots = ['src', 'tests', 'packages'].map((d) => join(ROOT, d)).filter((p) => {
      try {
        return statSync(p).isDirectory()
      } catch {
        return false
      }
    })

    // When: collect all bad imports of node:os members from node:path
    const bad = findBadImports(roots).filter((b) => b.source === 'node:path')

    // Then: zero violations
    if (bad.length > 0) {
      const report = bad
        .map((b) => `  ${b.file}:${b.line} — '${b.badMember}' belongs to ${b.belongsTo}, imported from ${b.source}`)
        .join('\n')
      throw new Error(
        `Found ${bad.length} import(s) of node:os members from node:path:\n${report}\n\nFix: move the member to its correct \`import { ... } from '${bad[0].belongsTo}'\` line.`,
      )
    }
    expect(bad.length).toBe(0)
  })

  it('should reject import of path members from node:os', () => {
    // Given: same scan
    const roots = ['src', 'tests', 'packages'].map((d) => join(ROOT, d)).filter((p) => {
      try {
        return statSync(p).isDirectory()
      } catch {
        return false
      }
    })

    // When: filter for inverse direction
    const bad = findBadImports(roots).filter((b) => b.source === 'node:os')

    // Then: zero violations
    expect(bad.length, JSON.stringify(bad, null, 2)).toBe(0)
  })

  it('should accept correct imports from each module (sanity)', () => {
    // Given: synthetic correct imports
    const samples = [
      `import { tmpdir, homedir } from 'node:os'`,
      `import { join, resolve as r } from 'node:path'`,
      `import { tmpdir as osTmpdir } from 'node:os'`,
    ]

    // When: parse each line
    const parsed = samples.map((l) => extractNamedImports(l))

    // Then: each parsed correctly and respects member-to-source contract
    expect(parsed.every((p) => p !== null)).toBe(true)
    for (const p of parsed) {
      if (p === null) continue
      if (p.source === 'node:os') {
        expect(p.specs.every((s) => NODE_OS_MEMBERS.has(s))).toBe(true)
      }
      if (p.source === 'node:path') {
        expect(p.specs.every((s) => NODE_PATH_MEMBERS.has(s))).toBe(true)
      }
    }
  })
})
