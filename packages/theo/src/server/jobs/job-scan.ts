/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time scanner: caller-controlled directory paths only.
 */
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

import { walkSourceFiles } from '../_internal/scan-walker.js'

import type { JobDefinition } from './job-types.js'

export interface JobNode {
  readonly name: string
  readonly filePath: string
  readonly maxAttempts: number
  readonly hasInputSchema: boolean
}

export class DuplicateJobNameError extends Error {
  readonly code = 'DUPLICATE_JOB_NAME'
  constructor(
    public readonly jobName: string,
    public readonly filePaths: readonly string[],
  ) {
    super(
      `Duplicate job name "${jobName}" defined in: ${filePaths.join(', ')}. ` +
        'Job names must be unique across server/jobs/.',
    )
    this.name = 'DuplicateJobNameError'
  }
}

const JOB_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs'])

interface JobModule {
  default?: unknown
}

function isJobDefinition(value: unknown): value is JobDefinition {
  if (typeof value !== 'object' || value === null) return false
  const def = value as Record<string, unknown>
  return (
    typeof def.name === 'string' &&
    typeof def.handler === 'function' &&
    typeof def.maxAttempts === 'number' &&
    typeof def.hasInputSchema === 'boolean'
  )
}

export async function scanJobs(jobsDir: string): Promise<JobNode[]> {
  if (!existsSync(jobsDir)) return []

  const filePaths: string[] = []
  walkSourceFiles(jobsDir, { extensions: JOB_EXTENSIONS }, (p) => {
    const base = basename(p)
    if (base.startsWith('_') || base.startsWith('.')) return
    filePaths.push(p)
  })

  const nodes: JobNode[] = []
  for (const filePath of filePaths) {
    let mod: JobModule
    try {
      mod = (await import(pathToFileURL(filePath).href)) as JobModule
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to import job file "${filePath}": ${reason}`)
    }
    const exported = mod.default
    if (!isJobDefinition(exported)) {
      throw new Error(
        `Job file "${filePath}" is missing a valid default export. ` +
          'Expected `export default defineJob(name, { handler })`.',
      )
    }
    nodes.push({
      name: exported.name,
      filePath,
      maxAttempts: exported.maxAttempts,
      hasInputSchema: exported.hasInputSchema,
    })
  }

  const byName = new Map<string, string[]>()
  for (const node of nodes) {
    const bucket = byName.get(node.name) ?? []
    bucket.push(node.filePath)
    byName.set(node.name, bucket)
  }
  for (const [name, paths] of byName) {
    if (paths.length > 1) {
      throw new DuplicateJobNameError(name, paths)
    }
  }

  return nodes.sort((a, b) => a.name.localeCompare(b.name))
}
