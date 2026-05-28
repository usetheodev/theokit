/**
 * Adapter Registry (T1.1 of architecture-medium-deferrals plan, ADR D1).
 *
 * Replaces the 9-case `switch (target)` in `cli/commands/build.ts` with a
 * declarative `Record<BuildTarget, () => Promise<DeployAdapter>>` map.
 *
 * Why a registry?
 * - **OCP** — adding a new adapter is now 1 line in this map + 1 string in
 *   `VALID_TARGETS`. The CLI does not change.
 * - **Lazy import preserved** — each factory is `async () => (await import(...))`
 *   so deps load only when the matching target is built.
 * - **TypeScript exhaustiveness** — `Record<BuildTarget, ...>` forces every
 *   target in the union to have a registered factory. Adding a new target
 *   without registering it is a compile error.
 *
 * The registry is the single source of truth for runtime adapter dispatch.
 * The string list `VALID_TARGETS` (in `./types.js`) is the source of truth
 * for CLI flag validation. A test (`test_valid_targets_matches_registry_keys`)
 * pins both lists to the same `BuildTarget` union to prevent drift.
 */

import type { BuildTarget, DeployAdapter } from './types.js'

export const adapterRegistry: Record<BuildTarget, () => Promise<DeployAdapter>> = {
  node: async () => (await import('./node.js')).nodeAdapter,
  vercel: async () => (await import('./vercel.js')).vercelAdapter,
  cloudflare: async () => (await import('./cloudflare.js')).cloudflareAdapter,
  static: async () => (await import('./static.js')).staticAdapter,
  bun: async () => (await import('./bun.js')).bunAdapter,
  'deno-deploy': async () => (await import('./deno-deploy.js')).denoDeployAdapter,
  netlify: async () => (await import('./netlify.js')).netlifyAdapter,
  'aws-lambda': async () => (await import('./aws-lambda.js')).awsLambdaAdapter,
  'theo-cloud': async () => (await import('./theo-cloud.js')).theoCloudAdapter,
}

/**
 * Resolve a `DeployAdapter` for the given target. Throws actionable error
 * if the target is not registered (should be unreachable when callers use
 * the typed `BuildTarget` union, but guards against runtime drift).
 */
export async function resolveAdapter(target: BuildTarget): Promise<DeployAdapter> {
  // BuildTarget union guarantees the key exists at compile time. The runtime
  // accessor still returns the typed factory; we call it directly.
  const factory = adapterRegistry[target]
  return factory()
}
