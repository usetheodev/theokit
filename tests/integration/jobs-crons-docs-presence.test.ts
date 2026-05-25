import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DOCS = resolve(__dirname, '../../docs/concepts')

const read = (name: string): string => readFileSync(resolve(DOCS, name), 'utf8')

describe('concept docs (T6.3)', () => {
  it('crons.md mentions defineCron', () => {
    expect(read('crons.md')).toMatch(/defineCron/)
  })

  it('crons.md has "Local development limitations" section (EC-111)', () => {
    expect(read('crons.md')).toMatch(/Local development limitations/i)
  })

  it('jobs.md has "TypeScript JobRegistry setup" + JobRegistry + never (EC-110)', () => {
    const content = read('jobs.md')
    expect(content).toMatch(/JobRegistry/)
    expect(content).toMatch(/declare module 'theokit\/server'/)
    expect(content).toMatch(/never/)
  })

  it('jobs.md has "I want to chain steps" section (ADR-0003 rationale)', () => {
    expect(read('jobs.md')).toMatch(/I want to chain steps/i)
  })

  it('jobs.md has "Adapter limitations" mentioning Cloudflare Workers (EC-112)', () => {
    const content = read('jobs.md')
    expect(content).toMatch(/Adapter limitations/i)
    expect(content).toMatch(/Cloudflare Workers/i)
  })

  it('jobs.md has "Local development limitations" (EC-111)', () => {
    expect(read('jobs.md')).toMatch(/Local development limitations/i)
  })

  it('webhooks.md shows custom verify template', () => {
    const content = read('webhooks.md')
    expect(content).toMatch(/Custom verify template/i)
    expect(content).toMatch(/timingSafeEqual/)
  })

  it('webhooks.md has "Body size limits" with maxBodyBytes + 1MB + 25MB (EC-101)', () => {
    const content = read('webhooks.md')
    expect(content).toMatch(/Body size limits/i)
    expect(content).toMatch(/maxBodyBytes/)
    expect(content).toMatch(/1MB/)
    expect(content).toMatch(/25_?000_?000|25MB/)
  })

  it('webhooks.md has "Verify failures" section (EC-103)', () => {
    expect(read('webhooks.md')).toMatch(/Verify failures/i)
    expect(read('webhooks.md')).toMatch(/verify threw/i)
  })

  it('webhooks.md warns about gzip proxy (EC-113)', () => {
    const content = read('webhooks.md')
    expect(content).toMatch(/Proxy.*compression/i)
    expect(content).toMatch(/gzip/i)
  })

  it('cost-tracking.md has "Production storage" recommendation (EC-114)', () => {
    const content = read('cost-tracking.md')
    expect(content).toMatch(/Production storage/i)
    expect(content).toMatch(/InMemoryUsageStorage/)
    expect(content).toMatch(/Postgres|Redis/i)
  })
})
