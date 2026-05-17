import { describe, it, expect, vi } from 'vitest'
import {
  createBatcher,
  type BatchTransport,
  type BatchRequest,
  type BatchResponse,
} from '../../packages/theo/src/client/batch.js'

describe('createBatcher — microtask collapsing (T5.1)', () => {
  it('collapses 3 calls in same microtask into 1 transport request', async () => {
    let transportCalls = 0
    const transport: BatchTransport = async (requests) => {
      transportCalls++
      return requests.map((r, i) => ({ index: i, data: { from: r.path } }))
    }
    const batcher = createBatcher({ transport })

    const [a, b, c] = await Promise.all([
      batcher.dispatch({ path: '/api/a', method: 'GET' }),
      batcher.dispatch({ path: '/api/b', method: 'GET' }),
      batcher.dispatch({ path: '/api/c', method: 'GET' }),
    ])
    expect(transportCalls).toBe(1)
    expect((a as { from: string }).from).toBe('/api/a')
    expect((b as { from: string }).from).toBe('/api/b')
    expect((c as { from: string }).from).toBe('/api/c')
  })

  it('isolates errors per item — one item rejects without breaking others', async () => {
    const transport: BatchTransport = async (requests) =>
      requests.map((r, i) =>
        r.path === '/bad'
          ? { index: i, error: { message: 'bad route' } }
          : { index: i, data: { ok: true } },
      )
    const batcher = createBatcher({ transport })

    const results = await Promise.allSettled([
      batcher.dispatch({ path: '/api/a', method: 'GET' }),
      batcher.dispatch({ path: '/bad', method: 'GET' }),
      batcher.dispatch({ path: '/api/c', method: 'GET' }),
    ])
    expect(results[0].status).toBe('fulfilled')
    expect(results[1].status).toBe('rejected')
    expect(results[2].status).toBe('fulfilled')
  })

  it('splits into multiple batches when max is exceeded', async () => {
    let batchCount = 0
    const transport: BatchTransport = async (requests) => {
      batchCount++
      return requests.map((_, i) => ({ index: i, data: i }))
    }
    const batcher = createBatcher({ transport, max: 2 })

    await Promise.all([
      batcher.dispatch({ path: '/1', method: 'GET' }),
      batcher.dispatch({ path: '/2', method: 'GET' }),
      batcher.dispatch({ path: '/3', method: 'GET' }),
      batcher.dispatch({ path: '/4', method: 'GET' }),
      batcher.dispatch({ path: '/5', method: 'GET' }),
    ])
    // 5 items, max 2 → 3 batches
    expect(batchCount).toBe(3)
  })

  it('passes full request payload through to transport', async () => {
    let received: BatchRequest[] = []
    const transport: BatchTransport = async (requests) => {
      received = requests
      return requests.map((_, i) => ({ index: i, data: null }))
    }
    const batcher = createBatcher({ transport })
    await batcher.dispatch({
      path: '/api/users',
      method: 'POST',
      body: { name: 'Alice' },
      query: { admin: 'true' },
    })
    expect(received[0]).toMatchObject({
      path: '/api/users',
      method: 'POST',
      body: { name: 'Alice' },
      query: { admin: 'true' },
    })
  })

  it('rejects all pending when the transport itself throws', async () => {
    const transport: BatchTransport = async () => {
      throw new Error('network down')
    }
    const batcher = createBatcher({ transport })
    const results = await Promise.allSettled([
      batcher.dispatch({ path: '/a', method: 'GET' }),
      batcher.dispatch({ path: '/b', method: 'GET' }),
    ])
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
  })

  it('preserves call ordering in the batch payload', async () => {
    let order: string[] = []
    const transport: BatchTransport = async (requests) => {
      order = requests.map((r) => r.path)
      return requests.map((_, i) => ({ index: i, data: null }))
    }
    const batcher = createBatcher({ transport })
    await Promise.all([
      batcher.dispatch({ path: '/first', method: 'GET' }),
      batcher.dispatch({ path: '/second', method: 'GET' }),
      batcher.dispatch({ path: '/third', method: 'GET' }),
    ])
    expect(order).toEqual(['/first', '/second', '/third'])
  })
})
