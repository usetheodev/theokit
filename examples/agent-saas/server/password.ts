import { webcrypto } from 'node:crypto'

/**
 * Demo-grade password hashing with PBKDF2 + WebCrypto (no external dep).
 * For real production, use argon2 or bcrypt — but this proves the pattern
 * (salt, iterations, constant-time compare).
 */
const ITERATIONS = 100_000
const KEY_LEN = 32
const SALT_LEN = 16

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

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
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
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    base,
    KEY_LEN * 8,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LEN))
  const key = await deriveKey(password, salt)
  return `pbkdf2$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(key)}`
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iterStr, saltHex, keyHex] = stored.split('$')
  if (algo !== 'pbkdf2' || !iterStr || !saltHex || !keyHex) return false
  if (parseInt(iterStr, 10) !== ITERATIONS) return false
  const salt = hexToBytes(saltHex)
  const expected = hexToBytes(keyHex)
  const actual = await deriveKey(password, salt)
  return constantTimeEqual(actual, expected)
}
