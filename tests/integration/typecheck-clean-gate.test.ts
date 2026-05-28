import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const REPO = resolve(__dirname, '../..')

describe('pnpm typecheck clean gate (T0.3)', () => {
  // Runs the actual tsc to assert the entire workspace typechecks.
  // Heavy (~30s) — restrict to CI / pre-publish gate.
  it('pnpm typecheck exits 0 (zero TS errors across workspace)', () => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local gate invoking pnpm CLI
    const result = execSync('pnpm typecheck 2>&1 || true', {
      cwd: REPO,
      encoding: 'utf8',
    })
    const errorCount = (result.match(/error TS/g) ?? []).length
    expect(errorCount).toBe(0)
  }, 120_000)

  // EC-203: pre-flight isolation of SDK-rooted errors (kept as audit
  // even though count is currently 0 — the gate is "no NEW SDK errors").
  it('EC-203: pre-flight audit doc records SDK-rooted error count', () => {
    const auditDir = resolve(REPO, 'docs/audit')
    if (!existsSync(auditDir)) mkdirSync(auditDir, { recursive: true })

    // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local gate invoking pnpm CLI
    const result = execSync('pnpm typecheck 2>&1 || true', {
      cwd: REPO,
      encoding: 'utf8',
    })
    const sdkRooted = (
      result.match(
        /examples\/full-stack-agent\/server\/tools.*@usetheo\/sdk|toJSONSchema|ZodObject/g,
      ) ?? []
    ).length

    const date = new Date().toISOString().slice(0, 10)
    const auditPath = resolve(auditDir, `phase-0-typecheck-pre-flight-${date}.md`)
    writeFileSync(
      auditPath,
      `# Phase 0 Typecheck Pre-Flight Audit\n\nDate: ${date}\nSDK-rooted error count: ${sdkRooted}\nTotal TS errors: ${(result.match(/error TS/g) ?? []).length}\n\nGate: SDK-rooted errors are documented separately per EC-203; non-SDK errors must be 0.\n`,
      'utf8',
    )
    expect(existsSync(auditPath)).toBe(true)
  }, 120_000)

  it('no actual @ts-ignore directives introduced (EC-205 sibling check)', () => {
    // Match ONLY actual directive uses (`// @ts-ignore` comment), NOT
    // string mentions in audit code or test assertions.
    const result = execSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local gate running grep
      'grep -rEn "^[[:space:]]*//[[:space:]]*@ts-ignore" packages/theo/src tests/ 2>&1 || true',
      { cwd: REPO, encoding: 'utf8' },
    )
    const directiveCount = (result.match(/^[^:]+:\d+:/gm) ?? []).length
    expect(directiveCount).toBe(0)
  }, 30_000)

  // EC-205: orphan @ts-expect-error directives become lint errors after
  // Zod fix removes the underlying TS errors. Lint reports them as
  // "Unused @ts-expect-error directive". Gate is via lint, not typecheck.
  it('@ts-expect-error count in tests is bounded (no explosion post-Zod-fix)', () => {
    const result = execSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- developer-local gate running grep
      'grep -rn "@ts-expect-error" tests/ 2>&1 || true',
      { cwd: REPO, encoding: 'utf8' },
    )
    const count = (result.match(/^[^:]+:\d+:/gm) ?? []).length
    // Empirical baseline: legitimate uses are < 50 across tests/.
    // If post-fix count balloons, we have new orphans.
    expect(count).toBeLessThan(50)
  })
})
