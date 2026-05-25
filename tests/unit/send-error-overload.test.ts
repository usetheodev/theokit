import { describe, it, expect, vi } from 'vitest'

import { sendError } from '../../packages/theo/src/server/http/execute.js'
import type { ServerResponse } from 'node:http'

/**
 * T6.3 — sendError options-bag overload.
 * Covers PV-17 backward-compat: both call shapes (positional + bag) work.
 */
describe('sendError overload (T6.3)', () => {
  function mockRes(): ServerResponse {
    const res = {
      writeHead: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
      writableEnded: false,
      headersSent: false,
    }
    return res as unknown as ServerResponse
  }

  it('positional form (backward compat)', () => {
    const res = mockRes()
    sendError(res, 'NOT_FOUND', 'route missing', 404)
    expect((res.end as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
  })

  it('options-bag form (new canonical)', () => {
    const res = mockRes()
    sendError(res, {
      code: 'NOT_FOUND',
      message: 'route missing',
      status: 404,
    })
    expect((res.end as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
  })

  it('both forms produce same output (positional ≡ options-bag)', () => {
    const res1 = mockRes()
    const res2 = mockRes()
    sendError(res1, 'VALIDATION_ERROR', 'bad input', 422, [{ field: 'name' }])
    sendError(res2, {
      code: 'VALIDATION_ERROR',
      message: 'bad input',
      status: 422,
      issues: [{ field: 'name' }],
    })
    const calls1 = (res1.end as ReturnType<typeof vi.fn>).mock.calls
    const calls2 = (res2.end as ReturnType<typeof vi.fn>).mock.calls
    expect(calls1[0]).toEqual(calls2[0])
  })

  it('options-bag with all fields', () => {
    const res = mockRes()
    sendError(res, {
      code: 'INTERNAL_ERROR',
      message: 'boom',
      status: 500,
      requestId: 'req-123',
    })
    expect((res.end as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })
})
