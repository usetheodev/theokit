import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  JsonStdoutSink,
  createNoOpLogger,
  type AuditEvent,
  type AuditLogger,
} from '../../packages/theo/src/server/audit-log.js'
import { theoConfigSchema } from '../../packages/theo/src/config/schema.js'

/**
 * T4.1 — AuditLogger interface + JsonStdoutSink default.
 *
 * Interface: log({ action, actor?, resource?, metadata?, timestamp?, traceId? })
 *
 * Default sink writes one JSON line per event to stdout. Compatible with
 * any deploy target that captures stdout (Vercel, CF Workers, Lambda,
 * Docker, TheoCloud → Loki).
 *
 * Async-or-sync return — fire-and-forget from caller's perspective.
 * User-provided loggers that throw are caught by the framework wrapper
 * (T4.2). JsonStdoutSink itself never throws — circular refs / BigInt
 * fall back to a `[audit]` placeholder line.
 */

describe('T4.1 — JsonStdoutSink', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => {
    logSpy.mockRestore()
  })

  it('writes the event to console.log as JSON', () => {
    const sink = new JsonStdoutSink()
    sink.log({ action: 'csrf.warn' })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const arg = logSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(arg)
    expect(parsed.level).toBe('audit')
    expect(parsed.action).toBe('csrf.warn')
  })

  it('enriches missing timestamp with ISO 8601', () => {
    const sink = new JsonStdoutSink()
    sink.log({ action: 'csrf.warn' })
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('preserves caller-provided timestamp', () => {
    const sink = new JsonStdoutSink()
    sink.log({ action: 'csrf.warn', timestamp: '2026-05-19T12:00:00.000Z' })
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(parsed.timestamp).toBe('2026-05-19T12:00:00.000Z')
  })

  it('EC: circular metadata → fallback line, no crash', () => {
    const sink = new JsonStdoutSink()
    const circular: Record<string, unknown> = { foo: 'bar' }
    circular.self = circular
    expect(() => sink.log({ action: 'csrf.warn', metadata: circular })).not.toThrow()
    expect(logSpy).toHaveBeenCalledTimes(1)
    const arg = logSpy.mock.calls[0][0] as string
    expect(arg).toMatch(/csrf\.warn/)
  })

  it('createNoOpLogger does NOT call console.log', () => {
    const logger = createNoOpLogger()
    logger.log({ action: 'csrf.warn' })
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('config schema accepts audit field', () => {
    expect(() => theoConfigSchema.parse({ audit: { logger: undefined } })).not.toThrow()
    expect(() => theoConfigSchema.parse({ audit: undefined })).not.toThrow()
    expect(() => theoConfigSchema.parse({})).not.toThrow()
  })
})

describe('T4.1 — AuditLogger interface (contract)', () => {
  it('async logger return type compatible', async () => {
    const logger: AuditLogger = {
      async log(event: AuditEvent) {
        await Promise.resolve()
        void event
      },
    }
    await expect(Promise.resolve(logger.log({ action: 'csrf.warn' }))).resolves.toBeUndefined()
  })
})
