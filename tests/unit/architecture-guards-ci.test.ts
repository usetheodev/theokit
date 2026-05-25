import { describe, it, expect } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const REPO = resolve(__dirname, '../..')

describe('architecture-guards CI (T1.1)', () => {
  it('test_dependency_cruiser_config_present — .dependency-cruiser.cjs exists', async () => {
    const s = await stat(resolve(REPO, '.dependency-cruiser.cjs'))
    expect(s.isFile()).toBe(true)
  })

  it('test_ls_lint_config_present — .ls-lint.yml exists', async () => {
    const s = await stat(resolve(REPO, '.ls-lint.yml'))
    expect(s.isFile()).toBe(true)
  })

  it('test_ci_workflow_present — .github/workflows/architecture-guards.yml exists', async () => {
    const s = await stat(resolve(REPO, '.github/workflows/architecture-guards.yml'))
    expect(s.isFile()).toBe(true)
  })

  it('test_check_deps_script — package.json has scripts.check:deps', async () => {
    const pkg = JSON.parse(await readFile(resolve(REPO, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['check:deps']).toBeDefined()
    expect(pkg.scripts['check:deps']).toMatch(/dependency-cruiser/)
  })

  it('test_check_naming_script — package.json has scripts.check:naming', async () => {
    const pkg = JSON.parse(await readFile(resolve(REPO, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['check:naming']).toBeDefined()
    expect(pkg.scripts['check:naming']).toMatch(/ls-lint/)
  })

  // EC-2 baseline: run dep-cruiser + ls-lint directly. Both can take ≥5s on
  // first run (CLI bootstrap + node binary scan); per-test timeout = 30s.
  // Binaries invoked via explicit relative path (node_modules/.bin), not PATH.
  it('test_check_deps_passes_today — current source has 0 dep violations', () => {
    const stdout = execSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      'node_modules/.bin/dependency-cruiser packages/theo/src --config .dependency-cruiser.cjs --no-progress',
      { cwd: REPO, encoding: 'utf8' },
    )
    expect(stdout).toMatch(/no dependency violations found/)
  }, 30_000)

  it('test_check_naming_passes_today — current source has 0 naming violations', () => {
    expect(() => {
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- explicit relative path
      execSync('node_modules/.bin/ls-lint', { cwd: REPO, stdio: 'pipe' })
    }).not.toThrow()
  }, 30_000)

  it('test_dep_cruiser_config_has_no_circular_rule', async () => {
    const content = await readFile(resolve(REPO, '.dependency-cruiser.cjs'), 'utf8')
    expect(content).toMatch(/no-circular/)
    expect(content).toMatch(/severity:\s*['"]error['"]/)
  })

  it('test_dep_cruiser_config_has_core_invariant', async () => {
    const content = await readFile(resolve(REPO, '.dependency-cruiser.cjs'), 'utf8')
    expect(content).toMatch(/core-depends-on-nothing/)
  })

  // EC-2 — baseline must pass before strict CI is enabled (covered by
  // test_check_deps_passes_today above; kept as a tagged duplicate for the
  // EC traceability matrix).
  it('test_dep_cruiser_baseline_passes (EC-2) — config matches reality', () => {
    const stdout = execSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      'node_modules/.bin/dependency-cruiser packages/theo/src --config .dependency-cruiser.cjs --no-progress',
      { cwd: REPO, encoding: 'utf8' },
    )
    expect(stdout).toMatch(/no dependency violations found/)
  }, 30_000)

  // EC-8 — ls-lint regex syntax handles React hook pattern
  it('test_ls_lint_accepts_react_hook_naming (EC-8) — useFoo.ts is allowed', async () => {
    // The config under packages/theo/src already has hooks like
    // `client/use-agent-stream.ts` — kebab-case (allowed). Verify camelCase
    // hooks (`useDrag.ts` pattern) would also be allowed via the regex.
    const cfg = await readFile(resolve(REPO, '.ls-lint.yml'), 'utf8')
    expect(cfg).toMatch(/use\[A-Z\]\[A-Za-z0-9\]\*/)
  })
})
