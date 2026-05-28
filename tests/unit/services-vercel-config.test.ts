import { describe, it, expect } from 'vitest'
import {
  buildVercelServicesBlock,
  mergeVercelJson,
} from '../../packages/theo/src/services/index.js'
import type { ServicesManifest } from '../../packages/theo/src/services/index.js'

function pythonService(name: string, port = 8001, proxy = `/api/${name}`) {
  return {
    name,
    runtime: 'python' as const,
    port,
    proxy,
    dev: 'uvicorn main:app',
    start: 'uvicorn main:app --workers 4',
    healthcheck: '/health',
    cors: false,
    passSetCookie: false,
  }
}

function nodeService(name: string, port = 8002, proxy = `/api/${name}`) {
  return {
    name,
    runtime: 'node' as const,
    port,
    proxy,
    dev: 'tsx watch src/index.ts',
    start: 'node dist/index.js',
    healthcheck: '/health',
    cors: false,
    passSetCookie: false,
  }
}

describe('T3.1 — Vercel config builder', () => {
  it('returns null for empty manifest (no change to vercel.json)', () => {
    const m: ServicesManifest = { version: 1, services: [] }
    expect(buildVercelServicesBlock(m)).toBeNull()
  })

  it('returns null for null manifest', () => {
    expect(buildVercelServicesBlock(null)).toBeNull()
  })

  it('emits web + service entries for one python service', () => {
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    const block = buildVercelServicesBlock(m)
    expect(block).not.toBeNull()
    expect(block?.version).toBe(2)
    expect(block?.services).toHaveLength(2)
    expect(block?.services[0]?.name).toBe('web')
    expect(block?.services[1]?.name).toBe('agent')
  })

  it('python entry has excludeFiles for __pycache__ + tests', () => {
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    const block = buildVercelServicesBlock(m)
    const entry = block?.services.find((s) => s.name === 'agent')
    expect(entry?.excludeFiles).toEqual(expect.arrayContaining(['__pycache__/**', 'tests/**']))
  })

  it('node entry has excludeFiles for node_modules', () => {
    const m: ServicesManifest = { version: 1, services: [nodeService('worker')] }
    const block = buildVercelServicesBlock(m)
    const entry = block?.services.find((s) => s.name === 'worker')
    expect(entry?.excludeFiles).toEqual(expect.arrayContaining(['node_modules/**']))
  })

  it('routes contain proxy prefix capture', () => {
    const m: ServicesManifest = {
      version: 1,
      services: [pythonService('agent', 8001, '/api/agent')],
    }
    const block = buildVercelServicesBlock(m)
    const entry = block?.services.find((s) => s.name === 'agent')
    expect(entry?.routes[0]?.src).toBe('/api/agent/(.*)')
  })

  it('handles multiple services', () => {
    const m: ServicesManifest = {
      version: 1,
      services: [pythonService('agent'), nodeService('worker')],
    }
    const block = buildVercelServicesBlock(m)
    expect(block?.services).toHaveLength(3)
  })

  // EC-9 deep-merge
  it('mergeVercelJson preserves user fields (env, headers, crons) — EC-9', () => {
    const existing = {
      env: { FOO: 'bar' },
      headers: [{ source: '/(.*)', headers: [] }],
      crons: [{ path: '/cron', schedule: '0 0 * * *' }],
    }
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    const block = buildVercelServicesBlock(m)
    const merged = mergeVercelJson(existing, block)
    expect(merged.env).toEqual({ FOO: 'bar' })
    expect(merged.headers).toEqual(existing.headers)
    expect(merged.crons).toEqual(existing.crons)
    expect(merged.services).toBeDefined()
  })

  it('mergeVercelJson with null block leaves existing unchanged', () => {
    const existing = { env: { FOO: 'bar' } }
    const merged = mergeVercelJson(existing, null)
    expect(merged).toEqual({ env: { FOO: 'bar' } })
  })

  it('mergeVercelJson services key REPLACES (TheoKit owns this key) — EC-9', () => {
    const existing = { services: [{ name: 'OLD', runtime: 'go' }] }
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    const block = buildVercelServicesBlock(m)
    const merged = mergeVercelJson(existing, block)
    const services = merged.services as Array<{ name: string }>
    // OLD entry should be gone; new entries (web + agent) are present
    expect(services.find((s) => s.name === 'OLD')).toBeUndefined()
    expect(services.find((s) => s.name === 'agent')).toBeDefined()
  })
})
