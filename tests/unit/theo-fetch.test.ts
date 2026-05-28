import { describe, it, expect, vi, beforeEach } from 'vitest'
import { theoFetch, TheoFetchError } from '../../packages/theo/src/client/theo-fetch.js'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.stubGlobal('location', { origin: 'http://localhost:3000' })

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function errorResponse(code: string, message: string, status: number, issues?: unknown[]) {
  return jsonResponse({ error: { code, message, ...(issues ? { issues } : {}) } }, status)
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('theoFetch', () => {
  it('should call globalThis.fetch with the URL', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }))
    await theoFetch('/api/health')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/health')
  })

  it('should append query params to URL', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ users: [] }))
    await theoFetch('/api/users', { query: { search: 'alice' } } as never)
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('search=alice')
  })

  it('should send JSON body with Content-Type header', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1' }))
    await theoFetch('/api/users', { body: { name: 'bob' } } as never)
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(init.body).toBe(JSON.stringify({ name: 'bob' }))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('should return parsed JSON on success', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ users: [{ name: 'alice' }] }))
    const result = await theoFetch('/api/users')
    expect(result).toEqual({ users: [{ name: 'alice' }] })
  })

  it('should throw TheoFetchError on non-ok response', async () => {
    mockFetch.mockResolvedValue(errorResponse('NOT_FOUND', 'Not found', 404))
    await expect(theoFetch('/api/missing')).rejects.toThrow(TheoFetchError)
  })

  it('should have status on TheoFetchError', async () => {
    mockFetch.mockResolvedValue(errorResponse('NOT_FOUND', 'Not found', 404))
    try {
      await theoFetch('/api/missing')
    } catch (err) {
      expect(err).toBeInstanceOf(TheoFetchError)
      expect((err as TheoFetchError).status).toBe(404)
    }
  })

  it('should have code on TheoFetchError', async () => {
    mockFetch.mockResolvedValue(errorResponse('VALIDATION_ERROR', 'Invalid', 400))
    try {
      await theoFetch('/api/users')
    } catch (err) {
      expect((err as TheoFetchError).code).toBe('VALIDATION_ERROR')
    }
  })

  it('should have issues on TheoFetchError for validation errors', async () => {
    const issues = [{ path: ['name'], message: 'Required' }]
    mockFetch.mockResolvedValue(errorResponse('VALIDATION_ERROR', 'Invalid', 400, issues))
    try {
      await theoFetch('/api/users')
    } catch (err) {
      expect((err as TheoFetchError).issues).toEqual(issues)
    }
  })

  it('should pass custom headers', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }))
    await theoFetch('/api/health', { headers: { Authorization: 'Bearer token' } })
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token')
  })

  it('should not send body for requests without body option', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }))
    await theoFetch('/api/health')
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(init.body).toBeUndefined()
  })

  it('should handle 204 No Content without JSON parse (EC-1)', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }))
    const result = await theoFetch('/api/users/1')
    expect(result).toBeNull()
  })

  it('should skip undefined query values', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ users: [] }))
    await theoFetch('/api/users', { query: { search: 'a', page: undefined } } as never)
    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('search=a')
    expect(calledUrl).not.toContain('undefined')
  })

  it('should handle empty content-length', async () => {
    mockFetch.mockResolvedValue(
      new Response('', {
        status: 200,
        headers: { 'content-length': '0' },
      }),
    )
    const result = await theoFetch('/api/empty')
    expect(result).toBeNull()
  })
})
