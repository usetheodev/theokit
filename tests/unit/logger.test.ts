import { describe, it, expect, vi } from 'vitest'
import { logRequest } from '../../packages/theo/src/server/observability/logger.js'
import type { RequestLog } from '../../packages/theo/src/server/observability/logger.js'

const sampleInfo = {
  method: 'GET',
  url: '/api/health',
  status: 200,
  duration: 42,
  requestId: 'test-123',
}

describe('logRequest', () => {
  it('should use console.log by default (backward compat)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logRequest(sampleInfo)
    expect(spy).toHaveBeenCalledTimes(1)
    const logged = JSON.parse(spy.mock.calls[0][0] as string) as RequestLog
    expect(logged.method).toBe('GET')
    expect(logged.url).toBe('/api/health')
    expect(logged.level).toBe('info')
    expect(logged.timestamp).toBeDefined()
    spy.mockRestore()
  })

  it('should call custom logger when provided', () => {
    const customLogger = vi.fn()
    logRequest(sampleInfo, customLogger)
    expect(customLogger).toHaveBeenCalledTimes(1)
    const log = customLogger.mock.calls[0][0] as RequestLog
    expect(log.method).toBe('GET')
    expect(log.status).toBe(200)
    expect(log.requestId).toBe('test-123')
  })

  it('should include all required fields in custom logger call', () => {
    const customLogger = vi.fn()
    logRequest(sampleInfo, customLogger)
    const log = customLogger.mock.calls[0][0] as RequestLog
    expect(log).toHaveProperty('level', 'info')
    expect(log).toHaveProperty('method', 'GET')
    expect(log).toHaveProperty('url', '/api/health')
    expect(log).toHaveProperty('status', 200)
    expect(log).toHaveProperty('duration', 42)
    expect(log).toHaveProperty('requestId', 'test-123')
    expect(log).toHaveProperty('timestamp')
  })

  it('should not call console.log when custom logger is provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const customLogger = vi.fn()
    logRequest(sampleInfo, customLogger)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
