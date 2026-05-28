import { describe, it, expect } from 'vitest'
import { assertServicesUnsupported } from '../../packages/theo/src/services/index.js'
import type { ServicesManifest } from '../../packages/theo/src/services/index.js'

function pythonService(name: string, port = 8001) {
  return {
    name,
    runtime: 'python' as const,
    port,
    proxy: `/api/${name}`,
    dev: 'uvicorn main:app',
    start: 'uvicorn main:app --workers 4',
    healthcheck: '/health',
    cors: false,
    passSetCookie: false,
  }
}

function nodeService(name: string, port = 8002) {
  return {
    name,
    runtime: 'node' as const,
    port,
    proxy: `/api/${name}`,
    dev: 'tsx watch src/index.ts',
    start: 'node dist/index.js',
    healthcheck: '/health',
    cors: false,
    passSetCookie: false,
  }
}

describe('Wave 2 — assertServicesUnsupported (TheoCloud-first)', () => {
  it('no-op when manifest is null', () => {
    expect(() => {
      assertServicesUnsupported('bun', null)
    }).not.toThrow()
  })

  it('no-op when manifest services array is empty', () => {
    const m: ServicesManifest = { version: 1, services: [] }
    expect(() => {
      assertServicesUnsupported('bun', m)
    }).not.toThrow()
  })

  it('throws when manifest has any services (named adapter in error)', () => {
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    expect(() => {
      assertServicesUnsupported('bun', m)
    }).toThrow(/bun/i)
    expect(() => {
      assertServicesUnsupported('bun', m)
    }).toThrow(/agent/)
  })

  it('error message lists supported alternatives (node + theo-cloud)', () => {
    const m: ServicesManifest = { version: 1, services: [nodeService('worker')] }
    try {
      assertServicesUnsupported('netlify', m)
      throw new Error('should have thrown')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toContain('node')
      expect(msg).toContain('theo-cloud')
      expect(msg.toLowerCase()).toContain('wave 3')
    }
  })

  it('error message points at theokit build --target node for local validation', () => {
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    try {
      assertServicesUnsupported('vercel', m)
      throw new Error('should have thrown')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toContain('--target node')
    }
  })

  it('does NOT mention specific runtime rejection logic (no Python/Node split — generic rejection)', () => {
    // In Wave 2, the rejection is uniform regardless of runtime kind.
    // The previous T3.2 'Cloudflare-rejects-Python-but-allows-Node' logic
    // is REMOVED per 2026-05-27 owner decision (TheoCloud-first focus).
    const mPython: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    const mNode: ServicesManifest = { version: 1, services: [nodeService('worker')] }
    expect(() => {
      assertServicesUnsupported('cloudflare', mPython)
    }).toThrow()
    expect(() => {
      assertServicesUnsupported('cloudflare', mNode)
    }).toThrow()
  })
})
