// AES-GCM-256 token encryption with cached key derivation.
//
// CR-002 fixes:
//   - KDF: HKDF (RFC 5869) over the raw secret, not raw SHA-256.
//     HKDF binds the application context ("theo-session-v1") into the
//     derived key so the same secret used elsewhere cannot decrypt these
//     tokens. SHA-256 of the raw secret has neither domain separation nor
//     proper key-stretching guarantees.
//   - Cache: derived `CryptoKey` is memoized per (secret, info) tuple.
//     Pre-fix, every encrypt/decrypt re-ran SHA-256 + importKey, which (a)
//     burned CPU on every authenticated request and (b) made
//     `decryptWithFallback` leak rotation-array position via timing.
//   - Buffer typing: `Uint8Array` flows directly into Web Crypto
//     (`BufferSource`-compatible). The previous `as unknown as ArrayBuffer`
//     double-cast (CR-016) is removed.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const HKDF_INFO_DEFAULT = encoder.encode('theo-session-v1')
const HKDF_SALT_EMPTY = new Uint8Array(0)

// Memoize derived keys. Bounded by the number of distinct secrets the app
// ever uses (typically 1 in steady state, 2-5 during rotation). Map-based
// so distinct secrets do not evict each other.
const keyCache = new Map<string, Promise<CryptoKey>>()

async function deriveKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret)
  if (cached) return cached

  const derive = (async () => {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HKDF' },
      false,
      ['deriveKey'],
    )
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT_EMPTY, info: HKDF_INFO_DEFAULT },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  })()

  keyCache.set(secret, derive)
  // If derivation fails (invalid secret), evict so a retry can try fresh.
  derive.catch(() => {
    keyCache.delete(secret)
  })
  return derive
}

function toBase64Url(data: Uint8Array): string {
  return Buffer.from(data).toString('base64url')
}

/**
 * Decode a base64url string into a `Uint8Array<ArrayBuffer>`. The explicit
 * generic matters: Web Crypto APIs expect `BufferSource`, and TS 5.7+
 * tightened `Uint8Array` to `Uint8Array<ArrayBufferLike>` which includes
 * `SharedArrayBuffer`. Returning the narrower generic lets the value pass
 * `crypto.subtle.decrypt` without `as` casts (CR-016 follow-through).
 */
function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(str, 'base64url')
  const copy = new Uint8Array(buf.length)
  copy.set(buf)
  return copy
}

// The `T` generic exists so call sites get type-safe round-tripping
// (`encrypt<Session>(s, ...)` pairs with `decrypt<Session>(...)`); the
// runtime body just stringifies `data`, hence T does not appear in the
// signature beyond the argument.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T documents the round-trip contract with decrypt<T>
export async function encrypt<T>(data: T, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(data))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  )
  return `${toBase64Url(iv)}:${toBase64Url(ciphertext)}`
}

export async function decrypt<T>(token: string, secret: string): Promise<T | null> {
  try {
    const parts = token.split(':')
    if (parts.length !== 2) return null

    const iv = fromBase64Url(parts[0])
    const ciphertext = fromBase64Url(parts[1])
    const key = await deriveKey(secret)

    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return JSON.parse(decoder.decode(plaintext)) as T
  } catch {
    return null
  }
}

/**
 * Reset the derived-key cache. Test helper — never call from production code.
 * Used by Vitest to guarantee isolation between tests that use distinct
 * secrets and want to confirm the derivation path runs.
 */
export function _resetKeyCacheForTests(): void {
  keyCache.clear()
}
