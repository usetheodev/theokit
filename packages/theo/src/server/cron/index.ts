/**
 * server/cron — Cron primitives (Phase 1, R0.5.4).
 *
 * T4.4 (architecture-cleanup) — sub-barrel entrypoint. Consumers may import
 * from `theokit/server/cron` directly via package.json subpath exports.
 *
 * Backwards compat: `theokit/server` still re-exports the public-facing
 * symbols via its top-level barrel (deprecated path; remove in 1.0).
 */

export { defineCron } from './define-cron.js'
export { validateCronSchedule } from './cron-validate.js'

export type {
  CronContext,
  CronOptions,
  CronDefinition,
  CronConcurrencyPolicy,
} from './cron-types.js'

export {
  CRON_MANIFEST_SCHEMA_VERSION,
  buildCronManifest,
  writeCronManifest,
} from './cron-manifest.js'
export type { CronManifestEntry, CronManifest } from './cron-manifest.js'

// Adapter translators — consumed by cli/commands/build.ts for per-target emit.
export {
  ExistingConfigUnparseableError,
  translateCronToVercel,
  translateCronToCloudflare,
  convertToAwsCron,
  translateCronToAws,
  translateCronToDeno,
} from './adapter-translators.js'

export type { CronScheduler } from './cron-runtime-node.js'
export { createCronScheduler } from './cron-runtime-node.js'

export { scanCrons, DuplicateCronNameError } from './cron-scan.js'
export type { CronNode } from './cron-scan.js'
