import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { parseRequestBody } from '../../packages/theo/src/server/body-parser.js'

function createMockRequest(options: {
  method?: string
  contentType?: string
  body?: string | Buffer
  headers?: Record<string, string>
}): IncomingMessage {
  const { method = 'POST', contentType, body = '', headers = {} } = options
  const stream = new PassThrough() as unknown as IncomingMessage

  stream.method = method
  stream.headers = { ...headers }
  if (contentType) {
    stream.headers['content-type'] = contentType
  }

  // Write body asynchronously
  process.nextTick(() => {
    if (body) {
      ;(stream as unknown as PassThrough).write(body)
    }
    ;(stream as unknown as PassThrough).end()
  })

  return stream
}

describe('parseRequestBody — JSON', () => {
  it('should parse JSON body correctly', async () => {
    const req = createMockRequest({
      contentType: 'application/json',
      body: JSON.stringify({ name: 'John' }),
    })

    const result = await parseRequestBody(req)

    expect(result.json).toEqual({ name: 'John' })
    expect(result.fields).toEqual({})
    expect(result.files).toEqual([])
  })

  it('should return empty result for GET requests', async () => {
    const req = createMockRequest({ method: 'GET' })

    const result = await parseRequestBody(req)

    expect(result.json).toBeUndefined()
    expect(result.fields).toEqual({})
    expect(result.files).toEqual([])
  })

  it('should reject invalid JSON', async () => {
    const req = createMockRequest({
      contentType: 'application/json',
      body: '{invalid',
    })

    await expect(parseRequestBody(req)).rejects.toThrow('Invalid JSON body')
  })
})

describe('parseRequestBody — Content-Type handling', () => {
  it('should reject unsupported content types', async () => {
    const req = createMockRequest({
      contentType: 'text/xml',
      body: '<xml/>',
    })

    await expect(parseRequestBody(req)).rejects.toThrow('Unsupported Content-Type')
  })

  it('should return empty for POST without content-type', async () => {
    const req = createMockRequest({ method: 'POST', body: '' })

    const result = await parseRequestBody(req)

    expect(result.fields).toEqual({})
    expect(result.files).toEqual([])
  })
})

describe('parseRequestBody — multipart', () => {
  // Helper to create multipart body
  function createMultipartBody(
    boundary: string,
    parts: Array<{
      name: string
      value?: string
      filename?: string
      content?: string | Buffer
      contentType?: string
    }>,
  ): Buffer {
    const lines: string[] = []
    for (const part of parts) {
      lines.push(`--${boundary}`)
      if (part.filename) {
        lines.push(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`,
        )
        lines.push(`Content-Type: ${part.contentType ?? 'application/octet-stream'}`)
        lines.push('')
        lines.push(typeof part.content === 'string' ? part.content : '')
      } else {
        lines.push(`Content-Disposition: form-data; name="${part.name}"`)
        lines.push('')
        lines.push(part.value ?? '')
      }
    }
    lines.push(`--${boundary}--`)
    return Buffer.from(lines.join('\r\n'))
  }

  it('should parse multipart fields', async () => {
    const boundary = 'testboundary123'
    const body = createMultipartBody(boundary, [
      { name: 'name', value: 'John' },
      { name: 'email', value: 'john@example.com' },
    ])

    const req = createMockRequest({
      contentType: `multipart/form-data; boundary=${boundary}`,
      body,
    })

    const result = await parseRequestBody(req)

    expect(result.fields.name).toBe('John')
    expect(result.fields.email).toBe('john@example.com')
    expect(result.files).toHaveLength(0)
  })

  it('should parse multipart file upload', async () => {
    const boundary = 'fileboundary456'
    const body = createMultipartBody(boundary, [
      { name: 'avatar', filename: 'test.txt', content: 'hello world', contentType: 'text/plain' },
    ])

    const req = createMockRequest({
      contentType: `multipart/form-data; boundary=${boundary}`,
      body,
    })

    const result = await parseRequestBody(req)

    expect(result.files).toHaveLength(1)
    expect(result.files[0].filename).toBe('test.txt')
    expect(result.files[0].mimeType).toBe('text/plain')
    expect(result.files[0].buffer.toString()).toBe('hello world')
    expect(result.files[0].size).toBe(11)
  })

  it('should parse mixed fields and files', async () => {
    const boundary = 'mixedboundary789'
    const body = createMultipartBody(boundary, [
      { name: 'name', value: 'John' },
      { name: 'avatar', filename: 'photo.png', content: 'fake-png-data', contentType: 'image/png' },
    ])

    const req = createMockRequest({
      contentType: `multipart/form-data; boundary=${boundary}`,
      body,
    })

    const result = await parseRequestBody(req)

    expect(result.fields.name).toBe('John')
    expect(result.files).toHaveLength(1)
    expect(result.files[0].filename).toBe('photo.png')
  })

  it('should reject multipart without boundary (EC-3)', async () => {
    const req = createMockRequest({
      contentType: 'multipart/form-data',
      body: 'some data',
    })

    await expect(parseRequestBody(req)).rejects.toThrow('Missing multipart boundary')
  })

  it('should reject when multipart payload is malformed (busboy error)', async () => {
    // Boundary declared in header but body lacks the matching delimiter.
    const req = createMockRequest({
      contentType: 'multipart/form-data; boundary=declaredbutmissing',
      body: '--otherboundary\r\nContent-Disposition: form-data; name="x"\r\n\r\nvalue\r\n--otherboundary--\r\n',
    })

    await expect(parseRequestBody(req)).rejects.toThrow()
  })

  it('should sanitize filenames with path traversal (EC-6)', async () => {
    const boundary = 'sanitizeboundary'
    const body = createMultipartBody(boundary, [
      {
        name: 'file',
        filename: '../../../etc/passwd',
        content: 'malicious',
        contentType: 'text/plain',
      },
    ])

    const req = createMockRequest({
      contentType: `multipart/form-data; boundary=${boundary}`,
      body,
    })

    const result = await parseRequestBody(req)

    expect(result.files[0].filename).toBe('passwd')
  })
})
