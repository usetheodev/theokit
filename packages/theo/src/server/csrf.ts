import type { IncomingMessage } from 'node:http'

export function validateCsrf(
  req: IncomingMessage,
): { valid: true } | { valid: false; reason: string } {
  // 1. Custom header must be present (primary defense)
  if (req.headers['x-theo-action'] !== '1') {
    return { valid: false, reason: 'Missing X-Theo-Action header' }
  }

  // 2. Origin matching (secondary defense)
  const origin = req.headers['origin']
  if (!origin) {
    // Browsers omit Origin for same-origin requests — treat as valid
    return { valid: true }
  }

  const host = req.headers['host']
  if (!host) {
    return { valid: true }
  }

  try {
    const originHost = new URL(origin).host
    if (originHost !== host) {
      return { valid: false, reason: `Origin ${origin} does not match host ${host}` }
    }
  } catch {
    return { valid: false, reason: `Invalid origin: ${origin}` }
  }

  return { valid: true }
}
