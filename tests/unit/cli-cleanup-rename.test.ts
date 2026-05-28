import { describe, it, expect } from 'vitest'
import { readFile, stat, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const SRC = resolve(__dirname, '../../packages/theo/src')

describe('cli-cleanup-rename (T0.2)', () => {
  it('test_cli_cleanup_folder_exists — packages/theo/src/cli/cleanup exists', async () => {
    const s = await stat(resolve(SRC, 'cli/cleanup'))
    expect(s.isDirectory()).toBe(true)
  })

  it('test_cli_lib_folder_gone — old path no longer exists', async () => {
    await expect(stat(resolve(SRC, 'cli/lib'))).rejects.toThrow(/ENOENT/)
  })

  it('test_no_stale_cli_lib_imports — no import statement references cli/lib', async () => {
    const { execSync } = await import('node:child_process')
    // Scope to packages/theo/src only — fixtures/examples may have node_modules
    // and aren't the regression surface for cli/lib imports.
    // Exclude this test file (self-reference) and any dist/ output.
    let stdout = ''
    try {
      stdout = execSync(
        "grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --exclude-dir=node_modules --exclude-dir=dist --exclude='cli-cleanup-rename.test.ts' \"(from[[:space:]]+['\\\"]|require\\(['\\\"]).*cli/lib\" packages/theo/src 2>/dev/null || true",
        { encoding: 'utf8', cwd: resolve(__dirname, '../..') },
      )
    } catch {
      stdout = ''
    }
    const lines = stdout
      .split('\n')
      .filter((l) => l && !l.includes('dist/') && !l.includes('node_modules'))
    expect(lines).toEqual([])
  }, 15_000)

  it('test_cli_cleanup_has_barrel_export — index.ts re-exports cleanOutDir + gcAgentRegistry', async () => {
    const content = await readFile(resolve(SRC, 'cli/cleanup/index.ts'), 'utf8')
    expect(content).toMatch(/cleanOutDir/)
    expect(content).toMatch(/gcAgentRegistry/)
  })

  it('test_cli_cleanup_resolves_imports — cleanup.js + cleanup-types.js inside', async () => {
    const entries = await readdir(resolve(SRC, 'cli/cleanup'))
    expect([...entries].sort((a, b) => a.localeCompare(b))).toEqual([
      'cleanup-types.ts',
      'cleanup.ts',
      'index.ts',
    ])
  })

  // EC-7 — inventory drift guard
  it('test_cli_cleanup_files_all_present (EC-7) — same N files as the audit reported (2 source files)', async () => {
    const entries = await readdir(resolve(SRC, 'cli/cleanup'))
    const sourceFiles = entries.filter((e) => e.endsWith('.ts') && e !== 'index.ts')
    expect(sourceFiles.length).toBe(2) // cleanup.ts + cleanup-types.ts
  })
})
