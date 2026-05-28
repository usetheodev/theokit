import { describe, it, expect } from 'vitest'
import { validateCsrf } from '../../packages/theo/src/server/security/csrf.js'
import type { IncomingMessage } from 'node:http'

function mockReq(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage
}

describe('validateCsrf', () => {
  it('should reject request without X-Theo-Action header', () => {
    const result = validateCsrf(mockReq({}))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain('X-Theo-Action')
  })

  it('should accept request with X-Theo-Action and matching origin', () => {
    const result = validateCsrf(
      mockReq({ 'x-theo-action': '1', origin: 'http://localhost:3000', host: 'localhost:3000' }),
    )
    expect(result.valid).toBe(true)
  })

  it('should reject request with X-Theo-Action but foreign origin', () => {
    const result = validateCsrf(
      mockReq({ 'x-theo-action': '1', origin: 'http://evil.com', host: 'localhost:3000' }),
    )
    expect(result.valid).toBe(false)
  })

  it('should accept request with X-Theo-Action but no Origin (same-origin)', () => {
    const result = validateCsrf(mockReq({ 'x-theo-action': '1' }))
    expect(result.valid).toBe(true)
  })

  it('should accept request with X-Theo-Action and no Host header', () => {
    const result = validateCsrf(mockReq({ 'x-theo-action': '1', origin: 'http://localhost:3000' }))
    expect(result.valid).toBe(true)
  })
})
