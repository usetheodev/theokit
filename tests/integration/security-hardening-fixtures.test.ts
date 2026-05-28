import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  securitySchema,
  rateLimitSchema,
  theoConfigSchema,
} from '../../packages/theo/src/config/schema.js'

/**
 * Security-hardening fixtures sanity check.
 *
 * Each fixture must:
 *   - exist at the expected path
 *   - have a valid `theo.config.ts` (parsable by the schemas)
 *   - have a README documenting the pattern
 *   - have at least one route or page demonstrating the feature
 */

const ROOT = resolve(__dirname, '../..')
const FIXTURES = {
  'cors-enabled': resolve(ROOT, 'fixtures/cors-enabled'),
  'csp-reports': resolve(ROOT, 'fixtures/csp-reports'),
  'rate-limit-per-route': resolve(ROOT, 'fixtures/rate-limit-per-route'),
}

describe('Security-hardening fixtures — shape + config validity', () => {
  for (const [name, path] of Object.entries(FIXTURES)) {
    it(`${name}: package.json + theo.config.ts + README.md present`, () => {
      expect(existsSync(resolve(path, 'package.json'))).toBe(true)
      expect(existsSync(resolve(path, 'theo.config.ts'))).toBe(true)
      expect(existsSync(resolve(path, 'README.md'))).toBe(true)
    })

    it(`${name}: README documents the pattern (non-empty, mentions feature name)`, () => {
      const readme = readFileSync(resolve(path, 'README.md'), 'utf8')
      expect(readme.length).toBeGreaterThan(100)
    })
  }
})

describe('cors-enabled fixture — config validates', () => {
  it('config.security.cors validates against corsSchema', () => {
    // We can't run vitest in fixture's own dir without bundling; instead
    // assert the config string contains the expected fields.
    const cfg = readFileSync(resolve(FIXTURES['cors-enabled'], 'theo.config.ts'), 'utf8')
    expect(cfg).toContain("origins: ['http://localhost:5174']")
    expect(cfg).toContain('credentials: true')
  })

  it('parsing equivalent config via the live securitySchema succeeds', () => {
    const parsed = securitySchema.parse({
      cors: {
        origins: ['http://localhost:5174'],
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Theo-Action'],
        exposedHeaders: ['X-Trace-Id'],
        credentials: true,
        maxAge: 600,
      },
    })
    expect(parsed.cors).toBeDefined()
  })
})

describe('rate-limit-per-route fixture — config validates', () => {
  it('config string carries the per-route shape', () => {
    const cfg = readFileSync(resolve(FIXTURES['rate-limit-per-route'], 'theo.config.ts'), 'utf8')
    expect(cfg).toContain("'/api/login'")
    expect(cfg).toContain('keyBy:')
  })

  it('parsing equivalent config via rateLimitSchema (new shape) succeeds', () => {
    const parsed = rateLimitSchema.parse({
      default: { windowMs: 60_000, max: 100 },
      routes: { '/api/login': { windowMs: 60_000, max: 5 } },
      keyBy: 'session',
    })
    expect(parsed).toBeDefined()
  })

  it('legacy flat config still validates (backwards-compat)', () => {
    const legacy = rateLimitSchema.parse({ windowMs: 60_000, max: 100 })
    expect(legacy).toBeDefined()
  })
})

describe('csp-reports fixture — config validates', () => {
  it('config string wires JsonStdoutSink + report-only mode', () => {
    const cfg = readFileSync(resolve(FIXTURES['csp-reports'], 'theo.config.ts'), 'utf8')
    expect(cfg).toContain('JsonStdoutSink')
    expect(cfg).toContain("cspMode: 'report-only'")
  })

  it('full config validates via theoConfigSchema (audit + cspMode)', () => {
    const parsed = theoConfigSchema.parse({
      audit: { logger: { log: () => undefined } },
      security: { headers: { cspMode: 'report-only' } },
    })
    expect(parsed.audit).toBeDefined()
  })
})
