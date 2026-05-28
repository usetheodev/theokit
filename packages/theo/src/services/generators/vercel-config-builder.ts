/**
 * Vercel adapter helpers (T3.1).
 *
 * Builds the `services` block for `vercel.json` from the neutral manifest.
 * Deep-merges with existing `vercel.json` so user-defined keys (env,
 * headers, redirects, crons, etc.) survive (EC-9).
 *
 * NOTE: the exact 2026 Vercel Services JSON shape needs T0.2 spike for
 * byte-perfect match. The shape below is the best-effort baseline derived
 * from reference doc §3.9; the T0.2 snapshot will pin it before ship.
 */
import type { ManifestServiceEntry, ServicesManifest } from '../adapters-bridge/manifest.js'

export interface VercelServiceEntry {
  name: string
  runtime: 'python' | 'node'
  src: string
  routes: { src: string; dest: string }[]
  excludeFiles?: string[]
}

export interface VercelServicesBlock {
  version: 2
  services: VercelServiceEntry[]
}

const PYTHON_DEFAULT_EXCLUDE = ['__pycache__/**', 'tests/**', '*.pyc', '.venv/**']
const NODE_DEFAULT_EXCLUDE = ['node_modules/**', 'tests/**']

function entryToVercel(entry: ManifestServiceEntry): VercelServiceEntry {
  const src = `services/${entry.name}/`
  const dest = `services/${entry.name}`
  const routes = [{ src: `${entry.proxy}/(.*)`, dest }]
  const excludeFiles = entry.runtime === 'python' ? PYTHON_DEFAULT_EXCLUDE : NODE_DEFAULT_EXCLUDE
  return {
    name: entry.name,
    runtime: entry.runtime,
    src,
    routes,
    excludeFiles,
  }
}

export function buildVercelServicesBlock(
  manifest: ServicesManifest | null,
): VercelServicesBlock | null {
  if (!manifest || manifest.services.length === 0) return null

  const webEntry: VercelServiceEntry = {
    name: 'web',
    runtime: 'node',
    src: '.theo/vercel/',
    routes: [{ src: '/(.*)', dest: '.theo/vercel' }],
  }

  return {
    version: 2,
    services: [webEntry, ...manifest.services.map(entryToVercel)],
  }
}

/**
 * Deep-merge: TheoKit OWNS the `services` key, all other keys preserved
 * from existing vercel.json (EC-9).
 */
export function mergeVercelJson(
  existing: Record<string, unknown>,
  block: VercelServicesBlock | null,
): Record<string, unknown> {
  if (!block) return { ...existing }
  return { ...existing, services: block.services, version: block.version }
}
