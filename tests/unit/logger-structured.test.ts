import { describe, it, expect, vi } from 'vitest'
import { createLogger, logRequest } from '../../packages/theo/src/server/observability/logger.js'
import type { StructuredLog } from '../../packages/theo/src/server/observability/logger.js'

describe('createLogger', () => {
  it('should output info level by default', () => {
    const output = vi.fn()
    const logger = createLogger({ output })

    logger.info('test message')

    expect(output).toHaveBeenCalledOnce()
    const log = output.mock.calls[0][0] as StructuredLog
    expect(log.level).toBe('info')
    expect(log.msg).toBe('test message')
    expect(log.timestamp).toBeDefined()
  })

  it('should filter messages below configured level', () => {
    const output = vi.fn()
    const logger = createLogger({ level: 'warn', output })

    logger.info('should be filtered')
    logger.debug('also filtered')

    expect(output).not.toHaveBeenCalled()
  })

  it('should pass messages at or above configured level', () => {
    const output = vi.fn()
    const logger = createLogger({ level: 'warn', output })

    logger.warn('warning message')

    expect(output).toHaveBeenCalledOnce()
    const log = output.mock.calls[0][0] as StructuredLog
    expect(log.level).toBe('warn')
  })

  it('should support child logger that inherits context', () => {
    const output = vi.fn()
    const logger = createLogger({ output })
    const child = logger.child({ requestId: '123' })

    child.info('child message')

    expect(output).toHaveBeenCalledOnce()
    const log = output.mock.calls[0][0] as StructuredLog
    expect(log.requestId).toBe('123')
    expect(log.msg).toBe('child message')
  })

  it('should produce structured JSON output with all fields', () => {
    const output = vi.fn()
    const logger = createLogger({ output })

    logger.info('structured', { key: 'val', count: 42 })

    const log = output.mock.calls[0][0] as StructuredLog
    expect(log.level).toBe('info')
    expect(log.msg).toBe('structured')
    expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(log.key).toBe('val')
    expect(log.count).toBe(42)
  })

  it('should call custom output function', () => {
    const output = vi.fn()
    const logger = createLogger({ output })

    logger.info('custom output')

    expect(output).toHaveBeenCalledOnce()
    expect(output.mock.calls[0][0]).toHaveProperty('msg', 'custom output')
  })

  it('should include error stack when logging errors', () => {
    const output = vi.fn()
    const logger = createLogger({ output })

    logger.error('fail', { error: new Error('boom') })

    const log = output.mock.calls[0][0] as StructuredLog
    expect(log.level).toBe('error')
    expect(log.error).toContain('boom')
  })

  it('should filter all messages at silent level', () => {
    const output = vi.fn()
    const logger = createLogger({ level: 'silent', output })

    logger.debug('no')
    logger.info('no')
    logger.warn('no')
    logger.error('no')

    expect(output).not.toHaveBeenCalled()
  })
})

describe('logRequest backward compat', () => {
  it('should output structured JSON with existing interface', () => {
    const output = vi.fn()
    // Capture console.log for backward compat test
    const origLog = console.log
    console.log = output

    logRequest({
      method: 'GET',
      url: '/api/users',
      status: 200,
      duration: 12,
      requestId: 'abc-123',
    })

    console.log = origLog

    expect(output).toHaveBeenCalledOnce()
    const logged = JSON.parse(output.mock.calls[0][0])
    expect(logged.level).toBe('info')
    expect(logged.method).toBe('GET')
    expect(logged.url).toBe('/api/users')
    expect(logged.status).toBe(200)
  })
})
