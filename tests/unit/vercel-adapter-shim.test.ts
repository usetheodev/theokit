import { describe, it, expect } from 'vitest'
import {
  vercelAdapter,
  renderVercelFunctionEntry,
  renderVercelConfigJson,
  renderVercelVcConfigJson,
} from '../../packages/theo/src/adapters/vercel.js'

describe('vercel adapter — shape', () => {
  it('exposes the DeployAdapter contract', () => {
    expect(vercelAdapter.name).toBe('vercel')
    expect(typeof vercelAdapter.build).toBe('function')
  })
})

describe('renderVercelFunctionEntry — template (T2.2)', () => {
  it('imports from theokit/adapters/web-shim', () => {
    const out = renderVercelFunctionEntry()
    expect(out).toContain("from 'theokit/adapters/web-shim'")
  })

  it('imports execute pipeline from theokit/server (not internal theo-server path)', () => {
    const out = renderVercelFunctionEntry()
    expect(out).toContain("from 'theokit/server'")
    expect(out).not.toContain("'./theo-server/")
  })

  it('exports a default handler function', () => {
    const out = renderVercelFunctionEntry()
    expect(out).toContain('export default')
  })

  it('caches routes at cold start', () => {
    const out = renderVercelFunctionEntry()
    expect(out).toMatch(/routesCache|let.+routes/)
  })

  it('does NOT contain inline string-template shim definitions', () => {
    const out = renderVercelFunctionEntry()
    expect(out).not.toMatch(/socket: \{ remoteAddress/)
    expect(out).not.toMatch(/_headers: \{\}/)
  })
})

describe('renderVercelConfigJson — routing rules', () => {
  it('preserves /api/* → function and filesystem fallback', () => {
    const cfg = renderVercelConfigJson()
    expect(cfg.version).toBe(3)
    expect(cfg.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/api/(.*)' }),
      ]),
    )
  })
})

describe('renderVercelVcConfigJson — function metadata', () => {
  it('emits nodejs runtime + handler entry', () => {
    const vc = renderVercelVcConfigJson()
    expect(vc.runtime).toMatch(/nodejs/)
    expect(vc.handler).toBe('index.mjs')
  })
})
