import { describe, it, expect } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const RULES_PATH = resolve(__dirname, '../../.claude/rules/architecture.md')
const ADR_PATH = resolve(
  __dirname,
  '../../docs/adr/0001-update-architecture-rules-to-current-module-layout.md',
)

describe('architecture-rules-v2 (T0.1)', () => {
  it('test_architecture_rules_file_exists — file exists + non-empty', async () => {
    const s = await stat(RULES_PATH)
    expect(s.isFile()).toBe(true)
    expect(s.size).toBeGreaterThan(0)
  })

  it('test_architecture_rules_has_module_map — "## Module Map (v2)" header present', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    expect(content).toMatch(/## Module Map \(v2/)
  })

  it('test_architecture_rules_lists_all_11_modules — all module names in the Module Map', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    const modules = [
      'core',
      'config',
      'adapters',
      'router',
      'client',
      'react-query',
      'cache',
      'devtools',
      'server',
      'vite-plugin',
      'cli',
    ]
    for (const m of modules) {
      // Each module name appears in the Module Map table as `module/`
      expect(content, `module "${m}/" missing`).toMatch(new RegExp(`\\b${m.replace(/-/g, '-')}/`))
    }
  })

  it('test_architecture_rules_keeps_acyclic_invariant — ADP explicit', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    expect(content).toMatch(/Acyclic Dependencies Principle|0 cycles|Zero cycles/i)
  })

  it('test_architecture_rules_keeps_core_invariant — core depends on nothing', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    // Match phrases like "core depends on NOTHING", "core → (nothing)", "core NEVER depends"
    expect(content).toMatch(/core\s*(→|depends on)\s*\(?(nothing|none|NOTHING)/i)
  })

  it('test_architecture_rules_removed_stale_v1 — old "@theo/create-theo → standalone" line gone from dep section', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    // The old line "@theo/create-theo   → (nothing — standalone)" should not appear in the dep direction section.
    // The new doc mentions create-theo only under "Standalone packages (outside this graph)".
    const depSection = content.match(/## Dependency Direction[\s\S]*?(?=\n## )/)?.[0] ?? ''
    expect(depSection).not.toMatch(/@theo\/create-theo/)
  })

  it('test_architecture_rules_v2_version_header — explicit v2 marker', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    expect(content).toMatch(/Version 2|v2 —/i)
  })

  // EC-6 — ADR location decision
  it('test_adr_lives_in_canonical_dir (EC-6) — ADR-0001 at docs/adr/, accepted status', async () => {
    const s = await stat(ADR_PATH)
    expect(s.isFile()).toBe(true)
    const content = await readFile(ADR_PATH, 'utf8')
    expect(content).toMatch(/Status:\s*accepted/i)
  })
})
