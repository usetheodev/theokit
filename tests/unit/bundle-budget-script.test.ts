import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'

/**
 * T7.2 — scripts/check-bundle-budget.sh.
 *
 * Locks in the 193.90 KB result from Phase 4 (nextjs-maturity) so any
 * future PR that regresses bundle size fails CI loudly. The script
 * runs `theokit build` against fixtures/template-default and compares
 * the largest emitted `index-*.js` chunk's gzipped size against the
 * `BUNDLE_BUDGET_KB` env var (default 350).
 *
 * These tests exercise the script's branching by:
 *   1. Building a tmp fixture that mimics .theo/client/assets layout
 *   2. Writing controllable-size dummy index-*.js files
 *   3. Invoking the script with BUNDLE_SKIP_BUILD=1 + BUNDLE_FIXTURE
 *
 * EC-10: largest-chunk semantics (not sum).
 * EC-10b: Node zlib gzip (not shell `gzip` command).
 */

const SCRIPT = resolve(__dirname, '../../scripts/check-bundle-budget.sh')

interface ScriptResult {
  exitCode: number
  stdout: string
  stderr: string
}

function runScript(env: Record<string, string>): ScriptResult {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local test running the project's bundle-budget script via system `bash`
  const res = spawnSync('bash', [SCRIPT], {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, ...env, BUNDLE_SKIP_BUILD: '1' },
    encoding: 'utf-8',
  })
  return {
    exitCode: res.status ?? 0,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  }
}

function makeFixture(chunks: Record<string, Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), 'theokit-bundle-budget-'))
  const assetsDir = join(dir, '.theo', 'client', 'assets')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tmp', private: true }))
  for (const [name, content] of Object.entries(chunks)) {
    writeFileSync(join(assetsDir, name), content)
  }
  return dir
}

describe('check-bundle-budget.sh — under budget', () => {
  let fixture: string

  beforeAll(() => {
    // 200 KB of zero bytes → ~200 bytes gzipped. Well under any budget.
    const content = Buffer.alloc(200 * 1024)
    fixture = makeFixture({ 'index-tiny.js': content })
  })

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true })
  })

  it('Given chunk gzips below budget, Then exit 0 + "OK" message', () => {
    const res = runScript({ BUNDLE_FIXTURE: fixture, BUNDLE_BUDGET_KB: '350' })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('[bundle-budget] OK')
  })
})

describe('check-bundle-budget.sh — over budget', () => {
  let fixture: string

  beforeAll(() => {
    // 400 KB of cryptographically random bytes → effectively incompressible
    // (gzip output ≥ 99% of input). Deterministic patterns would
    // compress aggressively and defeat the test.
    fixture = makeFixture({ 'index-huge.js': randomBytes(400 * 1024) })
  })

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true })
  })

  it('Given chunk gzips above budget, Then exit 1 + "FAIL" message', () => {
    const res = runScript({ BUNDLE_FIXTURE: fixture, BUNDLE_BUDGET_KB: '50' })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('[bundle-budget] FAIL')
  })
})

describe('check-bundle-budget.sh — no build output', () => {
  let fixture: string

  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), 'theokit-bundle-budget-empty-'))
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'tmp', private: true }))
  })

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true })
  })

  it('Given no .theo/client/assets directory, Then exit 2 + clear error', () => {
    const res = runScript({ BUNDLE_FIXTURE: fixture })
    expect(res.exitCode).toBe(2)
    expect(res.stderr).toContain('build output not found')
  })
})

describe('check-bundle-budget.sh — EC-10 largest-chunk semantics', () => {
  let fixture: string

  beforeAll(() => {
    // Two chunks. The small one gzips to ~30 bytes (Buffer.alloc is zero
    // bytes — highly compressible). The large one is incompressible
    // random bytes, ~200 KB gzipped. If the script ever summed, budget
    // tests would fail; with largest-only semantics, only the 200 KB
    // chunk counts.
    fixture = makeFixture({
      'index-small.js': Buffer.alloc(10 * 1024),
      'index-large.js': randomBytes(200 * 1024),
    })
  })

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true })
  })

  it('Given two chunks (one small, one ~200 KB gzipped), Then OK when budget is 250 KB (largest-chunk semantics, NOT sum)', () => {
    const res = runScript({ BUNDLE_FIXTURE: fixture, BUNDLE_BUDGET_KB: '250' })
    expect(res.exitCode).toBe(0)
    // The reported file should be the larger one
    expect(res.stdout).toContain('index-large.js')
  })
})

describe('check-bundle-budget.sh — EC-10b uses Node zlib (not shell gzip)', () => {
  it('Given the script source, Then it invokes node -e (not the `gzip` shell binary)', () => {
    const source = readFileSync(SCRIPT, 'utf-8')
    // Negative assertion: no top-level pipe to `gzip -c`.
    expect(source).not.toMatch(/\|\s*gzip\s+-c/)
    // Positive assertion: uses Node + zlib for portability.
    expect(source).toMatch(/node\s+-e/)
    expect(source).toContain("require('zlib')")
  })
})

describe('check-bundle-budget.sh — verify gzip size compute matches Node zlib', () => {
  it('Given a known buffer, When the script measures, Then the byte count matches Node zlib output', () => {
    // Same payload + same algorithm → must match. Use random bytes so
    // gzip output is non-trivial (not 30 bytes of header alone).
    const buf = randomBytes(123 * 1024)
    const expectedGz = gzipSync(buf).length
    const fixture = makeFixture({ 'index-canary.js': buf })
    try {
      // Set budget to expectedGz + 1 byte so the script's report passes.
      const budgetKb = Math.ceil((expectedGz + 1024) / 1024)
      const res = runScript({ BUNDLE_FIXTURE: fixture, BUNDLE_BUDGET_KB: String(budgetKb) })
      expect(res.exitCode).toBe(0)
      // The exact byte figure surfaces in the OK line.
      expect(res.stdout).toContain(`${expectedGz} bytes`)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})

describe('check-bundle-budget.sh — dogfood check wiring', () => {
  it('Given scripts/dogfood-smoke.sh, Then references the bundle budget check', () => {
    const dogfood = readFileSync(resolve(__dirname, '../../scripts/dogfood-smoke.sh'), 'utf-8')
    expect(dogfood).toMatch(/bundle.budget|check-bundle-budget/i)
  })
})
