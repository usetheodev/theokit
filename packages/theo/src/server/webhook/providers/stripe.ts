import { createHmac } from 'node:crypto'

import { timingSafeEqual } from '../timing-safe-equal.js'
import type { VerifyFn, VerifyResult } from '../webhook-types.js'

/**
 * Stripe webhook signature verification per official spec.
 *
 * Header format: `stripe-signature: t=<ts>, v1=<sig1>[, v1=<sig2>]...`
 * Basestring: `${t}.${rawBody}`
 * Algorithm: HMAC-SHA256(secret, basestring) → hex
 *
 * Multi-key (rotation): pass `secret` as `string[]` — verifier tries each
 * until one matches (or all fail).
 *
 * Replay window: `toleranceSeconds` (default 300 = 5 min, matching
 * stripe-node defaults). Requests outside the window return `{ ok: false,
 * reason: 'timestamp out of tolerance' }`.
 *
 * @see https://docs.stripe.com/webhooks/signatures
 */

export interface StripeWebhookOptions {
  /** Webhook signing secret (`whsec_...`). Pass array for key rotation. */
  secret: string | readonly string[]
  /** Replay window in seconds. Default 300 (5 minutes). */
  toleranceSeconds?: number
}

interface ParsedHeader {
  timestamp: number
  signatures: string[]
}

function parseStripeHeader(header: string): ParsedHeader | null {
  const parts = header.split(',').map((p) => p.trim())
  let timestamp: number | null = null
  const signatures: string[] = []
  let tCount = 0
  for (const part of parts) {
    const [key, value] = part.split('=', 2)
    if (key === 't') {
      tCount++
      timestamp = Number.parseInt(value, 10)
      if (!Number.isFinite(timestamp)) return null
    } else if (key === 'v1') {
      signatures.push(value)
    }
  }
  // EC-4: malformed header with multiple t= is invalid per Stripe spec
  if (tCount !== 1) return null
  if (timestamp === null) return null
  if (signatures.length === 0) return null
  return { timestamp, signatures }
}

function expectedSig(secret: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

const enc = new TextEncoder()
const fromHex = (hex: string): Uint8Array | null => {
  if (hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) return null
    bytes[i] = byte
  }
  return bytes
}

export function stripe(opts: StripeWebhookOptions): VerifyFn {
  const tolerance = opts.toleranceSeconds ?? 300
  const secrets: readonly string[] = Array.isArray(opts.secret)
    ? opts.secret
    : [opts.secret as string]

  return async (req: Request): Promise<VerifyResult> => {
    const header = req.headers.get('stripe-signature')
    if (!header) {
      return { ok: false, reason: 'missing stripe-signature header' }
    }
    const parsed = parseStripeHeader(header)
    if (!parsed) {
      return { ok: false, reason: 'malformed stripe-signature header' }
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const delta = Math.abs(nowSeconds - parsed.timestamp)
    if (delta > tolerance) {
      return {
        ok: false,
        reason: `timestamp out of tolerance window (delta=${delta}s, tolerance=${tolerance}s)`,
      }
    }

    const rawBody = await req.text()

    for (const secret of secrets) {
      const expectedHex = expectedSig(secret, parsed.timestamp, rawBody)
      const expectedBytes = fromHex(expectedHex)
      if (!expectedBytes) continue
      for (const sig of parsed.signatures) {
        const sigBytes = fromHex(sig)
        if (!sigBytes) continue
        if (sigBytes.length !== expectedBytes.length) continue
        if (timingSafeEqual(sigBytes, expectedBytes)) {
          return { ok: true }
        }
      }
    }

    return { ok: false, reason: 'signature mismatch' }
  }
}

// Re-export to make the enc constant non-orphan for tree-shaking purposes;
// importing TextEncoder via `enc` makes the bundle pre-warm a single decoder.
// (Kept for symmetry with Slack/GitHub helpers which use it directly.)
export const __stripeInternalEnc = enc
