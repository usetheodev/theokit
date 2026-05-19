/**
 * T4.1 — Per-request CSP nonce generation.
 *
 * Returns a 22–24 character base64-encoded string carrying 16 bytes of
 * cryptographic entropy. Used by the SSR pipeline to nonce the inline
 * hydration data script so the default CSP can drop `'unsafe-inline'`
 * from `script-src` in 0.3.0.
 *
 * Runtime portability: prefers Web Crypto (`globalThis.crypto`) because
 * it is available on every target runtime (Node 19+, Bun, Deno, Vercel
 * Edge, Cloudflare Workers). Falls back to `node:crypto` for older Node
 * builds where `globalThis.crypto` is absent.
 *
 * NOT a security primitive in the cryptographic sense — the nonce is a
 * one-shot, single-request value that defeats trivial XSS injection by
 * making the attacker guess a 128-bit string per request. It is NOT
 * suitable for signing or session tokens.
 */

function bytesToBase64(bytes: Uint8Array): string {
  // Prefer Buffer when available (Node, Bun) — its base64 encoder is fast
  // and well-tested. In Edge runtimes that lack Buffer, fall back to the
  // standard btoa(String.fromCharCode(...)) trick.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  // `btoa` exists in browsers + edge runtimes; if it doesn't, the caller
  // is on a JS runtime we don't support — let the ReferenceError bubble.
  return btoa(binary)
}

export function generateNonce(): string {
  // Web Crypto path — available on Node 19+ globalThis, Bun, Deno,
  // Cloudflare Workers, Vercel Edge.
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const buf = new Uint8Array(16)
    webCrypto.getRandomValues(buf)
    return bytesToBase64(buf)
  }
  // Node fallback (Node < 19 without --experimental-global-webcrypto).
  // require() chosen over import() to keep the function synchronous —
  // nonce generation sits on the request hot path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto')
  return nodeCrypto.randomBytes(16).toString('base64')
}
