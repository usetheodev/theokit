import { webcrypto } from 'node:crypto'
import { argon2id, argon2Verify } from 'hash-wasm'

/**
 * Phase 8 — Password hashing for the agent-saas demo.
 *
 * Primary: Argon2id via hash-wasm. Pure WebAssembly, no native build step,
 * runs on Alpine and Vercel Edge. OWASP-recommended interactive params
 * (memory 19 MiB, iterations 2, parallelism 1).
 *
 * Backward compat: existing pbkdf2$<iter>$<salt>$<key> hashes still verify.
 * On a successful PBKDF2 verify, the function returns `rehashAs` with a
 * fresh argon2id hash so the login handler can upgrade the stored hash
 * transparently on the user's next login.
 *
 *   verifyPassword(plain, stored) → { ok: true, rehashAs?: string }
 *                                 | { ok: false }
 */

// --- Argon2id (current scheme) ---

// OWASP 2023 interactive parameters
const ARGON2_MEMORY = 19_456 // 19 MiB
const ARGON2_ITERATIONS = 2
const ARGON2_PARALLELISM = 1
const ARGON2_HASH_LENGTH = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  // hash-wasm returns the standard PHC string:
  //   $argon2id$v=19$m=19456,t=2,p=1$<base64-salt>$<base64-hash>
  // We strip the leading `$` and prepend `argon2id$` so the prefix routing
  // in verifyPassword is consistent with legacy `pbkdf2$…`.
  const phc = await argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'encoded',
  })
  // phc starts with `$argon2id$…`. Drop the leading `$` for prefix routing.
  return phc.startsWith('$') ? phc.slice(1) : phc
}

async function verifyArgon2id(password: string, stored: string): Promise<boolean> {
  // hash-wasm expects the PHC string to start with `$argon2id$…`
  const phc = stored.startsWith('$') ? stored : `$${stored}`
  try {
    return await argon2Verify({ password, hash: phc })
  } catch {
    return false
  }
}

// --- PBKDF2 (legacy scheme — verify-only path + test-only hasher) ---

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEY_LEN = 32
const PBKDF2_SALT_LEN = 16

function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

async function deriveKeyPbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const base = await webcrypto.subtle.importKey(
    'raw',
    toArrayBuffer(enc.encode(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await webcrypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    base,
    PBKDF2_KEY_LEN * 8,
  )
  return new Uint8Array(bits)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function verifyPbkdf2(password: string, stored: string): Promise<boolean> {
  const [algo, iterStr, saltHex, keyHex] = stored.split('$')
  if (algo !== 'pbkdf2' || !iterStr || !saltHex || !keyHex) return false
  const iterations = parseInt(iterStr, 10)
  if (!Number.isFinite(iterations) || iterations <= 0) return false
  try {
    const salt = hexToBytes(saltHex)
    const expected = hexToBytes(keyHex)
    const actual = await deriveKeyPbkdf2(password, salt, iterations)
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}

/**
 * Internal helper exposed for the migration regression test. NOT part of
 * the public surface — agent-saas only writes argon2id hashes now.
 */
export async function _legacyHashForTests(password: string): Promise<string> {
  const salt = webcrypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LEN))
  const key = await deriveKeyPbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(key)}`
}

// --- Verify entrypoint ---

export interface VerifyResult {
  ok: boolean
  /**
   * When a legacy hash verifies successfully, this carries a fresh
   * argon2id hash. The login handler should write it to the DB so the
   * next login uses the upgraded format.
   */
  rehashAs?: string
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<VerifyResult> {
  if (!stored) return { ok: false }

  if (stored.startsWith('argon2id$')) {
    const ok = await verifyArgon2id(password, stored)
    return { ok }
  }

  if (stored.startsWith('pbkdf2$')) {
    const ok = await verifyPbkdf2(password, stored)
    if (!ok) return { ok: false }
    // Migration: re-hash with argon2id so the next login is upgraded.
    const rehashAs = await hashPassword(password)
    return { ok: true, rehashAs }
  }

  return { ok: false }
}
