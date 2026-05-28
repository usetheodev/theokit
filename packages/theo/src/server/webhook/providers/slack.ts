import { createHmac } from 'node:crypto'

import { timingSafeEqual } from '../timing-safe-equal.js'
import type { VerifyFn, VerifyResult } from '../webhook-types.js'

/**
 * Slack webhook signature verification per official spec.
 *
 * Headers: `X-Slack-Request-Timestamp: <ts>` + `X-Slack-Signature: v0=<hex>`
 * Basestring: `v0:${ts}:${rawBody}`
 * Algorithm: HMAC-SHA256(signingSecret, basestring) → hex → `v0=<hex>`
 *
 * Replay window: `toleranceSeconds` (default 300 = 5 min, matching
 * bolt-js + Slack official guidance).
 *
 * No multi-key rotation (Slack doesn't support it natively — each app
 * has one signing secret).
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */

export interface SlackWebhookOptions {
  /** Slack app's Signing Secret. */
  signingSecret: string
  /** Replay window in seconds. Default 300 (5 minutes). */
  toleranceSeconds?: number
}

const PREFIX = 'v0='

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

export function slack(opts: SlackWebhookOptions): VerifyFn {
  const tolerance = opts.toleranceSeconds ?? 300
  const signingSecret = opts.signingSecret

  return async (req: Request): Promise<VerifyResult> => {
    const tsHeader = req.headers.get('x-slack-request-timestamp')
    const sigHeader = req.headers.get('x-slack-signature')
    if (!tsHeader) {
      return { ok: false, reason: 'missing x-slack-request-timestamp header' }
    }
    if (!sigHeader) {
      return { ok: false, reason: 'missing x-slack-signature header' }
    }
    if (!sigHeader.startsWith(PREFIX)) {
      return { ok: false, reason: 'malformed x-slack-signature header (missing v0= prefix)' }
    }

    const ts = Number.parseInt(tsHeader, 10)
    if (!Number.isFinite(ts)) {
      return { ok: false, reason: 'malformed x-slack-request-timestamp' }
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const delta = Math.abs(nowSeconds - ts)
    if (delta > tolerance) {
      return {
        ok: false,
        reason: `timestamp out of tolerance window (delta=${delta}s, tolerance=${tolerance}s)`,
      }
    }

    const rawBody = await req.text()
    const base = `v0:${ts}:${rawBody}`
    const expectedHex = createHmac('sha256', signingSecret).update(base).digest('hex')
    const expectedBytes = fromHex(expectedHex)
    if (!expectedBytes) {
      return { ok: false, reason: 'failed to compute expected signature' }
    }

    const sigHex = sigHeader.slice(PREFIX.length)
    const sigBytes = fromHex(sigHex)
    if (!sigBytes) {
      return { ok: false, reason: 'malformed signature hex' }
    }
    if (sigBytes.length !== expectedBytes.length) {
      return { ok: false, reason: 'signature mismatch' }
    }
    if (timingSafeEqual(sigBytes, expectedBytes)) {
      return { ok: true }
    }
    return { ok: false, reason: 'signature mismatch' }
  }
}
