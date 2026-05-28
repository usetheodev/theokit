import { describe, it, expect } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const RULES_PATH = resolve(__dirname, '../../.claude/rules/architecture.md')
const ADR_PATH = resolve(
  __dirname,
  '../../docs/adr/0001-update-architecture-rules-to-current-module-layout.md',
)

// T0.1 (architecture-cleanup plan) — ADR-0001 v3 amendment.
// File name kept as `architecture-rules-v2.test.ts` for git-blame continuity,
// but the assertions target the v3 contract (12 modules + 19 edges).
describe('architecture-rules-v3 (T0.1 / architecture-cleanup)', () => {
  it('test_architecture_rules_file_exists — file exists + non-empty', async () => {
    const s = await stat(RULES_PATH)
    expect(s.isFile()).toBe(true)
    expect(s.size).toBeGreaterThan(0)
  })

  it('test_architecture_rules_has_module_map — "## Module Map (v3" header present', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    expect(content).toMatch(/## Module Map \(v3/)
  })

  it('test_architecture_rules_lists_all_12_modules — all module names in the Module Map', async () => {
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
      'services', // v3 — Wave 2 12th module
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

  it('test_architecture_rules_keeps_core_invariant — core depends on nothing intra-monorepo', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    // v3 clarified: "core depends on nothing intra-monorepo" (external npm allowed).
    expect(content).toMatch(/core\s*(→|depends on)\s*\(?(nothing|none|NOTHING)/i)
  })

  it('test_architecture_rules_removed_stale_v1 — old "@theo/create-theo → standalone" line gone from dep section', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    const depSection = content.match(/## Dependency Direction[\s\S]*?(?=\n## )/)?.[0] ?? ''
    expect(depSection).not.toMatch(/@theo\/create-theo/)
  })

  it('test_architecture_rules_v3_version_header — explicit v3 marker', async () => {
    const content = await readFile(RULES_PATH, 'utf8')
    expect(content).toMatch(/Version 3|v3 —/i)
  })

  it('test_architecture_rules_documents_contracts_exception — core/contracts/ explicit', async () => {
    // T2.2 (architecture-cleanup) added `core/contracts/` as the canonical home
    // for shared client↔server contracts. The rules MUST document the exception.
    const content = await readFile(RULES_PATH, 'utf8')
    expect(content).toMatch(/core\/contracts/)
  })

  // EC-6 — ADR location decision
  it('test_adr_lives_in_canonical_dir (EC-6) — ADR-0001 at docs/adr/, accepted status', async () => {
    const s = await stat(ADR_PATH)
    expect(s.isFile()).toBe(true)
    const content = await readFile(ADR_PATH, 'utf8')
    expect(content).toMatch(/Status:\s*accepted/i)
  })
})
