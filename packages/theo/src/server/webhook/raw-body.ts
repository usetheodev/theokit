/**
 * Read a Web `Request` body as a raw string EXACTLY ONCE and expose it
 * alongside the original request (which remains readable by downstream
 * code). Enforces a configurable `maxBodyBytes` cap to prevent OOM via
 * pathological POST.
 *
 * MUST be called FIRST in the webhook pipeline, before any other code
 * touches the body (`request.text()`, `request.json()`, parsers). Once
 * the body is consumed, `Request.clone()` throws and this function fails.
 *
 * EC-101: default `maxBodyBytes = 1_000_000` (1 MB) covers Stripe
 * (256 KB max), Slack (4 MB but compressed), and is well below Node
 * memory thresholds. GitHub webhooks up to 25 MB MUST opt in
 * (`maxBodyBytes: 25_000_000`).
 *
 * @see https://docs.stripe.com/webhooks/signatures
 * @see https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
 */

export const DEFAULT_MAX_BODY_BYTES = 1_000_000

export interface ReadRawBodyOptions {
  /** Maximum bytes to read before throwing `BodyTooLargeError`. Defaults to 1 MB. */
  maxBodyBytes?: number
}

export interface RawBodyResult {
  /** UTF-8 decoded body (or empty string when no body present). */
  rawBody: string
  /** The ORIGINAL request, still readable by downstream code. */
  bodyClone: Request
}

/**
 * Thrown when the request body exceeds `maxBodyBytes`. Carries status
 * 413 (Payload Too Large) and stable code `BODY_TOO_LARGE` so callers
 * can map it to an HTTP response without sniffing the message.
 */
export class BodyTooLargeError extends Error {
  readonly status = 413
  readonly code = 'BODY_TOO_LARGE'

  constructor(
    public readonly limit: number,
    public readonly actualSeen: number,
  ) {
    super(`Request body exceeds maxBodyBytes: seen ${actualSeen} bytes, limit ${limit} bytes`)
    this.name = 'BodyTooLargeError'
  }
}

export async function readRawBody(
  request: Request,
  options: ReadRawBodyOptions = {},
): Promise<RawBodyResult> {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  // Clone the request so the original remains readable. `.clone()` throws
  // synchronously (TypeError) if the body was already consumed — we let
  // that propagate so callers fail fast with a clear error.
  const clone = request.clone()

  // No body at all (GET, HEAD, or empty POST). Both clone.body and
  // clone.text() handle this gracefully but we short-circuit for clarity
  // and to avoid an unnecessary stream read.
  if (clone.body === null) {
    return { rawBody: '', bodyClone: request }
  }

  const reader = clone.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBodyBytes) {
        // Cancel the stream without awaiting (avoids deadlock on some
        // ReadableStream impls). The finally block releases the lock.
        void reader.cancel()
        throw new BodyTooLargeError(maxBodyBytes, total)
      }
      chunks.push(value)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // lock may already be released by cancel()
    }
  }

  // Concat all chunks into a single Uint8Array, then UTF-8 decode.
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const rawBody = new TextDecoder().decode(bytes)

  return { rawBody, bodyClone: request }
}
