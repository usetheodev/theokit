import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'

import { serveStaticFile } from '../../packages/theo/src/server/static.js'

/**
 * Direct unit tests for `serveStaticFile` — exercises the branches not
 * reached by integration tests:
 *   - path-traversal 403
 *   - missing file (returns false)
 *   - directory-as-path (stat.isFile() === false → returns false)
 *   - unknown extension → application/octet-stream fallback
 */

function makeMockRes() {
  const chunks: Buffer[] = []
  let statusCode = 200
  const headers: Record<string, string | number | string[]> = {}
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      cb()
    },
  })
  // Mimic ServerResponse's writeHead / end shape.
  ;(stream as unknown as ServerResponse).writeHead = ((
    status: number,
    h?: Record<string, string | number>,
  ) => {
    statusCode = status
    if (h) Object.assign(headers, h)
    return stream as unknown as ServerResponse
  }) as ServerResponse['writeHead']
  ;(stream as unknown as ServerResponse).setHeader = (
    name: string,
    value: string | number | string[],
  ) => {
    headers[name] = value
    return stream as unknown as ServerResponse
  }
  ;(stream as unknown as ServerResponse).getHeader = (name: string) => headers[name]
  return {
    res: stream as unknown as ServerResponse,
    getStatus: () => statusCode,
    getHeaders: () => headers,
    getBody: () => Buffer.concat(chunks),
  }
}

function makeMockReq(url: string): IncomingMessage {
  return { url, method: 'GET', headers: {} } as IncomingMessage
}

describe('serveStaticFile', () => {
  let clientDir: string

  beforeAll(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'serve-static-'))
    writeFileSync(join(clientDir, 'index.html'), '<!doctype html><title>x</title>')
    writeFileSync(join(clientDir, 'app.unknownext'), 'raw bytes')
    mkdirSync(join(clientDir, 'subdir'))
  })

  afterAll(() => {
    rmSync(clientDir, { recursive: true, force: true })
  })

  it('Given a known extension, Then serves with correct MIME', () => {
    const { res, getStatus, getHeaders } = makeMockRes()
    const handled = serveStaticFile(makeMockReq('/index.html'), res, clientDir)
    expect(handled).toBe(true)
    expect(getStatus()).toBe(200)
    expect(getHeaders()['Content-Type']).toBe('text/html')
  })

  it('Given an unknown extension, Then falls back to application/octet-stream', () => {
    const { res, getStatus, getHeaders } = makeMockRes()
    const handled = serveStaticFile(makeMockReq('/app.unknownext'), res, clientDir)
    expect(handled).toBe(true)
    expect(getStatus()).toBe(200)
    expect(getHeaders()['Content-Type']).toBe('application/octet-stream')
  })

  it('Given a missing file, Then returns false without writing the response', () => {
    const { res, getBody } = makeMockRes()
    const handled = serveStaticFile(makeMockReq('/does-not-exist.css'), res, clientDir)
    expect(handled).toBe(false)
    expect(getBody().byteLength).toBe(0)
  })

  it('Given a directory path, Then returns false (not a regular file)', () => {
    const { res, getBody } = makeMockRes()
    const handled = serveStaticFile(makeMockReq('/subdir'), res, clientDir)
    expect(handled).toBe(false)
    expect(getBody().byteLength).toBe(0)
  })

  it('Given a path-traversal attempt, Then responds 403 and stops processing', () => {
    const { res, getStatus, getBody } = makeMockRes()
    const handled = serveStaticFile(makeMockReq('/../../../etc/passwd'), res, clientDir)
    expect(handled).toBe(true)
    expect(getStatus()).toBe(403)
    expect(getBody().toString()).toBe('Forbidden')
  })

  it('Given a URL with query string, Then strips the query before resolving', () => {
    const { res, getStatus, getHeaders } = makeMockRes()
    const handled = serveStaticFile(makeMockReq('/index.html?v=42'), res, clientDir)
    expect(handled).toBe(true)
    expect(getStatus()).toBe(200)
    expect(getHeaders()['Content-Type']).toBe('text/html')
  })

  it('Given req.url is undefined, Then resolves to the client root', () => {
    const { res } = makeMockRes()
    // root resolves to a directory which is not a file — returns false
    const req = { url: undefined, method: 'GET', headers: {} } as unknown as IncomingMessage
    const handled = serveStaticFile(req, res, clientDir)
    expect(handled).toBe(false)
  })
})
