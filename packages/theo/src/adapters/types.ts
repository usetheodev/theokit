import type { Plugin } from 'vite'

import type { TheoConfig } from '../config/schema.js'

/**
 * Build context injected by the CLI into adapter.build.
 *
 * - `makeVitePlugins` — optional factory provided by CLI for adapters
 *   that drive `viteBuild()` directly (currently: `nodeAdapter`).
 *   When omitted, adapters that need Vite must fail with an actionable
 *   error. This inverts the previous direct edge `adapters → vite-plugin`
 *   per ADR-0001 v3 (T1.1 of the architecture-cleanup plan).
 */
export interface AdapterBuildContext {
  makeVitePlugins?: (opts: { root: string; ssr?: boolean }) => Plugin[]
}

export interface DeployAdapter {
  name: string
  build(config: TheoConfig, cwd: string, ctx?: AdapterBuildContext): Promise<void>
}

export type BuildTarget =
  | 'node'
  | 'vercel'
  | 'cloudflare'
  | 'static'
  | 'bun'
  | 'deno-deploy'
  | 'netlify'
  | 'aws-lambda'
  | 'theo-cloud'

export const VALID_TARGETS: BuildTarget[] = [
  'node',
  'vercel',
  'cloudflare',
  'static',
  'bun',
  'deno-deploy',
  'netlify',
  'aws-lambda',
  'theo-cloud',
]
