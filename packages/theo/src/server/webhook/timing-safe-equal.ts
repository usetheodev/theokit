/**
 * Constant-time byte comparison.
 *
 * Wraps `node:crypto.timingSafeEqual` when available (Node 6.6+) and falls
 * back to a constant-time XOR loop for runtimes without `node:crypto`
 * (Cloudflare Workers, Deno, Bun edge). Required to defeat timing attacks
 * on webhook signature verification — a naive `===` or `Buffer.equals`
 * would short-circuit on first mismatch byte and leak signature position
 * via wall-clock timing.
 *
 * Web Crypto's `crypto.subtle.verify` would also work, but requires a
 * `CryptoKey` object and is asymmetric (verify a signature against a key).
 * For our case — comparing two pre-computed digests — raw byte equality
 * is the correct primitive.
 *
 * @see https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify
 */

type NodeTimingSafeEqual = (a: Uint8Array, b: Uint8Array) => boolean

let cachedNodeImpl: NodeTimingSafeEqual | null | undefined

function resolveNodeImpl(): NodeTimingSafeEqual | null {
  if (cachedNodeImpl !== undefined) return cachedNodeImpl
  try {
    // require() avoids the dynamic-import-of-node-builtin warnings some
    // bundlers emit; `node:crypto` is always synchronously available.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cryptoMod = require('node:crypto') as {
      timingSafeEqual?: NodeTimingSafeEqual
    }
    cachedNodeImpl = cryptoMod.timingSafeEqual ?? null
  } catch {
    cachedNodeImpl = null
  }
  return cachedNodeImpl
}

/**
 * Returns true iff `a` and `b` have identical bytes. Takes time
 * proportional to `a.length` regardless of where bytes differ.
 *
 * @throws TypeError if either argument is not a Uint8Array.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
    throw new TypeError(
      `timingSafeEqual expects Uint8Array arguments (got ${typeof a} and ${typeof b})`,
    )
  }
  // Length mismatch is constant-time-safe by construction (no per-byte work).
  if (a.length !== b.length) return false
  if (a.length === 0) return true

  // Prefer the Node built-in when present — it's implemented in C and
  // matches the contract exactly. node:crypto.timingSafeEqual throws on
  // length mismatch, which we've already filtered above.
  const nodeImpl = resolveNodeImpl()
  if (nodeImpl) return nodeImpl(a, b)

  // Fallback: XOR-accumulate every byte into one accumulator. NEVER
  // short-circuit. The compiler / V8 will not constant-fold this loop
  // because the inputs are dynamic.
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}
