/**
 * Types for `detectPackage()` — generalized auto-detector used by
 * `integrateUseTheoUI` (T3.2) and other plugin-auto-config paths.
 */

export interface DetectResult {
  /** True iff the package is declared in package.json AND resolvable from cwd. */
  installed: boolean
  /** Resolved version string from the package's own package.json. */
  version?: string
  /** Absolute path to the resolved package.json. */
  resolvedPath?: string
}
