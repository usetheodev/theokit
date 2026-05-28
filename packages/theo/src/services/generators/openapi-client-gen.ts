/**
 * OpenAPI → TypeScript client generation (T5.1).
 *
 * Thin wrapper around `@hey-api/openapi-ts` (the de facto 2026 generator
 * used by Vercel/OpenCode/PayPal). Called by the Vite plugin
 * `services-typed-client.ts` at dev startup and when an OpenAPI URL
 * changes.
 *
 * Production behavior:
 *  - For each service with a `openapi` URL, fetch the spec
 *  - Run Hey API generator to write `<cwd>/clients/<service-name>.ts`
 *  - On any failure: log warning, do NOT crash dev (best-effort)
 *
 * The actual `@hey-api/openapi-ts` invocation is dynamic-imported so
 * that consumers without the dep (TS-only Wave 1 apps) don't pay
 * the bundle cost.
 */
import type { ManifestServiceEntry } from '../adapters-bridge/manifest.js'

export interface GenerateClientOptions {
  service: ManifestServiceEntry
  /** Directory to write `<service-name>.ts` into. */
  outputDir: string
  /** Logger for warnings/info. */
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
  /** Test injection — replace fetch (so tests don't hit the network). */
  customFetch?: typeof fetch
}

export interface GenerateClientResult {
  generated: boolean
  outputFile?: string
  skippedReason?: string
}

/**
 * Generate a typed client for one service. No-op (returns skipped=true)
 * if the service has no `openapi` URL.
 *
 * The generator runs the Hey API tool. If the tool import fails (not
 * installed), the function logs a warning and returns `{ generated: false }`.
 */
export async function generateTypedClient(
  options: GenerateClientOptions,
): Promise<GenerateClientResult> {
  const log =
    options.log ??
    ((_level: 'info' | 'warn' | 'error', _msg: string) => {
      // default: silent in production; tests inject their own
    })
  const { service, outputDir } = options

  if (!service.openapi) {
    return { generated: false, skippedReason: 'no openapi URL declared' }
  }

  const f = options.customFetch ?? fetch
  let spec: unknown
  try {
    const res = await f(service.openapi)
    if (!res.ok) {
      log('warn', `[${service.name}] openapi fetch returned ${String(res.status)}; skipping`)
      return { generated: false, skippedReason: `fetch returned ${String(res.status)}` }
    }
    spec = await res.json()
  } catch (err) {
    log(
      'warn',
      `[${service.name}] openapi fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { generated: false, skippedReason: 'fetch failed' }
  }

  // Dynamic import — soft dep. We pass through a variable so the typechecker
  // doesn't resolve the literal at build time (the dep is optional;
  // consumers without it get a graceful skip).
  let createClient: unknown
  try {
    // Soft-dep resolution. We pass the module name through a String wrapper
    // call site that the typechecker cannot statically resolve — so missing
    // dep at typecheck time does not break the build. Runtime behavior is
    // identical to `import('@hey-api/openapi-ts')`.
    const segment1 = '@hey-api/'
    const segment2 = 'openapi-ts'
    const moduleName = `${segment1}${segment2}`
    const dyn: Promise<unknown> = import(moduleName).catch(() => null)
    const mod = (await dyn) as { createClient?: unknown } | null
    createClient = mod?.createClient
  } catch {
    createClient = undefined
  }

  if (typeof createClient !== 'function') {
    log(
      'warn',
      `[${service.name}] @hey-api/openapi-ts not installed; typed client not generated. ` +
        `Run \`pnpm add -D @hey-api/openapi-ts @hey-api/client-fetch\` to enable.`,
    )
    return { generated: false, skippedReason: 'hey-api not installed' }
  }

  const outputFile = `${outputDir}/${service.name}.ts`
  try {
    await (createClient as (cfg: unknown) => Promise<unknown>)({
      input: spec,
      output: { path: outputDir, format: 'prettier' },
      plugins: [{ name: '@hey-api/client-fetch' }],
    })
    log('info', `[${service.name}] typed client generated at ${outputFile}`)
    return { generated: true, outputFile }
  } catch (err) {
    log(
      'warn',
      `[${service.name}] Hey API generation failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { generated: false, skippedReason: 'generator threw' }
  }
}
