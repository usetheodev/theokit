import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADR_PATH = resolve(__dirname, '../../docs/adr/0010-db0-adoption-for-sql-non-postgres.md')

describe('ADR-0010 — db0 adoption for SQL non-Postgres', () => {
  it('exists with MADR sections (happy path)', () => {
    expect(existsSync(ADR_PATH)).toBe(true)
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toContain('# 0010.')
    expect(content).toContain('Status: accepted')
    expect(content).toContain('## Decision')
    expect(content).toContain('## Considered Alternatives')
    expect(content).toContain('## Consequences')
  })

  it('preserves usePostgres for Postgres (validation error)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/usePostgres/)
    expect(content).toMatch(/preserve|unchanged|preferred|primary/i)
  })

  it('rejects replacing usePostgres in alternatives (edge case)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/Rejected because/i)
    expect(content).toMatch(/Replace `usePostgres`|Breaking change/)
  })

  it('documents decision tree (Postgres → usePostgres; rest → useDatabase) (error scenario)', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/PostgreSQL.*usePostgres/s)
    expect(content).toMatch(/libSQL|D1|MySQL|SQLite/)
    expect(content).toMatch(/useDatabase/)
  })

  it('declares D3 decision', () => {
    const content = readFileSync(ADR_PATH, 'utf8')
    expect(content).toMatch(/### D3/)
  })
})
