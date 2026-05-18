import { describe, it, expect } from 'vitest'
import {
  extractTraceId,
  parseTraceparent,
  TRACE_HEADER,
  TRACE_PARENT_HEADER,
} from '../../packages/theo/src/server/trace-context.js'

/**
 * Phase 7 — Observability — TraceId propagation (D7).
 *
 * Every request gets a stable, propagateable trace identifier:
 *   1. If `traceparent` header is present and well-formed (W3C Trace
 *      Context: `00-{trace-id}-{span-id}-{flags}`), extract the 32-hex
 *      trace-id.
 *   2. Else, fall back to `x-request-id` (Heroku / GCP / generic).
 *   3. Else, generate a UUID. UUID is acceptable as a traceId in every
 *      vendor that doesn't require strict 32-hex (Datadog, Honeycomb,
 *      Sentry — all accept).
 *
 * The extracted value is attached to `ctx.traceId`, logged on every
 * line, set as `x-trace-id` on the response, and included in every
 * error envelope under both `traceId` (new) and `requestId` (backward
 * compat alias).
 */

interface FakeReq {
  headers: Record<string, string | string[] | undefined>
  method?: string
  url?: string
}

function makeReq(headers: FakeReq['headers'] = {}): FakeReq {
  return { headers, method: 'GET', url: '/' }
}

describe('parseTraceparent — W3C Trace Context format', () => {
  it('Given a well-formed traceparent, Then returns the 32-hex trace-id', () => {
    const v = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    expect(parseTraceparent(v)).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
  })

  it('Given a wrong version byte, Then returns null (only `00` supported)', () => {
    const v = '99-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    expect(parseTraceparent(v)).toBeNull()
  })

  it('Given the trace-id of all zeroes, Then returns null (W3C reserved invalid)', () => {
    const v = '00-00000000000000000000000000000000-00f067aa0ba902b7-01'
    expect(parseTraceparent(v)).toBeNull()
  })

  it('Given a malformed string, Then returns null', () => {
    expect(parseTraceparent('not-a-traceparent')).toBeNull()
    expect(parseTraceparent('')).toBeNull()
    expect(parseTraceparent('00-short-')).toBeNull()
  })

  it('Constants TRACE_HEADER + TRACE_PARENT_HEADER are exported', () => {
    expect(TRACE_HEADER).toBe('x-trace-id')
    expect(TRACE_PARENT_HEADER).toBe('traceparent')
  })
})

describe('extractTraceId — header precedence', () => {
  it('Given a valid traceparent header, Then returns the W3C trace-id', () => {
    const req = makeReq({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    })
    expect(extractTraceId(req as never)).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
  })

  it('Given no traceparent + x-request-id header, Then returns the x-request-id value', () => {
    const req = makeReq({ 'x-request-id': 'req-abc-123' })
    expect(extractTraceId(req as never)).toBe('req-abc-123')
  })

  it('Given malformed traceparent + valid x-request-id, Then falls back to x-request-id', () => {
    const req = makeReq({
      traceparent: 'bogus-value',
      'x-request-id': 'req-fallback',
    })
    expect(extractTraceId(req as never)).toBe('req-fallback')
  })

  it('Given an array x-request-id (proxy doubled the header), Then takes the first value', () => {
    const req = makeReq({ 'x-request-id': ['req-1', 'req-2'] })
    expect(extractTraceId(req as never)).toBe('req-1')
  })

  it('Given no relevant headers, Then generates a non-empty string', () => {
    const id = extractTraceId(makeReq() as never)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('Generated traceIds are unique across calls', () => {
    const a = extractTraceId(makeReq() as never)
    const b = extractTraceId(makeReq() as never)
    expect(a).not.toBe(b)
  })

  it('Given empty string headers, Then treats as absent and generates', () => {
    const req = makeReq({ traceparent: '', 'x-request-id': '' })
    const id = extractTraceId(req as never)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})
