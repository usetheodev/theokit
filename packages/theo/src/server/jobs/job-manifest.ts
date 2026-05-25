import { writeAtomic } from '../_internal/atomic-write.js'

import type { JobNode } from './job-scan.js'

export const JOB_MANIFEST_SCHEMA_VERSION = 1 as const

export interface JobManifestEntry {
  readonly name: string
  readonly filePath: string
  readonly maxAttempts: number
  readonly hasInputSchema: boolean
}

export interface JobManifest {
  readonly schemaVersion: typeof JOB_MANIFEST_SCHEMA_VERSION
  readonly generatedAt: string
  readonly jobs: readonly JobManifestEntry[]
}

export function buildJobManifest(nodes: readonly JobNode[], projectRoot?: string): JobManifest {
  const jobs: JobManifestEntry[] = nodes.map((n) => ({
    name: n.name,
    filePath: projectRoot ? relativize(n.filePath, projectRoot) : n.filePath,
    maxAttempts: n.maxAttempts,
    hasInputSchema: n.hasInputSchema,
  }))
  return {
    schemaVersion: JOB_MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    jobs,
  }
}

export function writeJobManifest(
  path: string,
  input: readonly JobNode[] | JobManifest,
  projectRoot?: string,
): void {
  const manifest: JobManifest = isManifest(input) ? input : buildJobManifest(input, projectRoot)
  writeAtomic(path, JSON.stringify(manifest, null, 2))
}

function isManifest(value: unknown): value is JobManifest {
  return typeof value === 'object' && value !== null && 'schemaVersion' in value && 'jobs' in value
}

function relativize(absPath: string, root: string): string {
  if (absPath.startsWith(root)) {
    const trimmed = absPath.slice(root.length)
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  }
  return absPath
}
