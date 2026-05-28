import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createBatchTransport,
  __resetGlobalBatcherForTests,
} from '../../packages/theo/src/client/batch-transport.js'

describe('createBatchTransport — default HTTP transport (T1.5)', () => {
  it('posts to /api/__theo_batch__ with payload', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [{ data: { ok: true } }, { data: { ok: true } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const transport = createBatchTransport({ fetchImpl: fetchSpy })
    const results = await transport([
      { path: '/api/a', method: 'GET' },
      { path: '/api/b', method: 'GET' },
    ])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const calls = fetchSpy.mock.calls as unknown as Array<[unknown, RequestInit?]>
    expect(calls[0][0]).toBe('/api/__theo_batch__')
    expect(calls[0][1]?.method).toBe('POST')
    expect(results).toHaveLength(2)
  })

  it('rejects all callers when transport itself fails', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('network')
    })
    const transport = createBatchTransport({ fetchImpl: fetchSpy })
    await expect(transport([{ path: '/api/a', method: 'GET' }])).rejects.toThrow(/network/)
  })

  it('reports per-item errors from server response', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [{ data: { ok: true } }, { error: { message: 'not found' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const transport = createBatchTransport({ fetchImpl: fetchSpy })
    const results = await transport([
      { path: '/api/a', method: 'GET' },
      { path: '/api/bad', method: 'GET' },
    ])
    expect((results[0] as { data: unknown }).data).toBeDefined()
    expect((results[1] as { error: { message: string } }).error.message).toBe('not found')
  })

  it('throws when batch endpoint returns 404 (fallback signal)', async () => {
    const fetchSpy = vi.fn(
      async () => new Response('{"error":{"code":"NOT_FOUND"}}', { status: 404 }),
    )
    const transport = createBatchTransport({ fetchImpl: fetchSpy })
    await expect(transport([{ path: '/api/a', method: 'GET' }])).rejects.toThrow()
  })
})

describe('global batcher isolation (EC-7)', () => {
  beforeEach(() => {
    __resetGlobalBatcherForTests()
    delete (globalThis as { __THEO_BATCHING__?: boolean }).__THEO_BATCHING__
  })

  it('returns no batcher when __THEO_BATCHING__ is unset (no overhead)', async () => {
    const { getGlobalBatcher } = await import('../../packages/theo/src/client/batch-transport.js')
    expect(getGlobalBatcher()).toBeUndefined()
  })

  it('returns a singleton batcher when batching enabled', async () => {
    ;(globalThis as { __THEO_BATCHING__?: boolean }).__THEO_BATCHING__ = true
    const { getGlobalBatcher } = await import('../../packages/theo/src/client/batch-transport.js')
    const b1 = getGlobalBatcher()
    const b2 = getGlobalBatcher()
    expect(b1).toBeDefined()
    expect(b1).toBe(b2)
  })
})
