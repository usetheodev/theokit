/* eslint-disable security/detect-non-literal-fs-filename --
 * Reads `.env` files from a CLI-controlled `cwd`. File names are a fixed
 * literal set. Build-time + CLI tool; no HTTP input.
 */
/**
 * `loadEnv()` — auto-loads `.env` files into `process.env` for server code.
 *
 * Implements the Next.js `loadEnvConfig` algorithm
 * (`referencias/next.js/packages/next-env/index.ts:114-180`) with TheoKit
 * adaptations:
 *
 * - EC-1: 1MB file-size cap (anti-OOM, anti-supply-chain).
 * - EC-2: `_resetEnvCache()` test-only side-door.
 * - EC-8: `dotenv-expand` circular-ref safe (lib-provided).
 * - EC-13: log when `.env` is a symlink (transparency).
 * - D6: real `process.env` wins over `.env`-file values.
 * - NODE_ENV stash: `.env`-set NODE_ENV NEVER overrides the real
 *   `process.env.NODE_ENV`. Stashed in `__THEOKIT_USER_NODE_ENV` instead.
 */

import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import dotenv from 'dotenv'
import { expand, type DotenvPopulateInput } from 'dotenv-expand'

import type { LoadEnvOptions, LoadEnvResult } from './load-env-types.js'

/** EC-1: 1MB cap. Real `.env`s are < 10KB. */
const MAX_ENV_FILE_BYTES = 1_048_576

const cache = new Map<string, LoadEnvResult>()

/** Test-only side-door for EC-2 — clear the module-level cache between vitest test files. */
export function _resetEnvCache(): void {
  cache.clear()
}

function envFilesInPriorityOrder(mode: string): string[] {
  // Top of list = highest priority. Will be read in REVERSE so first-in
  // wins via overwrite during merge.
  const files = [`.env.${mode}.local`, `.env.local`, `.env.${mode}`, `.env`]
  // Test mode skips `.env.local` per dotenv convention (avoid leaking dev
  // secrets into the test suite).
  if (mode === 'test') {
    return files.filter((f) => f !== '.env.local')
  }
  return files
}

function readEnvFile(path: string): Record<string, string> | null {
  let stat
  try {
    stat = statSync(path)
  } catch {
    return null // ENOENT / EACCES → skip
  }

  // Allow files + FIFOs (1Password/SOPS pipe support).
  if (!stat.isFile() && !stat.isFIFO()) return null

  // EC-1 — anti-OOM cap.
  if (stat.size > MAX_ENV_FILE_BYTES) {
    console.warn(
      `[theokit] .env file at ${path} exceeds ${MAX_ENV_FILE_BYTES} bytes — skipping (likely a generated artifact, not a real env file)`,
    )
    return null
  }

  // EC-13 — symlink transparency. Don't refuse; just log.
  try {
    const lstat = lstatSync(path)
    if (lstat.isSymbolicLink()) {
      const real = realpathSync(path)
      // eslint-disable-next-line no-console -- intentional transparency log on a build-time tool
      console.info(`[theokit] .env at ${path} is a symlink → ${real}`)
    }
  } catch {
    // lstat failure is non-fatal — fall through to read.
  }

  try {
    const content = readFileSync(path, 'utf-8')
    return dotenv.parse(content)
  } catch {
    return null
  }
}

// eslint-disable-next-line complexity -- canonical env-load algorithm (priority → expand → guards → apply); inlining branches is clearer than extracting micro-helpers
export function loadEnv(options: LoadEnvOptions = {}): LoadEnvResult {
  const cwd = options.cwd ?? process.cwd()
  const mode = options.mode ?? process.env.NODE_ENV ?? 'development'
  const cacheKey = `${cwd}:${mode}`

  if (!options.forceReload) {
    const cached = cache.get(cacheKey)
    if (cached) return cached
  }

  const fileNames = envFilesInPriorityOrder(mode)
  const filePaths = fileNames.map((f) => resolve(cwd, f))

  // Read in REVERSE — lower-priority files first, so higher-priority
  // (lower-index) overwrites during merge.
  const merged: Record<string, string> = {}
  const loadedFromFiles: string[] = []
  for (const path of [...filePaths].reverse()) {
    const parsed = readEnvFile(path)
    if (parsed === null) continue
    for (const [k, v] of Object.entries(parsed)) {
      merged[k] = v
    }
    loadedFromFiles.unshift(path) // keep priority order in result
  }

  // NODE_ENV stash — `.env`-set NODE_ENV never overrides real process.env.NODE_ENV.
  if (merged.NODE_ENV && process.env.__THEOKIT_USER_NODE_ENV === undefined) {
    process.env.__THEOKIT_USER_NODE_ENV = merged.NODE_ENV
  }
  delete merged.NODE_ENV // never propagate

  // EC-8 — dotenv-expand@11 stack-overflows on circular refs (A=${B}, B=${A}).
  // Wrap in try/catch — on overflow, leave the parsed map untouched (literal
  // values survive). Tested via test_loadEnv_circular_expand_no_loop_EC8.
  // Pass a CLONE of process.env (string-only, filtered) so expand can
  // reference real env without mutating it.
  const processEnvClone: DotenvPopulateInput = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') processEnvClone[k] = v
  }
  try {
    expand({ parsed: merged, processEnv: processEnvClone })
  } catch (err) {
    if (err instanceof RangeError) {
      console.warn(
        `[theokit] .env expansion overflow (likely circular reference like A=\${B}, B=\${A}). Leaving values as literals.`,
      )
    } else {
      throw err
    }
  }

  // Apply: D6 — real process.env wins over file values.
  const loaded: Record<string, string> = {}
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] !== undefined) continue // real env wins
    process.env[k] = v
    loaded[k] = v
  }

  // Sentinel
  process.env.__THEOKIT_PROCESSED_ENV = 'true'

  const result: LoadEnvResult = { loaded, loadedFromFiles }
  cache.set(cacheKey, result)
  return result
}
