import { describe, it, expect, vi } from 'vitest'
import {
  handleBatchRequest,
  STRIPPED_HEADERS,
  BatchPathConflictError,
} from '../../packages/theo/src/server/batch-handler.js'

describe('handleBatchRequest — core (T1.4)', () => {
  it('processes 3 items and returns ordered results', async () => {
    const result = await handleBatchRequest(
      {
        requests: [
          { path: '/api/a', method: 'GET' },
          { path: '/api/b', method: 'GET' },
          { path: '/api/c', method: 'GET' },
        ],
      },
      {
        execute: async (req) => ({ data: { echoed: req.path } }),
      },
    )
    expect(result.results).toHaveLength(3)
    expect((result.results[0] as { data: { echoed: string } }).data.echoed).toBe('/api/a')
    expect((result.results[2] as { data: { echoed: string } }).data.echoed).toBe('/api/c')
  })

  it('isolates errors per item — one fails, others succeed', async () => {
    const result = await handleBatchRequest(
      {
        requests: [
          { path: '/api/a', method: 'GET' },
          { path: '/api/bad', method: 'GET' },
          { path: '/api/c', method: 'GET' },
        ],
      },
      {
        execute: async (req) => {
          if (req.path === '/api/bad') throw new Error('handler boom')
          return { data: { ok: true } }
        },
      },
    )
    expect((result.results[0] as { data: unknown }).data).toBeDefined()
    expect((result.results[1] as { error: { message: string } }).error.message).toBe('handler boom')
    expect((result.results[2] as { data: unknown }).data).toBeDefined()
  })

  it('enforces max batch size (default 32)', async () => {
    const requests = Array.from({ length: 33 }, (_, i) => ({
      path: `/api/${i}`,
      method: 'GET',
    }))
    await expect(
      handleBatchRequest({ requests }, { execute: async () => ({ data: null }) }),
    ).rejects.toThrow(/exceeds max/)
  })

  it('respects custom max from config', async () => {
    await expect(
      handleBatchRequest(
        {
          requests: [
            { path: '/a', method: 'GET' },
            { path: '/b', method: 'GET' },
            { path: '/c', method: 'GET' },
          ],
        },
        { execute: async () => ({ data: null }), max: 2 },
      ),
    ).rejects.toThrow(/exceeds max/)
  })
})

describe('handleBatchRequest — EC-2 header stripping', () => {
  it('strips authorization header from per-item headers', async () => {
    let receivedHeaders: Record<string, string> = {}
    await handleBatchRequest(
      {
        requests: [
          {
            path: '/api/a',
            method: 'GET',
            headers: { authorization: 'Bearer STOLEN' },
          },
        ],
      },
      {
        execute: async (req) => {
          receivedHeaders = req.headers ?? {}
          return { data: null }
        },
        outerHeaders: { authorization: 'Bearer LEGIT' },
      },
    )
    expect(receivedHeaders.authorization).toBe('Bearer LEGIT')
  })

  it('strips cookie header from per-item', async () => {
    let receivedHeaders: Record<string, string> = {}
    await handleBatchRequest(
      {
        requests: [
          {
            path: '/api/a',
            method: 'GET',
            headers: { cookie: 'session=forged' },
          },
        ],
      },
      {
        execute: async (req) => {
          receivedHeaders = req.headers ?? {}
          return { data: null }
        },
        outerHeaders: { cookie: 'session=real' },
      },
    )
    expect(receivedHeaders.cookie).toBe('session=real')
  })

  it('strips x-forwarded-* headers from per-item', async () => {
    let receivedHeaders: Record<string, string> = {}
    await handleBatchRequest(
      {
        requests: [
          {
            path: '/api/a',
            method: 'GET',
            headers: { 'x-forwarded-for': '666.666.666.666' },
          },
        ],
      },
      {
        execute: async (req) => {
          receivedHeaders = req.headers ?? {}
          return { data: null }
        },
        outerHeaders: { 'x-forwarded-for': '127.0.0.1' },
      },
    )
    expect(receivedHeaders['x-forwarded-for']).toBe('127.0.0.1')
  })

  it('allows content-type per-item (not stripped)', async () => {
    let receivedHeaders: Record<string, string> = {}
    await handleBatchRequest(
      {
        requests: [
          {
            path: '/api/a',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
          },
        ],
      },
      {
        execute: async (req) => {
          receivedHeaders = req.headers ?? {}
          return { data: null }
        },
      },
    )
    expect(receivedHeaders['content-type']).toBe('application/json')
  })
})

describe('STRIPPED_HEADERS list', () => {
  it('contains all known auth/forwarded headers', () => {
    expect(STRIPPED_HEADERS).toContain('authorization')
    expect(STRIPPED_HEADERS).toContain('cookie')
    expect(STRIPPED_HEADERS).toContain('x-forwarded-for')
    expect(STRIPPED_HEADERS).toContain('x-forwarded-host')
    expect(STRIPPED_HEADERS).toContain('x-forwarded-proto')
    expect(STRIPPED_HEADERS).toContain('x-real-ip')
    expect(STRIPPED_HEADERS).toContain('host')
  })
})

describe('BatchPathConflictError', () => {
  it('exists and has proper name', () => {
    const err = new BatchPathConflictError('/api/__theo_batch__')
    expect(err.name).toBe('BatchPathConflictError')
    expect(err.message).toContain('__theo_batch__')
  })
})
