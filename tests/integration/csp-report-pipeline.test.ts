import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleCspReport, CSP_REPORT_PATH } from '../../packages/theo/src/server/csp-report.js'

/**
 * T5.1 — Integration tests for the CSP report pipeline.
 *
 * Verifies: audit logger + devtools dispatcher + user hook all receive
 * the same violation. Exercises both wire formats.
 */

function makeReq(opts: { contentType: string; body: string }): IncomingMessage {
  const stream = Readable.from([Buffer.from(opts.body)])
  ;(stream as unknown as { method?: string }).method = 'POST'
  ;(stream as unknown as { url?: string }).url = CSP_REPORT_PATH
  ;(stream as unknown as { headers?: Record<string, string> }).headers = { 'content-type': opts.contentType }
  return stream as unknown as IncomingMessage
}
function makeRes(): ServerResponse {
  let statusCode = 200
  let ended = false
  return {
    get statusCode() { return statusCode },
    set statusCode(v: number) { statusCode = v },
    setHeader: () => undefined,
    end: () => { ended = true },
    get ended() { return ended },
  } as unknown as ServerResponse
}

describe('T5.1 — CSP report pipeline (end-to-end)', () => {
  it('legacy report reaches audit + devtools + user hook', async () => {
    const audit = vi.fn()
    const onCspViolation = vi.fn()
    const onViolation = vi.fn()
    const body = JSON.stringify({
      'csp-report': {
        'blocked-uri': 'inline',
        'document-uri': 'https://app.example.com/p',
        'violated-directive': "script-src 'self'",
      },
    })
    const req = makeReq({ contentType: 'application/csp-report', body })
    const res = makeRes()
    await handleCspReport(req, res, {
      auditLogger: { log: audit },
      devtoolsDispatcher: { onCspViolation },
      onViolation,
    })
    expect(audit).toHaveBeenCalledTimes(1)
    expect(onCspViolation).toHaveBeenCalledTimes(1)
    expect(onViolation).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(204)
  })

  it('reports+json with multiple entries forwards each', async () => {
    const audit = vi.fn()
    const body = JSON.stringify([
      { type: 'csp-violation', url: 'https://x', body: { blockedURL: 'a', documentURL: 'b', violatedDirective: 'vd' } },
      { type: 'csp-violation', url: 'https://x', body: { blockedURL: 'c', documentURL: 'd', violatedDirective: 've' } },
    ])
    const req = makeReq({ contentType: 'application/reports+json', body })
    const res = makeRes()
    await handleCspReport(req, res, { auditLogger: { log: audit } })
    expect(audit).toHaveBeenCalledTimes(2)
  })

  it('mixed valid + invalid entries — only valid forwarded', async () => {
    const audit = vi.fn()
    const body = JSON.stringify([
      { type: 'csp-violation', url: 'https://x' /* no body */ },
      { type: 'csp-violation', url: 'https://y', body: { blockedURL: 'a', documentURL: 'b', violatedDirective: 'vd' } },
    ])
    const req = makeReq({ contentType: 'application/reports+json', body })
    const res = makeRes()
    await handleCspReport(req, res, { auditLogger: { log: audit } })
    expect(audit).toHaveBeenCalledTimes(1)
  })
})
