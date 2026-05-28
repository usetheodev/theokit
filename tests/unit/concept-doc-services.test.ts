import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../..')

function readDoc(rel: string): string {
  const p = resolve(REPO_ROOT, rel)
  if (!existsSync(p)) throw new Error(`doc missing: ${rel}`)
  return readFileSync(p, 'utf-8')
}

describe('T5.2 — docs/concepts/services.md', () => {
  it('file exists', () => {
    expect(existsSync(resolve(REPO_ROOT, 'docs/concepts/services.md'))).toBe(true)
  })

  it('contains a Decision matrix', () => {
    const doc = readDoc('docs/concepts/services.md')
    expect(doc.toLowerCase()).toMatch(/decision matrix|when to use a sidecar/i)
  })

  it('contains a Quick start with create-theokit + --backend', () => {
    const doc = readDoc('docs/concepts/services.md')
    expect(doc).toContain('create-theokit')
    expect(doc).toContain('--backend')
  })

  it('documents services config fields', () => {
    const doc = readDoc('docs/concepts/services.md')
    expect(doc).toContain('runtime')
    expect(doc).toContain('port')
    expect(doc).toContain('proxy')
    expect(doc).toContain('healthcheck')
    expect(doc).toContain('openapi')
  })

  it('references the Like-Vercel contract invariants', () => {
    const doc = readDoc('docs/concepts/services.md')
    expect(doc).toMatch(/Like-Vercel/i)
    expect(doc).toMatch(/invariant/i)
  })

  it('has adapter compatibility matrix (TheoCloud-first per 2026-05-27)', () => {
    const doc = readDoc('docs/concepts/services.md')
    expect(doc).toContain('node')
    expect(doc).toContain('theo-cloud')
    // Vercel/Cloudflare/etc. are listed as rejecting `services: {}` non-empty,
    // but they remain first-class TS-app deploy targets.
    expect(doc).toContain('vercel')
    expect(doc).toContain('cloudflare')
    expect(doc).toMatch(/TheoCloud-first/i)
  })

  it('links to the migration doc', () => {
    const doc = readDoc('docs/concepts/services.md')
    expect(doc).toContain('from-theo-stacks-to-create-theokit')
  })

  it('has Troubleshooting section', () => {
    const doc = readDoc('docs/concepts/services.md')
    expect(doc).toMatch(/troubleshooting/i)
  })
})

describe('T5.3 — docs/concepts/services-runtime-contract.md', () => {
  it('file exists', () => {
    expect(existsSync(resolve(REPO_ROOT, 'docs/concepts/services-runtime-contract.md'))).toBe(true)
  })

  it('lists all 6 invariants', () => {
    const doc = readDoc('docs/concepts/services-runtime-contract.md')
    // headings or numbered items for each invariant
    expect(doc).toMatch(/Invariant 1.*fetch handler/i)
    expect(doc).toMatch(/Invariant 2.*build-time/i)
    expect(doc).toMatch(/Invariant 3.*[Ee]nvironment.*runtime/)
    expect(doc).toMatch(/Invariant 4.*[Hh]ealthcheck/)
    expect(doc).toMatch(/Invariant 5.*[Ll]ogs.*stdout/)
    expect(doc).toMatch(/Invariant 6.*[Tt]race [Cc]ontext/)
  })

  it('has Python example per invariant', () => {
    const doc = readDoc('docs/concepts/services-runtime-contract.md')
    expect(doc).toContain('FastAPI')
    expect(doc).toContain('uvicorn')
    expect(doc).toContain('JsonFormatter')
  })

  it('has Node example per invariant', () => {
    const doc = readDoc('docs/concepts/services-runtime-contract.md')
    expect(doc).toContain('Hono')
    expect(doc).toContain('app.fetch')
  })

  it('references W3C traceparent and Caddy 2.11', () => {
    const doc = readDoc('docs/concepts/services-runtime-contract.md')
    expect(doc).toContain('traceparent')
    expect(doc).toMatch(/Caddy 2\.11/)
  })

  it('shows local harness walkthrough with docker-compose', () => {
    const doc = readDoc('docs/concepts/services-runtime-contract.md')
    expect(doc).toMatch(/docker-compose/i)
  })
})

describe('migration doc', () => {
  it('file exists', () => {
    expect(
      existsSync(resolve(REPO_ROOT, 'docs/migration/from-theo-stacks-to-create-theokit.md')),
    ).toBe(true)
  })

  it('covers python migration path', () => {
    const doc = readDoc('docs/migration/from-theo-stacks-to-create-theokit.md')
    expect(doc).toMatch(/python-fastapi.*--backend python/i)
  })

  it('documents Hono replacing Express/Fastify', () => {
    const doc = readDoc('docs/migration/from-theo-stacks-to-create-theokit.md')
    expect(doc).toContain('Hono')
    expect(doc).toContain('Express')
    expect(doc).toContain('Fastify')
  })

  it('lists archived languages', () => {
    const doc = readDoc('docs/migration/from-theo-stacks-to-create-theokit.md')
    expect(doc).toMatch(/archived|archive/i)
    expect(doc).toContain('Go')
    expect(doc).toContain('Rust')
    expect(doc).toContain('Java')
    expect(doc).toContain('Ruby')
    expect(doc).toContain('PHP')
  })
})
