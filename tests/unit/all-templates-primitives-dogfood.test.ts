import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * theokit-evolution-ci-and-dx Phase 2B (T2B.5) — primitives dogfood parity.
 *
 * Asserts each of the 5 official templates ships at least 1 file demonstrating
 * a 0.5.0 primitive (defineCron / defineJob / defineWebhook / trackAgentRun).
 * Without this gate, primitives shipped framework-side but templates never
 * dogfood the patterns → stranger reads CHANGELOG, opens template, finds
 * no idiomatic example.
 */

const ROOT = resolve(__dirname, '../..')

const EXPECTED: Record<string, { file: string; primitive: string }[]> = {
  default: [{ file: 'server/crons/cleanup-conversations.ts', primitive: 'defineCron' }],
  dashboard: [{ file: 'server/crons/cleanup-conversations.ts', primitive: 'defineCron' }],
  'api-only': [{ file: 'server/routes/webhooks/echo.ts', primitive: 'defineWebhook' }],
  postgres: [{ file: 'server/jobs/log-message.ts', primitive: 'defineJob' }],
  saas: [{ file: 'server/routes/billing/stripe-webhook.ts', primitive: 'defineWebhook' }],
}

describe('templates dogfood 0.5.0 primitives', () => {
  for (const [tpl, files] of Object.entries(EXPECTED)) {
    describe(`template: ${tpl}`, () => {
      for (const { file, primitive } of files) {
        it(`ships ${file} demonstrating ${primitive}`, () => {
          const path = resolve(ROOT, `packages/create-theo/templates/${tpl}/${file}`)
          expect(existsSync(path)).toBe(true)
          const content = readFileSync(path, 'utf-8')
          expect(content).toMatch(new RegExp(`\\b${primitive}\\b`))
          expect(content).toMatch(new RegExp(`from\\s+['"]theokit/server`))
        })
      }
    })
  }

  it('default + dashboard ship byte-identical cleanup-conversations cron', () => {
    const a = readFileSync(
      resolve(ROOT, 'packages/create-theo/templates/default/server/crons/cleanup-conversations.ts'),
      'utf-8',
    )
    const b = readFileSync(
      resolve(
        ROOT,
        'packages/create-theo/templates/dashboard/server/crons/cleanup-conversations.ts',
      ),
      'utf-8',
    )
    expect(a).toBe(b)
  })

  it('saas template wires trackAgentRun in agent route', () => {
    const content = readFileSync(
      resolve(ROOT, 'packages/create-theo/templates/saas/server/routes/agent.ts'),
      'utf-8',
    )
    expect(content).toMatch(/\btrackAgentRun\b/)
    expect(content).toMatch(/from\s+['"]theokit\/server\/cost['"]/)
  })

  it('defineCron handlers use 5-field UTC cron schedule (ADR D4 plano-avô)', () => {
    const cron = readFileSync(
      resolve(ROOT, 'packages/create-theo/templates/default/server/crons/cleanup-conversations.ts'),
      'utf-8',
    )
    // Match "schedule: '<5 fields>'"
    expect(cron).toMatch(/schedule:\s*['"]\S+\s+\S+\s+\S+\s+\S+\s+\S+['"]/)
  })

  it('defineJob handler is async + returns void (ADR D3 transactional outbox)', () => {
    const job = readFileSync(
      resolve(ROOT, 'packages/create-theo/templates/postgres/server/jobs/log-message.ts'),
      'utf-8',
    )
    expect(job).toMatch(/handler:\s*async/)
    // No `return` of value other than void/Promise<void>
    expect(job).not.toMatch(/return\s+(?!\s*$|\}|undefined)/)
  })

  it('defineWebhook handlers use timingSafeEqual (anti-timing-attack)', () => {
    for (const file of [
      'packages/create-theo/templates/api-only/server/routes/webhooks/echo.ts',
      'packages/create-theo/templates/saas/server/routes/billing/stripe-webhook.ts',
    ]) {
      const content = readFileSync(resolve(ROOT, file), 'utf-8')
      expect(content, `${file} must use timingSafeEqual`).toMatch(/timingSafeEqual/)
    }
  })

  it('log-message job uses process.cwd() anchored path (v1.1 EC-9)', () => {
    const job = readFileSync(
      resolve(ROOT, 'packages/create-theo/templates/postgres/server/jobs/log-message.ts'),
      'utf-8',
    )
    expect(job).toMatch(/resolve\(process\.cwd\(\)/)
  })
})
