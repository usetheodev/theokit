import { describe, it, expect } from 'vitest'

import {
  extractTraceContext,
  generateNewTraceContext,
  injectTraceContext,
  type TraceContext,
} from '../../packages/theo/src/server/observability/trace-context-propagation.js'

const HEX_32 = /^[0-9a-f]{32}$/
const HEX_16 = /^[0-9a-f]{16}$/
const TRACEPARENT_CANONICAL = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/

describe('trace-context-propagation (T0.3)', () => {
  it('extracts a valid W3C traceparent from Headers', () => {
    const h = new Headers({
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    })
    const ctx = extractTraceContext(h)
    expect(ctx).not.toBeNull()
    expect(ctx?.trace_id).toBe('0af7651916cd43dd8448eb211c80319c')
    expect(ctx?.span_id).toBe('b7ad6b7169203331')
    expect(ctx?.flags).toBe('01')
  })

  it('returns null when traceparent header is missing', () => {
    const h = new Headers()
    expect(extractTraceContext(h)).toBeNull()
  })

  it('returns null when traceparent is malformed (no throw)', () => {
    const h = new Headers({ traceparent: 'invalid' })
    expect(extractTraceContext(h)).toBeNull()
  })

  it('returns null when trace_id is all zeros (W3C invalid)', () => {
    const h = new Headers({
      traceparent: '00-00000000000000000000000000000000-b7ad6b7169203331-01',
    })
    expect(extractTraceContext(h)).toBeNull()
  })

  it('returns null when span_id is all zeros (W3C invalid)', () => {
    const h = new Headers({
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01',
    })
    expect(extractTraceContext(h)).toBeNull()
  })

  it('injects canonical traceparent into Headers', () => {
    const h = new Headers()
    const ctx: TraceContext = {
      trace_id: '0af7651916cd43dd8448eb211c80319c',
      span_id: 'b7ad6b7169203331',
      flags: '01',
    }
    injectTraceContext(h, ctx)
    const written = h.get('traceparent')
    expect(written).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')
    expect(TRACEPARENT_CANONICAL.test(written!)).toBe(true)
  })

  it('roundtrips inject + extract preserving all fields', () => {
    const input: TraceContext = {
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      span_id: '00f067aa0ba902b7',
      flags: '00',
    }
    const h = new Headers()
    injectTraceContext(h, input)
    const out = extractTraceContext(h)
    expect(out).toEqual(input)
  })

  it('generateNewTraceContext returns a TraceContext with valid hex lengths', () => {
    const ctx = generateNewTraceContext()
    expect(HEX_32.test(ctx.trace_id)).toBe(true)
    expect(HEX_16.test(ctx.span_id)).toBe(true)
    expect(ctx.flags).toMatch(/^[0-9a-f]{2}$/)
  })

  it('generateNewTraceContext never returns the reserved all-zeros trace_id', () => {
    for (let i = 0; i < 100; i++) {
      const ctx = generateNewTraceContext()
      expect(ctx.trace_id).not.toBe('00000000000000000000000000000000')
      expect(ctx.span_id).not.toBe('0000000000000000')
    }
  })
})
