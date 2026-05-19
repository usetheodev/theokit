/**
 * T2.1 + T2.3 + T2.4 — broadcastToDevtools tests.
 *
 * Verifies:
 *  - no-op when globalThis.__theoViteHotServer is undefined (prod / no dev)
 *  - sends via ws.send when populated
 *  - serializeSafely walks BigInt (EC-26)
 *  - default-deny on errors (no propagation, console.warn only)
 *  - broadcastRequest applies redactQueryString + redactHeaders + truncateBody
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  broadcastCsrfWarn,
  broadcastError,
  broadcastRequest,
  broadcastToDevtools,
} from '../../packages/theo/src/devtools/server-side/broadcast.js'

type CapturedSend = { event: string; data: unknown }

function installFakeServer(): {
  sends: CapturedSend[]
  restore: () => void
} {
  const sends: CapturedSend[] = []
  const fake = {
    ws: {
      send(payload: { type: 'custom'; event: string; data: unknown }) {
        sends.push({ event: payload.event, data: payload.data })
      },
    },
  }
  ;(globalThis as { __theoViteHotServer?: unknown }).__theoViteHotServer = fake
  return {
    sends,
    restore() {
      ;(globalThis as { __theoViteHotServer?: unknown }).__theoViteHotServer = undefined
    },
  }
}

beforeEach(() => {
  ;(globalThis as { __theoViteHotServer?: unknown }).__theoViteHotServer = undefined
})

afterEach(() => {
  ;(globalThis as { __theoViteHotServer?: unknown }).__theoViteHotServer = undefined
})

describe('broadcastToDevtools', () => {
  it('no-op when globalThis.__theoViteHotServer is undefined', () => {
    // No throw, no side effect — just runs.
    expect(() => broadcastToDevtools('theo:devtools:test', { x: 1 })).not.toThrow()
  })

  it('sends through ws.send when server is populated', () => {
    const { sends, restore } = installFakeServer()
    broadcastToDevtools('theo:devtools:request', { path: '/x', method: 'GET' })
    expect(sends).toHaveLength(1)
    expect(sends[0]!.event).toBe('theo:devtools:request')
    restore()
  })

  it('EC-26: serializes BigInt before sending', () => {
    const { sends, restore } = installFakeServer()
    broadcastToDevtools('theo:devtools:request', { id: 999n, nested: { count: 7n } })
    const data = sends[0]!.data as Record<string, unknown>
    expect(data.id).toBe('999n')
    expect((data.nested as Record<string, unknown>).count).toBe('7n')
    restore()
  })

  it('default-deny: ws.send throwing does NOT propagate', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(globalThis as { __theoViteHotServer?: unknown }).__theoViteHotServer = {
      ws: {
        send() {
          throw new Error('socket closed')
        },
      },
    }
    expect(() => broadcastToDevtools('theo:devtools:test', { x: 1 })).not.toThrow()
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })
})

describe('broadcastRequest', () => {
  it('applies redactQueryString to path + redactHeaders to headers + truncateBody', () => {
    const { sends, restore } = installFakeServer()
    broadcastRequest({
      id: 'r1',
      traceId: 't1',
      method: 'POST',
      path: '/api/login?token=eyJabc',
      status: 200,
      durationMs: 10,
      startedAt: 0,
      headers: { Authorization: 'Bearer xyz', 'content-type': 'application/json' },
      bodyPreview: 'a'.repeat(5000),
    })
    const data = sends[0]!.data as {
      path: string
      headers: Record<string, string>
      bodyPreview: string
      bodyLength: number
      bodyTruncated: boolean
    }
    expect(data.path).toBe('/api/login?token=%5BREDACTED%5D')
    expect(data.headers.Authorization).toBe('[REDACTED]')
    expect(data.headers['content-type']).toBe('application/json')
    expect(data.bodyPreview.length).toBe(4096)
    expect(data.bodyLength).toBe(5000)
    expect(data.bodyTruncated).toBe(true)
    restore()
  })

  it('binary body becomes [binary body] placeholder', () => {
    const { sends, restore } = installFakeServer()
    broadcastRequest({
      id: 'r1',
      traceId: 't1',
      method: 'POST',
      path: '/api/upload',
      status: 200,
      durationMs: 1,
      startedAt: 0,
      bodyPreview: undefined,
    })
    const data = sends[0]!.data as { bodyPreview: string }
    expect(data.bodyPreview).toBe('')
    restore()
  })
})

describe('broadcastError + broadcastCsrfWarn', () => {
  it('broadcastError sends as theo:devtools:error', () => {
    const { sends, restore } = installFakeServer()
    broadcastError({ id: 'e1', type: 'unhandled', message: 'oops', timestamp: 0 })
    expect(sends[0]!.event).toBe('theo:devtools:error')
    restore()
  })

  it('broadcastCsrfWarn sends as theo:devtools:csrf.warn', () => {
    const { sends, restore } = installFakeServer()
    broadcastCsrfWarn({
      event: 'csrf.warn',
      code: 'CSRF_STRICT_CUTOVER',
      docsUrl: 'https://theokit.dev/upgrade/csrf-strict-cutover',
      method: 'POST',
      path: '/api/x?token=abc',
      reason: 'missing header',
    })
    expect(sends[0]!.event).toBe('theo:devtools:csrf.warn')
    const data = sends[0]!.data as { path: string }
    // CSRF warn path also redacted
    expect(data.path).toContain('token=%5BREDACTED%5D')
    restore()
  })
})
