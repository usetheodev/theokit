import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  deserializeFetchResponse,
  __resetMismatchWarningForTests,
} from '../../packages/theo/src/client/theo-fetch.js'

describe('deserializeFetchResponse (T1.3)', () => {
  beforeEach(() => {
    __resetMismatchWarningForTests()
  })

  it('uses JSON.parse when no transformer name in header (default)', () => {
    const result = deserializeFetchResponse(
      '{"a":1}',
      null, // no x-theo-transformer header
      'json', // client configured for json
    )
    expect(result).toEqual({ a: 1 })
  })

  it('uses superjson when header and client both indicate superjson', () => {
    const wrapped = JSON.stringify({
      json: { when: '2026-05-17T12:00:00.000Z' },
      meta: { values: { when: ['Date'] } },
    })
    const result = deserializeFetchResponse(wrapped, 'superjson', 'superjson')
    expect((result as { when: Date }).when).toBeInstanceOf(Date)
  })

  it('warns once on mismatch and falls back to JSON.parse', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // server says superjson, client built with json
    deserializeFetchResponse('{"a":1}', 'superjson', 'json')
    deserializeFetchResponse('{"b":2}', 'superjson', 'json')
    deserializeFetchResponse('{"c":3}', 'superjson', 'json')
    // warning fired exactly once (EC-6)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('handles empty body gracefully', () => {
    const result = deserializeFetchResponse('', null, 'json')
    expect(result).toBeNull()
  })

  it('propagates deserialize errors with transformer name (EC)', () => {
    expect(() => deserializeFetchResponse('not-valid-json', null, 'json')).toThrow()
  })
})
