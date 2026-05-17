/**
 * Web-to-Node bridge used by adapters whose runtimes provide a `Request`
 * (Web Standard) but where TheoKit's `executeRoute` expects a Node-style
 * IncomingMessage/ServerResponse pair.
 *
 * Used by adapters that target Node-compatible runtimes (Bun, Netlify
 * Functions, AWS Lambda Node). Cloudflare uses an inline version of the same
 * pattern — long-term it should consolidate here too.
 *
 * NOT used by Deno Deploy: Deno's stdlib does not have `Buffer`/`node:http`
 * by default and forcing the shim there bloats the bundle. Deno wiring is
 * tracked separately and will likely require executeRoute to accept Web
 * Standard Request directly.
 */

export interface ShimRequest {
  method: string
  url: string
  headers: Record<string, string>
  socket: { remoteAddress: string }
  on: (event: 'data' | 'end' | 'error', cb: (chunk?: unknown) => void) => unknown
}

export interface ShimResponse {
  statusCode: number
  headersSent: boolean
  writableEnded: boolean
  writeHead: (status: number, headers?: Record<string, string>) => void
  setHeader: (key: string, value: string) => void
  getHeader: (key: string) => string | undefined
  write: (chunk: Uint8Array | string) => boolean
  end: (body?: Uint8Array | string) => void
}

export interface ShimContext {
  req: ShimRequest
  res: ShimResponse
  /** Resolves to a Web Standard Response once `res.end()` is called. */
  toResponse: () => Promise<Response>
}

/**
 * Build Node-style req/res objects around a Web Standard Request.
 * `toResponse()` returns a Promise that resolves when `res.end()` has been
 * invoked, materializing a Web Standard Response with the accumulated body
 * + headers + status.
 */
export function createWebShim(request: Request): ShimContext {
  const url = new URL(request.url)
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  const bodyChunks: Uint8Array[] = []
  let bodyConsumed = false

  // Consume the request body once, then dispatch data/end events to whatever
  // listener attaches later (executeRoute's body parser).
  const dataListeners: Array<(chunk: Uint8Array) => void> = []
  const endListeners: Array<() => void> = []
  const errorListeners: Array<(err: unknown) => void> = []

  async function pumpBody(): Promise<void> {
    if (bodyConsumed) return
    bodyConsumed = true
    if (!request.body) {
      for (const cb of endListeners) cb()
      return
    }
    try {
      const reader = request.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) for (const cb of dataListeners) cb(value)
      }
      for (const cb of endListeners) cb()
    } catch (err) {
      for (const cb of errorListeners) cb(err)
    }
  }

  const req: ShimRequest = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    socket: {
      remoteAddress:
        headers['cf-connecting-ip'] ??
        headers['x-forwarded-for'] ??
        headers['x-real-ip'] ??
        '0.0.0.0',
    },
    on(event, cb) {
      if (event === 'data') dataListeners.push(cb as (c: Uint8Array) => void)
      if (event === 'end') endListeners.push(cb as () => void)
      if (event === 'error') errorListeners.push(cb)
      // Lazily start pumping when end is registered (executeRoute always
      // listens for end before doing anything with the body).
      if (event === 'end') void pumpBody()
      return req
    },
  }

  const responseChunks: Uint8Array[] = []
  const responseHeaders: Record<string, string> = {}
  let responseStatus = 200
  let resolveResponse!: (r: Response) => void
  const responsePromise = new Promise<Response>((resolve) => {
    resolveResponse = resolve
  })

  function chunkToBytes(chunk: Uint8Array | string): Uint8Array {
    if (typeof chunk === 'string') return new TextEncoder().encode(chunk)
    return chunk
  }

  const res: ShimResponse = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    writeHead(status, headers) {
      responseStatus = status
      this.statusCode = status
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          responseHeaders[k.toLowerCase()] = v
        }
      }
      this.headersSent = true
    },
    setHeader(key, value) {
      responseHeaders[key.toLowerCase()] = value
    },
    getHeader(key) {
      return responseHeaders[key.toLowerCase()]
    },
    write(chunk) {
      responseChunks.push(chunkToBytes(chunk))
      return true
    },
    end(body) {
      if (body !== undefined) responseChunks.push(chunkToBytes(body))
      this.writableEnded = true
      const totalLength = responseChunks.reduce((n, c) => n + c.length, 0)
      const concat = new Uint8Array(totalLength)
      let offset = 0
      for (const c of responseChunks) {
        concat.set(c, offset)
        offset += c.length
      }
      resolveResponse(
        new Response(concat, {
          status: responseStatus,
          headers: responseHeaders,
        }),
      )
    },
  }

  return {
    req,
    res,
    toResponse: () => responsePromise,
  }
}
