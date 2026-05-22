/**
 * Types for `loadEnv()` — env auto-load utility (Phase 1 of
 * docs/plans/framework-zero-config-polish-plan.md).
 *
 * The shape mirrors Next.js's `LoadedEnvFiles` (`next-env/index.ts:114`).
 */

export interface LoadEnvOptions {
  /** Project root. Default: `process.cwd()` */
  cwd?: string
  /** Mode (`development` | `production` | `test`). Default: `process.env.NODE_ENV ?? 'development'` */
  mode?: string
  /** Bypass module-level cache. Default: `false` */
  forceReload?: boolean
}

export interface LoadEnvResult {
  /** Map of all keys that were APPLIED to process.env by this call. */
  loaded: Record<string, string>
  /** Absolute paths of files that were actually read, in priority order (top wins). */
  loadedFromFiles: string[]
}
