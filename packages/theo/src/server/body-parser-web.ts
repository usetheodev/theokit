/**
 * T5.1 — Web Standards body parser for non-Node runtimes (Bun, Deno, edge).
 *
 * Uses `request.formData()` for multipart and `request.json()`/`text()` for
 * JSON/text. EC-4: Content-Length pre-check prevents OOM. EC-12: per-Request
 * cache via WeakMap so multiple parse calls on the same Request are idempotent.
 */

export interface ParsedWebBody {
  json?: unknown
  fields: Record<string, string>
  files: {
    fieldName: string
    filename: string
    contentType: string
    size: number
    buffer: Uint8Array
  }[]
}

export interface WebBodyParserOptions {
  maxFileSize?: number
  maxFiles?: number
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const DEFAULT_MAX_FILES = 10
const SAFETY_MARGIN = 1_048_576 // 1MB encoding overhead

export class RequestBodyTooLargeError extends Error {
  constructor(declared: number, max: number) {
    super(`Request body too large: declared Content-Length ${declared} exceeds max ${max}`)
    this.name = 'RequestBodyTooLargeError'
  }
}

// EC-12 cache — idempotent parse per Request
const parseCache = new WeakMap<Request, Promise<ParsedWebBody>>()

export function parseWebRequestBody(
  request: Request,
  options: WebBodyParserOptions = {},
): Promise<ParsedWebBody> {
  const cached = parseCache.get(request)
  if (cached) return cached
  const promise = parseImpl(request, options)
  parseCache.set(request, promise)
  return promise
}

async function parseImpl(request: Request, options: WebBodyParserOptions): Promise<ParsedWebBody> {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
  const maxTotal = maxFileSize * maxFiles + SAFETY_MARGIN

  // EC-4 — Content-Length pre-check before materializing body
  const cl = Number(request.headers.get('content-length') ?? '0')
  if (cl > maxTotal) {
    throw new RequestBodyTooLargeError(cl, maxTotal)
  }

  const empty: ParsedWebBody = { fields: {}, files: [] }
  if (!request.body) return empty

  const ct = (request.headers.get('content-type') ?? '').toLowerCase()
  if (ct.includes('application/json')) {
    const text = await request.text()
    if (!text) return empty
    return { ...empty, json: JSON.parse(text) }
  }

  if (ct.includes('multipart/form-data')) {
    const form = await request.formData()
    const fields: Record<string, string> = {}
    const files: ParsedWebBody['files'] = []
    let fileCount = 0
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') {
        fields[key] = value
      } else {
        if (++fileCount > maxFiles) {
          throw new Error(`Too many files: max ${maxFiles}`)
        }
        if (value.size > maxFileSize) {
          throw new Error(`File ${value.name} exceeds maxFileSize ${maxFileSize}`)
        }
        const buf = new Uint8Array(await value.arrayBuffer())
        files.push({
          fieldName: key,
          filename: value.name,
          contentType: value.type,
          size: value.size,
          buffer: buf,
        })
      }
    }
    return { fields, files }
  }

  return empty
}
