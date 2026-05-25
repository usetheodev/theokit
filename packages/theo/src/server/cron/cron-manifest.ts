import { writeAtomic } from '../_internal/atomic-write.js'

import type { CronNode } from './cron-scan.js'

export const CRON_MANIFEST_SCHEMA_VERSION = 1 as const

export interface CronManifestEntry {
  readonly name: string
  readonly filePath: string
  readonly schedule: string
  readonly concurrency: 'forbid' | 'allow'
}

export interface CronManifest {
  readonly schemaVersion: typeof CRON_MANIFEST_SCHEMA_VERSION
  readonly generatedAt: string
  readonly crons: readonly CronManifestEntry[]
}

/**
 * Build a `CronManifest` from scanned `CronNode[]`. Filepaths are kept
 * relative to the caller's project root for portability.
 */
export function buildCronManifest(nodes: readonly CronNode[], projectRoot?: string): CronManifest {
  const crons: CronManifestEntry[] = nodes.map((n) => ({
    name: n.name,
    filePath: projectRoot ? relativize(n.filePath, projectRoot) : n.filePath,
    schedule: n.schedule,
    concurrency: n.concurrency,
  }))
  return {
    schemaVersion: CRON_MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    crons,
  }
}

/**
 * Write the cron manifest to `path` atomically (EC-106).
 *
 * Accepts either a pre-built `CronManifest` OR an array of `CronNode[]`
 * (which gets converted via `buildCronManifest`). The atomic-write
 * helper guarantees `path` always contains valid JSON, even under
 * concurrent writes (e.g., dev-server rescan + build).
 */
export function writeCronManifest(
  path: string,
  input: readonly CronNode[] | CronManifest,
  projectRoot?: string,
): void {
  const manifest: CronManifest = isManifest(input) ? input : buildCronManifest(input, projectRoot)
  writeAtomic(path, JSON.stringify(manifest, null, 2))
}

function isManifest(value: unknown): value is CronManifest {
  return typeof value === 'object' && value !== null && 'schemaVersion' in value && 'crons' in value
}

function relativize(absPath: string, root: string): string {
  if (absPath.startsWith(root)) {
    const trimmed = absPath.slice(root.length)
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  }
  return absPath
}
