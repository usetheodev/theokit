/**
 * Path traversal scope guard for /**-style proxy patterns (T1.2).
 *
 * Ported from Nitro src/runtime/internal/route-rules.ts:113-126
 * (defends against GHSA-5w89-w975-hf9q — match/forward differential where
 * encoded `..%2f` evades a scope check but escapes the base once decoded).
 *
 * Pre-decodes `%2F` (/) and `%5C` (\) which WHATWG URL leaves opaque in
 * paths, then canonicalizes ./../ via `new URL(...)`. Returns false
 * (deny) if pathname cannot be parsed OR canonical path escapes the base.
 */
export function isPathInScope(pathname: string, base: string): boolean {
  let canonical: string
  try {
    const pre = pathname.replace(/%2f/gi, '/').replace(/%5c/gi, '\\')
    // The base URL is a placeholder for relative-path resolution only — never used as a real
    // network target. https-prefix not needed since this URL is discarded after canonicalization.
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- pathname-only canonicalization
    canonical = new URL(pre, 'http://_').pathname
  } catch {
    return false
  }
  if (!base) return true
  return canonical === base || canonical.startsWith(base + '/')
}
