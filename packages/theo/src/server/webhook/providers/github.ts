import { createHmac } from 'node:crypto'

import { timingSafeEqual } from '../timing-safe-equal.js'
import type { VerifyFn, VerifyResult } from '../webhook-types.js'

/**
 * GitHub webhook signature verification per official spec.
 *
 * Header: `X-Hub-Signature-256: sha256=<hex>`
 * Algorithm: HMAC-SHA256(secret, rawBody) → hex
 *
 * No timestamp → no replay window. Replay protection is the caller's
 * responsibility (idempotent handler).
 *
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */

export interface GitHubWebhookOptions {
  /** Webhook secret. Pass array for key rotation. */
  secret: string | readonly string[]
}

const PREFIX = 'sha256='

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) return null
    bytes[i] = byte
  }
  return bytes
}

export function github(opts: GitHubWebhookOptions): VerifyFn {
  const secrets: readonly string[] = Array.isArray(opts.secret)
    ? opts.secret
    : [opts.secret as string]

  return async (req: Request): Promise<VerifyResult> => {
    const header = req.headers.get('x-hub-signature-256')
    if (!header) {
      return { ok: false, reason: 'missing x-hub-signature-256 header' }
    }
    if (!header.startsWith(PREFIX)) {
      return { ok: false, reason: 'malformed x-hub-signature-256 header (missing sha256= prefix)' }
    }
    const sigHex = header.slice(PREFIX.length)
    const sigBytes = fromHex(sigHex)
    if (!sigBytes) {
      return { ok: false, reason: 'malformed signature hex' }
    }

    const rawBody = await req.text()

    for (const secret of secrets) {
      const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex')
      const expectedBytes = fromHex(expectedHex)
      if (!expectedBytes) continue
      if (sigBytes.length !== expectedBytes.length) continue
      if (timingSafeEqual(sigBytes, expectedBytes)) {
        return { ok: true }
      }
    }

    return { ok: false, reason: 'signature mismatch' }
  }
}
