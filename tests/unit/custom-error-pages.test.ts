import { describe, it, expect, vi } from 'vitest'
import type { ServerResponse } from 'node:http'
import { sendError } from '../../packages/theo/src/server/http/execute.js'
import {
  loadCustomErrorPages,
  MAX_ERROR_HTML_BYTES,
} from '../../packages/theo/src/server/http/error-pages.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

function createMockRes(): ServerResponse & {
  _getStatus: () => number
  _getBody: () => string
  _getHeader: (k: string) => string | undefined
} {
  let status = 0
  let body = ''
  const headers: Record<string, string> = {}
  const res = {
    writeHead: vi.fn((s: number, hdrs?: Record<string, string>) => {
      status = s
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k.toLowerCase()] = v
        }
      }
    }),
    write: vi.fn(),
    end: vi.fn((b?: string) => {
      if (b) body = b
    }),
    setHeader: vi.fn((k: string, v: string) => {
      headers[k.toLowerCase()] = v
    }),
    getHeader: vi.fn((k: string) => headers[k.toLowerCase()]),
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    _getStatus: () => status,
    _getBody: () => body,
    _getHeader: (k: string) => headers[k.toLowerCase()],
  } as unknown as ServerResponse & {
    _getStatus: () => number
    _getBody: () => string
    _getHeader: (k: string) => string | undefined
  }
  return res
}

describe('sendError with custom HTML (T2.4)', () => {
  it('uses custom 404 HTML when status is 404 and html provided', () => {
    const res = createMockRes()
    sendError(res, 'NOT_FOUND', 'gone', 404, undefined, 'req-1', {
      custom404Html: '<h1>Custom 404</h1>',
    })
    expect(res._getStatus()).toBe(404)
    expect(res._getHeader('content-type')).toMatch(/text\/html/)
    expect(res._getBody()).toBe('<h1>Custom 404</h1>')
  })

  it('uses custom 500 HTML when status is 500 and html provided', () => {
    const res = createMockRes()
    sendError(res, 'INTERNAL_ERROR', 'boom', 500, undefined, 'req-2', {
      custom500Html: '<h1>Custom 500</h1>',
    })
    expect(res._getStatus()).toBe(500)
    expect(res._getHeader('content-type')).toMatch(/text\/html/)
    expect(res._getBody()).toBe('<h1>Custom 500</h1>')
  })

  it('falls back to JSON when custom HTML absent (backward compat)', () => {
    const res = createMockRes()
    sendError(res, 'NOT_FOUND', 'gone', 404, undefined, 'req-3')
    expect(JSON.parse(res._getBody()).error.code).toBe('NOT_FOUND')
  })

  it('does NOT use custom HTML for status outside 4xx/5xx', () => {
    const res = createMockRes()
    sendError(res, 'BAD_REQUEST', 'wat', 400, undefined, 'req-4', {
      custom404Html: '<h1>404</h1>',
    })
    expect(res._getBody()).toMatch(/BAD_REQUEST/)
  })
})

describe('loadCustomErrorPages — file loader', () => {
  it('returns empty when client dir has no error pages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'theo-errs-'))
    try {
      const result = loadCustomErrorPages(dir)
      expect(result.custom404Html).toBeUndefined()
      expect(result.custom500Html).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('loads 404.html and 500.html when present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'theo-errs-'))
    try {
      writeFileSync(resolve(dir, '404.html'), '<h1>Custom 404</h1>')
      writeFileSync(resolve(dir, '500.html'), '<h1>Custom 500</h1>')
      const result = loadCustomErrorPages(dir)
      expect(result.custom404Html).toBe('<h1>Custom 404</h1>')
      expect(result.custom500Html).toBe('<h1>Custom 500</h1>')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips files larger than MAX_ERROR_HTML_BYTES with warning (EC-9)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'theo-errs-'))
    try {
      const huge = 'x'.repeat(MAX_ERROR_HTML_BYTES + 1)
      writeFileSync(resolve(dir, '404.html'), huge)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = loadCustomErrorPages(dir)
      expect(result.custom404Html).toBeUndefined()
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
