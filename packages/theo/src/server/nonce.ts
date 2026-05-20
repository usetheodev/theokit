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
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  // `btoa` exists in browsers + edge runtimes; if it doesn't, the caller
  // is on a JS runtime we don't support — let the ReferenceError bubble.
  return btoa(binary)
}

// CR-027 fix: the previous fallback path used `require('node:crypto')`,
// which throws ReferenceError in strict ESM contexts (Bun, Deno, Vercel
// Edge) when reached. Web Crypto has been a hard requirement since Node
// 19; for older Node we now throw a clear error at module load time
// instead of failing on first SSR request.
let cachedWebCrypto: Crypto | null | undefined

function getWebCrypto(): Crypto {
  if (cachedWebCrypto === undefined) {
    const candidate = (globalThis as { crypto?: Crypto }).crypto
    cachedWebCrypto =
      candidate && typeof candidate.getRandomValues === 'function' ? candidate : null
  }
  if (!cachedWebCrypto) {
    throw new Error(
      'generateNonce: Web Crypto unavailable. TheoKit requires Node.js 19+, Bun, Deno, ' +
        'or any modern Edge runtime where `globalThis.crypto.getRandomValues` is present.',
    )
  }
  return cachedWebCrypto
}

export function generateNonce(): string {
  const buf = new Uint8Array(16)
  getWebCrypto().getRandomValues(buf)
  return bytesToBase64(buf)
}
