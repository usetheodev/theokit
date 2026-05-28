/**
 * server/jobs — Background job primitives (Phase 2-3, R0.5.5-9).
 *
 * T4.4 (architecture-cleanup) — sub-barrel entrypoint. Consumers may import
 * from `theokit/server/jobs` directly via package.json subpath exports.
 *
 * Backwards compat: `theokit/server` still re-exports these symbols via
 * its top-level barrel (deprecated path; remove in 1.0).
 */

// Definition
export { defineJob } from './define-job.js'
export type { JobOptions, JobContext, JobDefinition, JobRegistry } from './job-types.js'

// Errors
export { NonRetryableError } from './job-backend.js'
export { DuplicateContextKeyError } from './duplicate-context-key-error.js'

// Backend contract
export type { JobBackend, JobEnqueueInput, JobLease } from './job-backend.js'

// Backends
export { InMemoryJobBackend } from './job-backend-memory.js'
export type { InMemoryJobBackendOptions } from './job-backend-memory.js'
export { PostgresJobBackend } from './job-backend-postgres.js'
export type { PoolLike, PostgresJobBackendOptions } from './job-backend-postgres.js'

// Outbox + queue client
export { createOutbox } from './outbox.js'
export type { Outbox, OutboxFlushOptions } from './outbox.js'
export { createQueueClient, createOutboxDispatcher } from './queue-client.js'
export type { QueueClient, EnqueueOptions } from './queue-client.js'

// Runner
export { createJobRunner } from './job-runner.js'
export type { JobRunner } from './job-runner.js'

// Manifest
export { JOB_MANIFEST_SCHEMA_VERSION, buildJobManifest, writeJobManifest } from './job-manifest.js'
export type { JobManifestEntry, JobManifest } from './job-manifest.js'

// Scan
export { scanJobs, DuplicateJobNameError } from './job-scan.js'
export type { JobNode } from './job-scan.js'
