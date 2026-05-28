/**
 * Node version preflight for `create-theokit`.
 *
 * `@usetheo/sdk` declares `engines.node: ">=22.12.0"`. Users on older Node
 * hit cryptic `node:sqlite` / `better-sqlite3` ABI errors mid-chat without
 * any actionable diagnostic. This preflight runs at scaffold start, prints
 * a clear error, and exits before any FS write (ADR D4 of the plan).
 *
 * Zero-dep semver comparator — no `semver` package needed.
 */

/** Minimum Node version required by `@usetheo/sdk`. */
export const MIN_NODE_VERSION = '22.12.0'

/**
 * Compare two semver strings (major.minor.patch). Strips leading `v` from
 * either side. Pre-release suffixes (e.g., `-rc.1`, `-nightly...`) are
 * parsed as the base patch — acceptable for a preflight (we're not gating
 * on exact pre-release ordering).
 *
 * Returns:
 *   <0 when a < b
 *    0 when a == b
 *   >0 when a > b
 */
export function compareSemver(a: string, b: string): number {
  const parse = (raw: string): [number, number, number] => {
    const stripped = raw.replace(/^v/, '').split('-')[0] ?? '0.0.0'
    const parts = stripped.split('.').map((s) => Number.parseInt(s, 10) || 0)
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return aMaj - bMaj
  if (aMin !== bMin) return aMin - bMin
  return aPat - bPat
}

/**
 * Throw with an actionable message if `currentRaw` is below `minimum`.
 * Default minimum is `MIN_NODE_VERSION` (22.12.0).
 *
 * Called as the first line of `create-theokit`'s `main` so the preflight
 * fires before any directory is written.
 */
export function assertNodeVersion(currentRaw: string, minimum: string = MIN_NODE_VERSION): void {
  const current = currentRaw.replace(/^v/, '')
  if (compareSemver(currentRaw, minimum) < 0) {
    throw new Error(
      `create-theokit requires Node ${minimum} or later (the @usetheo/sdk peer engines floor).\n` +
        `  Detected: Node ${current}\n` +
        `  Fix:      nvm install 22 && nvm use 22\n` +
        `            (or your version manager equivalent — fnm, volta, asdf, nvs)\n`,
    )
  }
}
