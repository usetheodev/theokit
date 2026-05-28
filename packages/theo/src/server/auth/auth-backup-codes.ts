/**
 * T6.3 — Backup codes for 2FA recovery.
 *
 * generateBackupCodes returns N plaintexts (display once to user) + hashes
 * (store in DB). verifyBackupCode constant-time-walks all hashes and
 * returns the matchedHash so caller can delete the used code from storage
 * — replay protection lives at the caller (we can't see their database).
 *
 * SECURITY NOTES:
 *   - Codes have ~40 bits entropy (8 chars × 5 bits per char from a
 *     32-char alphabet excluding I/L/O/0/1). Single-use → argon2id
 *     overhead is unnecessary; SHA-256 of the normalized code suffices.
 *   - The caller MUST atomically delete the matched hash on successful
 *     verify. Without that, the code is replayable. We surface
 *     matchedHash explicitly so this step is conspicuous.
 *   - Pair this with throttleLoginAttempts (T6.1) on the verify endpoint
 *     to prevent online brute-force against the 40-bit space.
 */

export interface BackupCodeOptions {
  /** How many codes to generate. Default 10. */
  count?: number
  /** Length in chars (excluding separator). Default 8. */
  length?: number
  /** Separator inserted at the midpoint. Default '-'; pass null to omit. */
  separator?: '-' | null
  /** Custom alphabet. Default excludes ambiguous chars (I, L, O, 0, 1). */
  alphabet?: string
}

export interface BackupCode {
  plaintext: string
  hash: string
}

const DEFAULT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1
const DEFAULT_COUNT = 10
const DEFAULT_LENGTH = 8

/**
 * Generate cryptographically random backup codes + their SHA-256 hashes.
 *
 * Plaintext is uppercase alphanumeric (default alphabet excludes ambiguous
 * chars). Separator inserted at the midpoint (default `-`).
 */
export async function generateBackupCodes(opts: BackupCodeOptions = {}): Promise<BackupCode[]> {
  const count = opts.count ?? DEFAULT_COUNT
  const length = opts.length ?? DEFAULT_LENGTH
  const separator = opts.separator === undefined ? '-' : opts.separator
  const alphabet = opts.alphabet ?? DEFAULT_ALPHABET

  // CR-022 fix: bound count and length explicitly. Pathological inputs
  // (count=Infinity, length=0) would cause an infinite loop or wasteful
  // resource usage. Bounds are generous (count ≤ 1000, length ∈ [4, 64])
  // — well above any realistic 2FA backup-codes use case.
  if (!Number.isInteger(count) || count <= 0 || count > 1000) {
    throw new RangeError(
      `generateBackupCodes: count must be an integer in [1, 1000] (got ${String(count)})`,
    )
  }
  if (!Number.isInteger(length) || length < 4 || length > 64) {
    throw new RangeError(
      `generateBackupCodes: length must be an integer in [4, 64] (got ${String(length)})`,
    )
  }
  if (alphabet.length < 8) {
    throw new RangeError(
      `generateBackupCodes: alphabet must contain at least 8 distinct chars (got ${alphabet.length})`,
    )
  }

  const codes: BackupCode[] = []
  const seen = new Set<string>()
  while (codes.length < count) {
    const raw = randomFromAlphabet(length, alphabet)
    if (seen.has(raw)) continue
    seen.add(raw)
    const plaintext = formatWithSeparator(raw, separator)
    const hash = await sha256Hex(normalizeCode(plaintext))
    codes.push({ plaintext, hash })
  }
  return codes
}

/**
 * Verify a code against a list of stored hashes. Walks all hashes
 * constant-time (no early exit). Returns `valid:true` + matchedHash on
 * hit; `valid:false` otherwise.
 *
 * `matchedHash` is the EXACT string the caller stored, ready to be passed
 * to a `DELETE FROM backup_codes WHERE hash = ?` query.
 */
export async function verifyBackupCode(
  code: string,
  hashes: readonly string[],
): Promise<{ valid: boolean; matchedHash?: string }> {
  const candidate = await sha256Hex(normalizeCode(code))
  let matchedHash: string | undefined
  // Constant-time iteration over hashes: never short-circuit.
  for (const h of hashes) {
    if (constantTimeEquals(h, candidate)) {
      matchedHash = h
    }
  }
  return matchedHash ? { valid: true, matchedHash } : { valid: false }
}

/**
 * Normalize a code for hashing: uppercase + strip separator. This way
 * `abcd-efgh` and `ABCDEFGH` produce the same hash. Whitespace is also
 * stripped defensively.
 */
function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[-\s]+/g, '')
}

function formatWithSeparator(raw: string, separator: '-' | null): string {
  if (!separator || raw.length < 4) return raw
  const mid = Math.floor(raw.length / 2)
  return raw.slice(0, mid) + separator + raw.slice(mid)
}

function randomFromAlphabet(length: number, alphabet: string): string {
  const random = new Uint8Array(length)
  crypto.getRandomValues(random)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[random[i] % alphabet.length]
  }
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
