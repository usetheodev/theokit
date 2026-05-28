import { describe, it, expect } from 'vitest'
import { parseWebRequestBody } from '../../packages/theo/src/server/body-parser-web.js'

describe('parseWebRequestBody (T5.1)', () => {
  it('extracts JSON body when content-type is application/json', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '7' },
      body: '{"a":1}',
    })
    const result = await parseWebRequestBody(req)
    expect(result.json).toEqual({ a: 1 })
  })

  it('extracts fields + files from multipart form-data', async () => {
    const form = new FormData()
    form.append('name', 'Alice')
    form.append('file', new Blob(['content'], { type: 'text/plain' }), 'note.txt')
    const req = new Request('http://x', {
      method: 'POST',
      body: form,
    })
    const result = await parseWebRequestBody(req)
    expect(result.fields).toEqual({ name: 'Alice' })
    expect(result.files).toHaveLength(1)
    expect(result.files[0].filename).toBe('note.txt')
  })

  it('rejects body exceeding max via Content-Length pre-check (EC-4)', async () => {
    // Spoof very large Content-Length header (don't actually allocate)
    const req = new Request('http://x', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '2000000000', // 2GB declared
      },
      body: '{}',
    })
    await expect(parseWebRequestBody(req, { maxFileSize: 10, maxFiles: 1 })).rejects.toThrow(
      /too large/i,
    )
  })

  it('handles empty body gracefully', async () => {
    const req = new Request('http://x', { method: 'POST' })
    const result = await parseWebRequestBody(req)
    expect(result.json).toBeUndefined()
    expect(result.fields).toEqual({})
    expect(result.files).toEqual([])
  })

  it('returns idempotent result for same request (EC-12 cache)', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '7' },
      body: '{"a":1}',
    })
    const first = await parseWebRequestBody(req)
    const second = await parseWebRequestBody(req)
    expect(first).toBe(second) // same object reference (cached)
  })
})
