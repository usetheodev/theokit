import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * T4.2 (v1.1 EC-5 SHOULD TEST) — Sanity-grep CI workflow files.
 *
 * Defends two invariants:
 *
 * 1. The "Rebuild native bindings" step exists in every workflow that runs
 *    tests (defense in depth — preflight in vitest setup is the first line;
 *    CI explicit rebuild is the second).
 *
 * 2. The test steps that follow MUST NOT have `|| exit 0` or `|| true`
 *    swallowing — combined with a silent rebuild failure, that would create
 *    a "green CI on broken bindings" silent failure mode. The rebuild step
 *    itself MAY swallow (preflight surfaces the real error at test time),
 *    but the test invocation must propagate failures.
 */

const WORKFLOWS_DIR = resolve(__dirname, '../../.github/workflows')

interface WorkflowFile {
  name: string
  content: string
  runsTests: boolean
}

function loadWorkflows(): WorkflowFile[] {
  const out: WorkflowFile[] = []
  for (const name of readdirSync(WORKFLOWS_DIR)) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue
    const full = join(WORKFLOWS_DIR, name)
    if (!statSync(full).isFile()) continue
    const content = readFileSync(full, 'utf8')
    const runsTests = /\bpnpm\s+(test|vitest|exec\s+vitest|test:coverage|test:types|test:e2e)\b/.test(
      content,
    )
    out.push({ name, content, runsTests })
  }
  return out
}

describe('CI workflows — native bindings rebuild step (T4.2, EC-5)', () => {
  it('discovers at least 2 workflow files', () => {
    expect(loadWorkflows().length).toBeGreaterThanOrEqual(2)
  })

  it('every workflow that runs tests also runs the native-bindings rebuild step', () => {
    const offenders = loadWorkflows().filter(
      (w) => w.runsTests && !/pnpm\s+rebuild\s+better-sqlite3/.test(w.content),
    )
    if (offenders.length > 0) {
      const list = offenders.map((o) => `  - ${o.name}`).join('\n')
      throw new Error(
        `Found ${offenders.length} workflow(s) that run tests but skip the native bindings rebuild step:\n${list}\n\nAdd the step before \`pnpm test\` per dogfood-regressions-fix-plan v1.1 T4.2.`,
      )
    }
    expect(offenders.length).toBe(0)
  })

  it('test-runner lines do NOT have `|| exit 0` or `|| true` swallowing the result', () => {
    // Per EC-5: rebuild step MAY swallow (preflight surfaces real error
    // at test time), but the test step itself MUST propagate failures.
    const swallowers: Array<{ name: string; line: string }> = []
    for (const w of loadWorkflows()) {
      const lines = w.content.split('\n')
      for (const line of lines) {
        const isTestRunner = /\bpnpm\s+(test|vitest|exec\s+vitest|test:coverage|test:types|test:e2e)\b/.test(
          line,
        )
        if (!isTestRunner) continue
        if (/\bpnpm\s+rebuild\b/.test(line)) continue // exempt the rebuild step
        if (/\|\|\s*(exit\s+0|true)\b/.test(line)) {
          swallowers.push({ name: w.name, line: line.trim() })
        }
      }
    }
    if (swallowers.length > 0) {
      const list = swallowers
        .map((s) => `  - ${s.name}: ${s.line}`)
        .join('\n')
      throw new Error(
        `Found ${swallowers.length} test-step line(s) with \`|| exit 0\` / \`|| true\` swallowing failures:\n${list}\n\nThis can mask broken tests when paired with a silent rebuild failure (EC-5).`,
      )
    }
    expect(swallowers.length).toBe(0)
  })
})
