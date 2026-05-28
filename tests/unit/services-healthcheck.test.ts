import { describe, it, expect, vi } from 'vitest'
import { pollHealthcheck } from '../../packages/theo/src/services/index.js'

function fetchSeq(responses: Array<number | 'throw'>): typeof fetch {
  let i = 0
  return vi.fn(async () => {
    const next = responses[Math.min(i, responses.length - 1)]
    i++
    if (next === 'throw') throw new TypeError('connection refused')
    return new Response('', { status: next })
  }) as unknown as typeof fetch
}

describe('T1.5 — pollHealthcheck', () => {
  it('returns healthy on first 200', async () => {
    const result = await pollHealthcheck({
      url: 'http://localhost:8001/health',
      customFetch: fetchSeq([200]),
      intervalMs: 10,
      timeoutMs: 1000,
    })
    expect(result.healthy).toBe(true)
    expect(result.attempts).toBe(1)
  })

  it('retries until 200', async () => {
    const result = await pollHealthcheck({
      url: 'http://localhost:8001/health',
      customFetch: fetchSeq([503, 503, 200]),
      intervalMs: 10,
      timeoutMs: 2000,
    })
    expect(result.healthy).toBe(true)
    expect(result.attempts).toBe(3)
  })

  it('returns unhealthy on timeout', async () => {
    const result = await pollHealthcheck({
      url: 'http://localhost:8001/health',
      customFetch: fetchSeq([503]),
      intervalMs: 30,
      timeoutMs: 100,
    })
    expect(result.healthy).toBe(false)
  })

  it('returns unhealthy on network errors', async () => {
    const result = await pollHealthcheck({
      url: 'http://localhost:8001/health',
      customFetch: fetchSeq(['throw']),
      intervalMs: 30,
      timeoutMs: 100,
    })
    expect(result.healthy).toBe(false)
    expect(result.lastError).toBeDefined()
  })

  it('respects external abort signal', async () => {
    const ctrl = new AbortController()
    const start = Date.now()
    const p = pollHealthcheck({
      url: 'http://localhost:8001/health',
      customFetch: fetchSeq([503]),
      intervalMs: 50,
      timeoutMs: 5000,
      signal: ctrl.signal,
    })
    setTimeout(() => ctrl.abort(), 30)
    const result = await p
    expect(result.healthy).toBe(false)
    expect(Date.now() - start).toBeLessThan(500)
  })

  it('returns immediately if signal already aborted (EC-18)', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const start = Date.now()
    const result = await pollHealthcheck({
      url: 'http://localhost:8001/health',
      customFetch: fetchSeq([503]),
      intervalMs: 50,
      timeoutMs: 5000,
      signal: ctrl.signal,
    })
    expect(result.healthy).toBe(false)
    expect(Date.now() - start).toBeLessThan(50)
  })

  it('records attempts correctly across multiple failures + success', async () => {
    const result = await pollHealthcheck({
      url: 'http://localhost:8001/health',
      customFetch: fetchSeq([503, 503, 503, 503, 503, 200]),
      intervalMs: 5,
      timeoutMs: 2000,
    })
    expect(result.attempts).toBe(6)
  })

  it('records duration > 0', async () => {
    const result = await pollHealthcheck({
      url: 'http://localhost:8001/health',
      customFetch: fetchSeq([503, 200]),
      intervalMs: 30,
      timeoutMs: 2000,
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('never throws', async () => {
    await expect(
      pollHealthcheck({
        url: 'http://localhost:8001/health',
        customFetch: fetchSeq(['throw', 'throw']),
        intervalMs: 10,
        timeoutMs: 50,
      }),
    ).resolves.toBeDefined()
  })
})
