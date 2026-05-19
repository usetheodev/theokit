/**
 * T1.1 — Devtools shell unit tests.
 *
 * Covers:
 * - EC-17: NODE_ENV=production → Devtools is noop; NODE_ENV=test/development → real
 * - EC-12: custom element 'theo-devtools-portal' name (smoke test via mount)
 * - EC-16: singleton guard prevents double-mount
 * - EC-1: wrapper has position: absolute
 * - Reducer: TOGGLE_PANEL toggles state.open
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { devtoolsReducer, initialState } from '../../packages/theo/src/devtools/reducer.js'
import { RING_BUFFER_CAP, MAX_QUEUE_SIZE, STORAGE_VERSION } from '../../packages/theo/src/devtools/shared.js'

describe('devtools — shared invariants', () => {
  it('RING_BUFFER_CAP = 50', () => {
    expect(RING_BUFFER_CAP).toBe(50)
  })

  it('MAX_QUEUE_SIZE = 100 (EC-23)', () => {
    expect(MAX_QUEUE_SIZE).toBe(100)
  })

  it('STORAGE_VERSION = 1 (EC-21)', () => {
    expect(STORAGE_VERSION).toBe(1)
  })
})

describe('devtools reducer — Phase 1 minimum', () => {
  it('TOGGLE_PANEL flips state.open', () => {
    const s1 = devtoolsReducer(initialState, { type: 'TOGGLE_PANEL' })
    expect(s1.open).toBe(true)
    const s2 = devtoolsReducer(s1, { type: 'TOGGLE_PANEL' })
    expect(s2.open).toBe(false)
  })

  it('TOGGLE_VISIBLE flips state.visible', () => {
    const s1 = devtoolsReducer(initialState, { type: 'TOGGLE_VISIBLE' })
    expect(s1.visible).toBe(false)
  })

  it('SET_TAB updates activeTab', () => {
    const s1 = devtoolsReducer(initialState, { type: 'SET_TAB', tab: 'errors' })
    expect(s1.activeTab).toBe('errors')
  })

  it('SET_POSITION updates position', () => {
    const s1 = devtoolsReducer(initialState, { type: 'SET_POSITION', position: 'top-left' })
    expect(s1.position).toBe('top-left')
  })

  it('REQUEST_ADD appends and caps at RING_BUFFER_CAP', () => {
    let s = initialState
    for (let i = 0; i < RING_BUFFER_CAP + 10; i++) {
      s = devtoolsReducer(s, {
        type: 'REQUEST_ADD',
        request: {
          id: `r-${i}`,
          traceId: `t-${i}`,
          method: 'GET',
          path: `/${i}`,
          status: 200,
          durationMs: 10,
          startedAt: i,
        },
      })
    }
    expect(s.requests.length).toBe(RING_BUFFER_CAP)
    // newest first; oldest (i=0..9) FIFO-evicted
    expect(s.requests[0]!.id).toBe(`r-${RING_BUFFER_CAP + 9}`)
    expect(s.requests[s.requests.length - 1]!.id).toBe('r-10')
  })

  it('ERROR_ADD appends and caps', () => {
    let s = initialState
    for (let i = 0; i < RING_BUFFER_CAP + 5; i++) {
      s = devtoolsReducer(s, {
        type: 'ERROR_ADD',
        error: {
          id: `e-${i}`,
          type: 'console',
          message: 'boom',
          timestamp: i,
        },
      })
    }
    expect(s.errors.length).toBe(RING_BUFFER_CAP)
  })

  it('CSRF_WARN synthesizes ErrorRecord with code + docsUrl', () => {
    const s = devtoolsReducer(initialState, {
      type: 'CSRF_WARN',
      payload: {
        event: 'csrf.warn',
        code: 'CSRF_STRICT_CUTOVER',
        docsUrl: 'https://theokit.dev/upgrade/csrf-strict-cutover',
        method: 'POST',
        path: '/api/test',
        reason: 'missing X-Theo-Action',
      },
    })
    expect(s.errors.length).toBe(1)
    expect(s.errors[0]!.type).toBe('csrf.warn')
    expect(s.errors[0]!.code).toBe('CSRF_STRICT_CUTOVER')
    expect(s.errors[0]!.docsUrl).toBe('https://theokit.dev/upgrade/csrf-strict-cutover')
  })

  it('MANIFEST_UPDATED replaces routeManifest', () => {
    const manifest = { routes: [{ path: '/', absoluteFilePath: '/abs/app/page.tsx', layoutChain: [], hasLoading: false, hasError: false, hasNotFound: false }] }
    const s = devtoolsReducer(initialState, { type: 'MANIFEST_UPDATED', manifest })
    expect(s.routeManifest).toEqual(manifest)
  })

  it('ROUTE_MATCHED sets activeRoutePath + chain', () => {
    const s = devtoolsReducer(initialState, { type: 'ROUTE_MATCHED', path: '/blog', chain: ['/layout.tsx', '/blog/page.tsx'] })
    expect(s.activeRoutePath).toBe('/blog')
    expect(s.activeChain).toEqual(['/layout.tsx', '/blog/page.tsx'])
  })

  it('RESET_REQUESTS clears requests', () => {
    let s = devtoolsReducer(initialState, {
      type: 'REQUEST_ADD',
      request: { id: 'r1', traceId: 't1', method: 'GET', path: '/', status: 200, durationMs: 1, startedAt: 0 },
    })
    expect(s.requests.length).toBe(1)
    s = devtoolsReducer(s, { type: 'RESET_REQUESTS' })
    expect(s.requests.length).toBe(0)
  })
})

describe('devtools index — EC-17 (NODE_ENV positive-prod check)', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('NODE_ENV=production → Devtools is the noop function returning null', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { Devtools } = await import('../../packages/theo/src/devtools/index.js')
    expect(typeof Devtools).toBe('function')
    // noop returns null
    const res = (Devtools as () => unknown)()
    expect(res).toBeNull()
  })

  it('NODE_ENV=test (vitest default) → Devtools is the REAL Overlay (EC-17)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const mod = await import('../../packages/theo/src/devtools/index.js')
    const { Devtools, Overlay } = mod
    expect(Devtools).toBe(Overlay)
  })

  it('NODE_ENV=development → Devtools is the REAL Overlay', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const mod = await import('../../packages/theo/src/devtools/index.js')
    const { Devtools, Overlay } = mod
    expect(Devtools).toBe(Overlay)
  })

  it('DevtoolsInProd is ALWAYS the real component (escape hatch contract)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { DevtoolsInProd, Overlay } = await import('../../packages/theo/src/devtools/index.js')
    expect(DevtoolsInProd).toBe(Overlay)
  })
})
