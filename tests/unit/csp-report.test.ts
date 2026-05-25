import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import {
  handleCspReport,
  normalizeLegacy,
  normalizeNew,
  CSP_REPORT_PATH,
} from '../../packages/theo/src/server/security/csp-report.js'

/**
 * T5.1 — CSP report endpoint.
 *
 * Accepts both legacy `application/csp-report` and modern
 * `application/reports+json` content types. Forwards normalized
 * violations to audit logger + devtools dispatcher + user hook.
 *
 * EC-2: browsers MAY POST `{"csp-report": null}` or empty `{}` or
 * reports+json entries lacking `body`. The handler MUST short-circuit
 * to 204 (valid format, no violation to record), NEVER crash.
 */

function makeReq(opts: { method?: string; contentType?: string; body?: string }): IncomingMessage {
  const body = opts.body ?? ''
  const stream = Readable.from([Buffer.from(body)])
  ;(stream as unknown as { method?: string }).method = opts.method ?? 'POST'
  ;(stream as unknown as { url?: string }).url = CSP_REPORT_PATH
  ;(stream as unknown as { headers?: Record<string, string> }).headers = opts.contentType
    ? { 'content-type': opts.contentType }
    : {}
  return stream as unknown as IncomingMessage
}

function makeRes() {
  let statusCode = 200
  let ended = false
  const headers: Record<string, string> = {}
  return {
    get statusCode() {
      return statusCode
    },
    set statusCode(v: number) {
      statusCode = v
    },
    setHeader(k: string, v: string) {
      headers[k] = v
    },
    end() {
      ended = true
    },
    get ended() {
      return ended
    },
    headers,
  } as unknown as ServerResponse & { ended: boolean; headers: Record<string, string> }
}

describe('T5.1 — CSP report endpoint', () => {
  it('legacy format: violation normalized + audit logger called', async () => {
    const audit = vi.fn()
    const body = JSON.stringify({
      'csp-report': {
        'blocked-uri': 'https://evil.com/x.js',
        'document-uri': 'https://app.example.com/page',
        'violated-directive': "script-src 'self'",
      },
    })
    const req = makeReq({ contentType: 'application/csp-report', body })
    const res = makeRes() as any
    await handleCspReport(req, res, { auditLogger: { log: audit } })
    expect(res.statusCode).toBe(204)
    expect(audit).toHaveBeenCalledTimes(1)
    expect(audit.mock.calls[0][0].action).toBe('csp.violation')
  })

  it('new format (reports+json): violation normalized + audit logger called', async () => {
    const audit = vi.fn()
    const body = JSON.stringify([
      {
        age: 1234,
        type: 'csp-violation',
        url: 'https://app.example.com/page',
        body: {
          blockedURL: 'https://evil.com/x.js',
          documentURL: 'https://app.example.com/page',
          violatedDirective: "script-src 'self'",
        },
      },
    ])
    const req = makeReq({ contentType: 'application/reports+json', body })
    const res = makeRes() as any
    await handleCspReport(req, res, { auditLogger: { log: audit } })
    expect(res.statusCode).toBe(204)
    expect(audit).toHaveBeenCalledTimes(1)
  })

  it('returns 204 + empty body on success', async () => {
    const body = JSON.stringify({
      'csp-report': {
        'blocked-uri': 'x',
        'document-uri': 'y',
        'violated-directive': "script-src 'self'",
      },
    })
    const req = makeReq({ contentType: 'application/csp-report', body })
    const res = makeRes() as any
    await handleCspReport(req, res, {})
    expect(res.statusCode).toBe(204)
  })

  it('EC: 415 for unknown content-type', async () => {
    const req = makeReq({ contentType: 'text/plain', body: 'whatever' })
    const res = makeRes() as any
    await handleCspReport(req, res, {})
    expect(res.statusCode).toBe(415)
  })

  it('EC: 400 for invalid JSON', async () => {
    const req = makeReq({ contentType: 'application/csp-report', body: '{not valid json' })
    const res = makeRes() as any
    await handleCspReport(req, res, {})
    expect(res.statusCode).toBe(400)
  })

  it('EC: 413 for body > 16 KB', async () => {
    const big = 'a'.repeat(20 * 1024)
    const req = makeReq({ contentType: 'application/csp-report', body: big })
    const res = makeRes() as any
    await handleCspReport(req, res, {})
    expect(res.statusCode).toBe(413)
  })

  it('user hook invoked with normalized violation', async () => {
    const onViolation = vi.fn()
    const body = JSON.stringify({
      'csp-report': {
        'blocked-uri': 'x',
        'document-uri': 'y',
        'violated-directive': "script-src 'self'",
      },
    })
    const req = makeReq({ contentType: 'application/csp-report', body })
    const res = makeRes() as any
    await handleCspReport(req, res, { onViolation })
    expect(onViolation).toHaveBeenCalledTimes(1)
    expect(onViolation.mock.calls[0][0].blockedUrl).toBe('x')
  })

  it('EC: user hook throw does not crash → 204', async () => {
    const onViolation = vi.fn().mockImplementation(() => {
      throw new Error('oops')
    })
    const body = JSON.stringify({
      'csp-report': {
        'blocked-uri': 'x',
        'document-uri': 'y',
        'violated-directive': "script-src 'self'",
      },
    })
    const req = makeReq({ contentType: 'application/csp-report', body })
    const res = makeRes() as any
    await handleCspReport(req, res, { onViolation })
    expect(res.statusCode).toBe(204)
  })

  /**
   * EC-2 — null guards. Browsers may POST these payloads:
   *   - {"csp-report": null}
   *   - {} (empty object, no csp-report key)
   *   - [{...without body...}] for reports+json
   *
   * Handler MUST short-circuit to 204 (valid format, no violation).
   */
  it('EC-2: legacy {"csp-report": null} returns 204 (no null deref)', async () => {
    const audit = vi.fn()
    const req = makeReq({ contentType: 'application/csp-report', body: '{"csp-report": null}' })
    const res = makeRes() as any
    await handleCspReport(req, res, { auditLogger: { log: audit } })
    expect(res.statusCode).toBe(204)
    expect(audit).not.toHaveBeenCalled()
  })

  it('EC-2: legacy {} (no csp-report key) returns 204 with NO audit emission', async () => {
    const audit = vi.fn()
    const req = makeReq({ contentType: 'application/csp-report', body: '{}' })
    const res = makeRes() as any
    await handleCspReport(req, res, { auditLogger: { log: audit } })
    expect(res.statusCode).toBe(204)
    expect(audit).not.toHaveBeenCalled()
  })

  it('EC-2: reports+json entry without body field is skipped (no crash)', async () => {
    const audit = vi.fn()
    const body = JSON.stringify([{ type: 'csp-violation', url: 'https://app.example' }]) // no body
    const req = makeReq({ contentType: 'application/reports+json', body })
    const res = makeRes() as any
    await handleCspReport(req, res, { auditLogger: { log: audit } })
    expect(res.statusCode).toBe(204)
    expect(audit).not.toHaveBeenCalled()
  })
})

describe('T5.1 — normalizers', () => {
  it('normalizeLegacy maps legacy field names', () => {
    const v = normalizeLegacy({
      'blocked-uri': 'b',
      'document-uri': 'd',
      'violated-directive': 'vd',
      'source-file': 's',
      'line-number': 10,
      'column-number': 20,
    })
    expect(v.blockedUrl).toBe('b')
    expect(v.documentUrl).toBe('d')
    expect(v.violatedDirective).toBe('vd')
    expect(v.sourceFile).toBe('s')
    expect(v.lineNumber).toBe(10)
    expect(v.columnNumber).toBe(20)
  })

  it('normalizeNew maps reports+json field names', () => {
    const v = normalizeNew({
      body: {
        blockedURL: 'b',
        documentURL: 'd',
        violatedDirective: 'vd',
        effectiveDirective: 'ed',
        statusCode: 200,
        disposition: 'enforce',
      },
    })!
    expect(v.blockedUrl).toBe('b')
    expect(v.violatedDirective).toBe('vd')
    expect(v.effectiveDirective).toBe('ed')
    expect(v.statusCode).toBe(200)
    expect(v.disposition).toBe('enforce')
  })
})
