import type { IncomingMessage } from 'node:http'
import { basename } from 'node:path'

import Busboy from 'busboy'

// --- Types ---

export interface UploadedFile {
  fieldname: string
  filename: string
  encoding: string
  mimeType: string
  buffer: Buffer
  size: number
}

export interface ParsedBody {
  fields: Record<string, string>
  files: UploadedFile[]
  json?: unknown
}

export interface BodyParserOptions {
  maxFileSize?: number // bytes, default 10MB
  maxFiles?: number // default 10
  maxFieldSize?: number // bytes, default 1MB
}

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH'])

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const DEFAULT_MAX_FILES = 10
const DEFAULT_MAX_FIELD_SIZE = 1 * 1024 * 1024 // 1MB

export class FileTooLargeError extends Error {
  readonly code = 'FILE_TOO_LARGE'
  readonly status = 413
  constructor(
    message: string,
    readonly truncatedFilenames: string[],
    readonly maxFileSize: number,
  ) {
    super(message)
    this.name = 'FileTooLargeError'
  }
}

// --- JSON parsing ---

function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString()
      if (!raw) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

// --- Multipart parsing ---

function parseMultipartBody(
  req: IncomingMessage,
  contentType: string,
  options: Required<Pick<BodyParserOptions, 'maxFileSize' | 'maxFiles' | 'maxFieldSize'>>,
): Promise<{ fields: Record<string, string>; files: UploadedFile[] }> {
  // EC-3: Validate boundary exists.
  if (!contentType.includes('boundary=')) {
    return Promise.reject(new Error('Missing multipart boundary'))
  }

  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    const files: UploadedFile[] = []
    // CR-010: track filenames that were truncated mid-stream. The previous
    // implementation skipped truncated files from `files` and relied on
    // `files.some(f => f.size > maxFileSize)` to detect — but since the
    // file was never added, the guard never fired. Silent data loss.
    const truncatedFilenames: string[] = []
    let fileCount = 0

    const bb = Busboy({
      headers: req.headers,
      limits: {
        fileSize: options.maxFileSize,
        files: options.maxFiles,
        fieldSize: options.maxFieldSize,
      },
    })

    bb.on('field', (name: string, value: string) => {
      fields[name] = value
    })

    bb.on(
      'file',
      (
        fieldname: string,
        stream: NodeJS.ReadableStream,
        info: { filename: string; encoding: string; mimeType: string },
      ) => {
        fileCount++
        if (fileCount > options.maxFiles) {
          stream.resume() // drain
          return
        }

        // EC-6: Sanitize filename — basename only, no path traversal.
        const safeName = basename(info.filename || 'unnamed')
        const chunks: Buffer[] = []
        let size = 0
        let truncated = false

        stream.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > options.maxFileSize) {
            truncated = true
            stream.resume() // drain the rest
            return
          }
          chunks.push(chunk)
        })

        stream.on('end', () => {
          if (truncated) {
            truncatedFilenames.push(safeName)
            return
          }

          const buffer = Buffer.concat(chunks)
          files.push({
            fieldname,
            filename: safeName,
            encoding: info.encoding,
            mimeType: info.mimeType,
            buffer,
            size: buffer.length,
          })
        })
      },
    )

    bb.on('filesLimit', () => {
      reject(new Error(`Too many files. Maximum: ${options.maxFiles}`))
    })

    bb.on('error', (err: Error) => {
      reject(err)
    })

    bb.on('close', () => {
      if (truncatedFilenames.length > 0) {
        reject(
          new FileTooLargeError(
            `File too large (max ${options.maxFileSize} bytes): ${truncatedFilenames.join(', ')}`,
            truncatedFilenames,
            options.maxFileSize,
          ),
        )
        return
      }
      resolve({ fields, files })
    })

    req.pipe(bb)
  })
}

// --- Main parser ---

export async function parseRequestBody(
  req: IncomingMessage,
  options?: BodyParserOptions,
): Promise<ParsedBody> {
  const method = req.method?.toUpperCase() ?? 'GET'
  if (!METHODS_WITH_BODY.has(method)) {
    return { fields: {}, files: [], json: undefined }
  }

  const contentType = req.headers['content-type'] ?? ''

  // JSON
  if (contentType.includes('application/json')) {
    const json = await parseJsonBody(req)
    return { fields: {}, files: [], json }
  }

  // Multipart
  if (contentType.includes('multipart/form-data')) {
    const limits = {
      maxFileSize: options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      maxFiles: options?.maxFiles ?? DEFAULT_MAX_FILES,
      maxFieldSize: options?.maxFieldSize ?? DEFAULT_MAX_FIELD_SIZE,
    }
    const { fields, files } = await parseMultipartBody(req, contentType, limits)
    return { fields, files }
  }

  // No body or empty
  if (!contentType) {
    return { fields: {}, files: [] }
  }

  // Unsupported content type
  throw new Error(`Unsupported Content-Type: ${contentType}`)
}
