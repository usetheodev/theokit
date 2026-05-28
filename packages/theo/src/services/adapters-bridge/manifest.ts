/**
 * Neutral cross-product manifest (T1.4).
 *
 * Emitted by `theokit build` at `<cwd>/.theo/services.json` (schemaVersion 1).
 * Consumed by EVERY deploy adapter (Vercel, Node, Cloudflare, future TheoCloud).
 *
 * Shape is INTENTIONALLY platform-neutral (ADR-0015 invariant + D5). No
 * `vercel`/`cloudflare`/`theoCloud` keys — platform-specific tuning lives in
 * `theo.config.ts` and is read by each adapter's own code, NOT serialized
 * into this manifest.
 *
 * Topological ordering enforced (dependsOn-resolved deps first) so adapters
 * that need boot order (docker-compose, K8s) can consume the array verbatim.
 */
/* eslint-disable security/detect-non-literal-fs-filename --
 * Manifest read/write paths are derived from the trusted `cwd` plus a fixed
 * subpath (`.theo/services.json`). No user input flows into the path.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { ServiceDefinition, ServicesConfig } from '../schema/schema.js'

export interface ManifestServiceEntry {
  name: string
  runtime: 'python' | 'node'
  port: number
  proxy: string
  dev: string
  build?: string
  start: string
  openapi?: string
  healthcheck: string
  cors: boolean
  env?: Record<string, string>
  dependsOn?: string[]
  passSetCookie: boolean
}

export interface ServicesManifest {
  version: 1
  services: ManifestServiceEntry[]
}

const MANIFEST_RELATIVE_PATH = ['.theo', 'services.json'] as const

/**
 * Topological sort using Kahn's algorithm.
 * Returns service names in dependency order (deps before dependants).
 * Schema validation guarantees no cycles, no self-deps, no missing references —
 * but we still defensively handle missing deps as no-op.
 */
function topoSort(services: ServicesConfig): string[] {
  const names = Object.keys(services)
  const indeg: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]))
  const adj: Record<string, string[]> = Object.fromEntries(names.map((n) => [n, []]))

  const cmp = (a: string, b: string) => a.localeCompare(b)

  for (const name of names) {
    const deps = services[name].dependsOn ?? []
    for (const dep of deps) {
      if (!(dep in indeg)) continue
      adj[dep].push(name)
      indeg[name] = (indeg[name] ?? 0) + 1
    }
  }

  // Sort initial roots for determinism
  const queue: string[] = names.filter((n) => indeg[n] === 0).sort(cmp)
  const result: string[] = []
  while (queue.length > 0) {
    const cur = queue.shift()
    if (cur === undefined) break
    result.push(cur)
    const adjacent = (adj[cur] ?? []).slice().sort(cmp)
    for (const next of adjacent) {
      indeg[next] = (indeg[next] ?? 0) - 1
      if (indeg[next] === 0) {
        queue.push(next)
      }
    }
  }
  return result.length === names.length ? result : names // fallback (should not hit; schema rejects cycles)
}

function definitionToEntry(name: string, def: ServiceDefinition): ManifestServiceEntry {
  const entry: ManifestServiceEntry = {
    name,
    runtime: def.runtime,
    port: def.port,
    proxy: def.proxy,
    dev: def.dev,
    start: def.start,
    healthcheck: def.healthcheck,
    cors: def.cors,
    passSetCookie: def.passSetCookie,
  }
  if (def.build !== undefined) entry.build = def.build
  if (def.openapi !== undefined) entry.openapi = def.openapi
  if (def.env !== undefined) entry.env = def.env
  if (def.dependsOn !== undefined) entry.dependsOn = [...def.dependsOn]
  return entry
}

export function buildManifest(services: ServicesConfig): ServicesManifest {
  const ordered = topoSort(services)
  return {
    version: 1,
    services: ordered.map((name) => definitionToEntry(name, services[name])),
  }
}

function manifestPath(cwd: string): string {
  return join(cwd, ...MANIFEST_RELATIVE_PATH)
}

/**
 * Write the manifest to `<cwd>/.theo/services.json`.
 *
 * EC-6 fix: creates `.theo/` recursively if absent (fresh project on first
 * `pnpm build` would otherwise hit ENOENT).
 */
export function writeManifest(cwd: string, manifest: ServicesManifest): void {
  const file = manifestPath(cwd)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(manifest, null, 2), 'utf-8')
}

/**
 * Read the manifest from `<cwd>/.theo/services.json`.
 *
 * Returns null if the file does not exist (adapter's job to handle).
 * Throws with an actionable message if the file is malformed JSON.
 */
export function readManifest(cwd: string): ServicesManifest | null {
  const file = manifestPath(cwd)
  if (!existsSync(file)) return null
  const raw = readFileSync(file, 'utf-8')
  try {
    return JSON.parse(raw) as ServicesManifest
  } catch (err) {
    throw new Error(
      `failed to parse services.json at ${file}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}
