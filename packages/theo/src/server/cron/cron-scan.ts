/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time scanner: caller-controlled directory paths only. No HTTP
 * input ever reaches these fs calls.
 */
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

import { walkSourceFiles } from '../_internal/scan-walker.js'

import type { CronConcurrencyPolicy, CronDefinition } from './cron-types.js'

/**
 * One discovered cron from build-time scan. The handler is intentionally
 * NOT included — manifest is platform-neutral and consumed by adapters
 * that emit static config. Runtime dispatch loads the handler at fire time.
 */
export interface CronNode {
  readonly name: string
  readonly filePath: string
  readonly schedule: string
  readonly concurrency: CronConcurrencyPolicy
}

export class DuplicateCronNameError extends Error {
  readonly code = 'DUPLICATE_CRON_NAME'
  constructor(
    public readonly cronName: string,
    public readonly filePaths: readonly string[],
  ) {
    super(
      `Duplicate cron name "${cronName}" defined in: ${filePaths.join(', ')}. ` +
        'Cron names must be unique across server/crons/.',
    )
    this.name = 'DuplicateCronNameError'
  }
}

const CRON_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs'])

interface CronModule {
  default?: unknown
}

function isCronDefinition(value: unknown): value is CronDefinition {
  if (typeof value !== 'object' || value === null) return false
  const def = value as Record<string, unknown>
  return (
    typeof def.name === 'string' &&
    typeof def.schedule === 'string' &&
    typeof def.handler === 'function' &&
    (def.concurrency === 'forbid' || def.concurrency === 'allow')
  )
}

/**
 * Scan a directory for cron definition files and return the discovered
 * `CronNode[]` sorted by name. Throws `DuplicateCronNameError` on name
 * collision and `Error` on missing default export.
 *
 * Sequential by design — module imports are awaited one-by-one to keep
 * error messages anchored to the file that failed.
 */
export async function scanCrons(cronsDir: string): Promise<CronNode[]> {
  if (!existsSync(cronsDir)) return []

  const filePaths: string[] = []
  walkSourceFiles(cronsDir, { extensions: CRON_EXTENSIONS }, (p) => {
    const base = basename(p)
    // Skip private helpers (`_helper.ts`) and OS junk (`.DS_Store`).
    if (base.startsWith('_') || base.startsWith('.')) return
    filePaths.push(p)
  })

  const nodes: CronNode[] = []
  for (const filePath of filePaths) {
    let mod: CronModule
    try {
      mod = (await import(pathToFileURL(filePath).href)) as CronModule
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to import cron file "${filePath}": ${reason}`)
    }
    const exported = mod.default
    if (!isCronDefinition(exported)) {
      throw new Error(
        `Cron file "${filePath}" is missing a valid default export. ` +
          'Expected `export default defineCron(name, { schedule, handler })`.',
      )
    }
    nodes.push({
      name: exported.name,
      filePath,
      schedule: exported.schedule,
      concurrency: exported.concurrency,
    })
  }

  // Dup-name detection
  const byName = new Map<string, string[]>()
  for (const node of nodes) {
    const bucket = byName.get(node.name) ?? []
    bucket.push(node.filePath)
    byName.set(node.name, bucket)
  }
  for (const [name, paths] of byName) {
    if (paths.length > 1) {
      throw new DuplicateCronNameError(name, paths)
    }
  }

  return nodes.sort((a, b) => a.name.localeCompare(b.name))
}
