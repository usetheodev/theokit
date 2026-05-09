const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function toBase64Url(data: Uint8Array): string {
  return Buffer.from(data).toString('base64url')
}

function fromBase64Url(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64url'))
}

export async function encrypt<T>(data: T, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(data))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  return `${toBase64Url(iv)}:${toBase64Url(ciphertext)}`
}

export async function decrypt<T>(token: string, secret: string): Promise<T | null> {
  try {
    const parts = token.split(':')
    if (parts.length !== 2) return null

    const iv = fromBase64Url(parts[0])
    const ciphertext = fromBase64Url(parts[1])
    const key = await deriveKey(secret)

    const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as unknown as ArrayBuffer
    const dataBuf = ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength) as unknown as ArrayBuffer
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, dataBuf)
    return JSON.parse(decoder.decode(plaintext)) as T
  } catch {
    return null
  }
}
