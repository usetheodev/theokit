import { describe, it, expect } from 'vitest'
import { createWebShim } from '../../packages/theo/src/adapters/web-shim.js'

describe('createWebShim — request side', () => {
  it('exposes method, pathname, and headers', () => {
    const request = new Request('https://example.com/api/users?q=alice', {
      method: 'GET',
      headers: { 'cf-connecting-ip': '1.2.3.4', accept: 'application/json' },
    })
    const { req } = createWebShim(request)
    expect(req.method).toBe('GET')
    expect(req.url).toBe('/api/users?q=alice')
    expect(req.headers.accept).toBe('application/json')
    // Platform-injected headers (cf-connecting-ip) are trusted by default.
    expect(req.socket.remoteAddress).toBe('1.2.3.4')
  })

  it('CR-018 — default policy IGNORES x-forwarded-for (client-spoofable)', () => {
    // Client can set x-forwarded-for to anything; the default policy
    // (`platform`) must not honor it, so an attacker cannot bypass
    // IP-based rate limits.
    const request = new Request('https://example.com/api', {
      method: 'GET',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    const { req } = createWebShim(request)
    expect(req.socket.remoteAddress).toBe('0.0.0.0')
  })

  it('CR-018 — trusted-proxy policy reads the RIGHTMOST x-forwarded-for entry', () => {
    // Rightmost entry is what a trusted proxy appended; entries to the
    // left may have been forged by the client.
    const request = new Request('https://example.com/api', {
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.5, 192.0.2.7' },
    })
    const { req } = createWebShim(request, { trustedProxy: 'trusted-proxy' })
    expect(req.socket.remoteAddress).toBe('192.0.2.7')
  })

  it('CR-018 — trusted-proxy policy still prefers cf-connecting-ip when present', () => {
    const request = new Request('https://example.com/api', {
      method: 'GET',
      headers: {
        'cf-connecting-ip': '8.8.8.8',
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      },
    })
    const { req } = createWebShim(request, { trustedProxy: 'trusted-proxy' })
    expect(req.socket.remoteAddress).toBe('8.8.8.8')
  })

  it('CR-018 — "none" policy always reports 0.0.0.0', () => {
    const request = new Request('https://example.com/api', {
      method: 'GET',
      headers: {
        'cf-connecting-ip': '8.8.8.8',
        'x-forwarded-for': '1.2.3.4',
      },
    })
    const { req } = createWebShim(request, { trustedProxy: 'none' })
    expect(req.socket.remoteAddress).toBe('0.0.0.0')
  })

  it('emits data + end events when a listener attaches', async () => {
    const request = new Request('https://example.com/upload', {
      method: 'POST',
      body: 'hello',
      headers: { 'content-type': 'text/plain' },
    })
    const { req } = createWebShim(request)
    const chunks: Uint8Array[] = []
    await new Promise<void>((resolve) => {
      req.on('data', (c) => chunks.push(c as Uint8Array))
      req.on('end', () => resolve())
    })
    const joined = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8')
    expect(joined).toBe('hello')
  })
})

describe('createWebShim — response side', () => {
  it('captures statusCode, headers and body into a Web Response', async () => {
    const request = new Request('https://example.com/api')
    const { res, toResponse } = createWebShim(request)
    res.writeHead(201, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    const response = await toResponse()
    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toBe('application/json')
    const body = await response.json()
    expect(body).toEqual({ ok: true })
  })

  it('supports setHeader + write + end flow', async () => {
    const request = new Request('https://example.com/api')
    const { res, toResponse } = createWebShim(request)
    res.setHeader('X-Custom', 'one')
    res.statusCode = 200
    res.write('hello ')
    res.end('world')
    const response = await toResponse()
    expect(response.headers.get('x-custom')).toBe('one')
    expect(await response.text()).toBe('hello world')
  })

  it('marks writableEnded after end()', async () => {
    const request = new Request('https://example.com')
    const { res, toResponse } = createWebShim(request)
    expect(res.writableEnded).toBe(false)
    res.end('done')
    expect(res.writableEnded).toBe(true)
    await toResponse() // drain to avoid unresolved-promise leak
  })

  it('preserves binary bodies (Uint8Array)', async () => {
    const request = new Request('https://example.com')
    const { res, toResponse } = createWebShim(request)
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
    res.end(bytes)
    const response = await toResponse()
    const buf = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(buf)).toEqual([0xde, 0xad, 0xbe, 0xef])
  })
})
