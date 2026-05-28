import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// T1.1 (architecture-medium-deferrals) — nodeAdapter no longer static-imported.
// All adapters dispatch via `adapterRegistry` (lazy-imported within runAdapterBuild).
import { VALID_TARGETS, type BuildTarget, type AdapterBuildContext } from '../../adapters/types.js'
import { loadConfig } from '../../config/load-config.js'
import { loadEnv } from '../../config/load-env.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import {
  ExistingConfigUnparseableError,
  translateCronToAws,
  translateCronToCloudflare,
  translateCronToDeno,
  translateCronToVercel,
} from '../../server/cron/adapter-translators.js'
import { writeCronManifest } from '../../server/cron/cron-manifest.js'
import { scanCrons } from '../../server/cron/cron-scan.js'
import { writeJobManifest } from '../../server/jobs/job-manifest.js'
import { scanJobs } from '../../server/jobs/job-scan.js'
import { generateManifest, writeManifest } from '../../server/scan/manifest.js'
import {
  buildManifest as buildServicesManifest,
  writeManifest as writeServicesManifest,
} from '../../services/index.js'
import { cleanOutDir } from '../cleanup/cleanup.js'

// Adapters that do NOT support cron triggers natively. Build still
// succeeds with crons declared, but emits a warning + skip note.
const CRON_NA_TARGETS = new Set<BuildTarget>(['bun', 'netlify', 'static'])

export async function buildCommand(options?: { target?: string }): Promise<void> {
  const cwd = process.cwd()
  // Phase 1 (T1.2) — Load .env BEFORE config load.
  loadEnv({ cwd, mode: 'production' })

  const config = await loadConfig(cwd)
  validateProjectStructure(cwd)

  // T2.2 — Clean .theo/ at build start (Astro pattern). Skip .git*.
  const distDirAbs = resolve(cwd, config.distDir)
  await cleanOutDir({ dir: distDirAbs })

  const target = (options?.target ?? 'node') as BuildTarget

  if (!VALID_TARGETS.includes(target)) {
    throw new Error(
      `Invalid build target "${target}". Available targets: ${VALID_TARGETS.join(', ')}`,
    )
  }

  // EC-201 — cross-reference note when config.adapters[] diverges from
  // the --target flag. --target is authoritative per ADR D2.
  const configAdapters = (config as { adapters?: readonly string[] }).adapters
  if (configAdapters && configAdapters.length > 0) {
    const otherAdapters = configAdapters.filter((a) => a !== target)
    if (otherAdapters.length > 0) {
      console.log(
        `\n  Note: theo.config.ts.adapters lists [${otherAdapters.join(', ')}]; ` +
          `this build translates for ${target} only. ` +
          `Run \`theokit build --target=<adapter>\` separately for each (cross-reference).`,
      )
    }
  }

  console.log(`\n  Building for ${target}...\n`)

  // Manifests emit BEFORE adapter bundling (Vite). Why: manifests are
  // fast + deterministic + don't depend on Vite. If Vite fails (missing
  // dep, malformed entry), the user still gets manifests for diagnostics.
  const serverDir = resolve(cwd, config.serverDir)
  const distDir = distDirAbs
  const manifest = generateManifest(serverDir)
  writeManifest(manifest, distDir)

  const totalEndpoints =
    manifest.routes.length + manifest.actions.length + manifest.websockets.length
  console.log(
    `  ✓ Manifest: ${manifest.routes.length} routes, ${manifest.actions.length} actions, ${manifest.websockets.length} ws (${totalEndpoints} total)`,
  )

  // T1.1 — cron scan + manifest + per-target adapter translation
  await emitCronArtifacts({ cwd, serverDir, distDir, target })

  // T1.2 — job scan + manifest (no per-target translation needed)
  await emitJobArtifacts({ cwd, serverDir, distDir })

  // Wave 2 (T1.2) — services manifest at <cwd>/.theo/services.json. Always
  // emit (empty array when services: {} is empty) so adapters can rely on
  // the file existing. Topological order preserved by buildServicesManifest.
  const servicesManifest = buildServicesManifest(config.services)
  writeServicesManifest(cwd, servicesManifest)
  if (servicesManifest.services.length > 0) {
    console.log(
      `  ✓ Services manifest: ${String(servicesManifest.services.length)} service(s) ` +
        `(${servicesManifest.services.map((s) => s.name).join(', ')})`,
    )
  }

  // Now run the adapter-specific bundling (Vite + adapter-specific work).
  await runAdapterBuild(target, config, cwd)

  const ssrNote = config.ssr ? ' (SSR)' : ''
  console.log(`\n  ✓ Build complete → ${target}${ssrNote}\n`)
}

async function runAdapterBuild(
  target: BuildTarget,
  config: Awaited<ReturnType<typeof loadConfig>>,
  cwd: string,
): Promise<void> {
  // T1.1 (architecture-cleanup) — CLI composes the Vite Plugin[] and INJECTS it into
  // the adapter via ctx.makeVitePlugins. This inverts the previous `adapters → vite-plugin`
  // edge — adapters no longer import from vite-plugin/ directly.
  //
  // theoPlugin AND `@vitejs/plugin-react` are dynamically imported so the deps are
  // materialized only when needed (adapter is `node`). This keeps the CLI's startup
  // path independent of optional build-time deps (so e.g. `theokit build --target=static`
  // does not need react installed). dep-cruiser's per-module rule allows `cli → vite-plugin`.
  const { theoPlugin } = await import('../../vite-plugin/index.js')
  const { default: react } = await import('@vitejs/plugin-react')
  const ctx: AdapterBuildContext = {
    // `react()` may return Plugin or Plugin[] depending on version; flatten so the
    // contract returns a flat Plugin[] as declared in AdapterBuildContext.
    makeVitePlugins: (opts) => [react(), theoPlugin(opts)].flat(),
  }

  // T1.1 (architecture-medium-deferrals, ADR D1) — Adapter Registry replaces
  // the previous 9-case switch. New adapters add 1 line in `adapters/registry.ts`;
  // CLI is closed for modification (OCP).
  const { resolveAdapter } = await import('../../adapters/registry.js')
  const adapter = await resolveAdapter(target)
  await adapter.build(config, cwd, ctx)
}

async function emitCronArtifacts(opts: {
  cwd: string
  serverDir: string
  distDir: string
  target: BuildTarget
}): Promise<void> {
  const cronsDir = resolve(opts.serverDir, 'crons')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- known-internal path under project's own serverDir
  const cronNodes = existsSync(cronsDir) ? await scanCrons(cronsDir) : []
  const manifestPath = resolve(opts.distDir, 'crons.json')
  writeCronManifest(manifestPath, cronNodes, opts.cwd)

  console.log(`  ✓ Crons: ${cronNodes.length} declared`)

  if (cronNodes.length === 0) return

  // EC-201: target-specific translation. N/A targets emit a warning + skip.
  if (CRON_NA_TARGETS.has(opts.target)) {
    console.log(
      `  ⚠ Cron not supported by target "${opts.target}" — declared crons skipped. ` +
        `See docs/concepts/crons.md for supported targets.`,
    )
    return
  }

  const manifestEntries = cronNodes.map((n) => ({
    name: n.name,
    filePath: relativize(n.filePath, opts.cwd),
    schedule: n.schedule,
    concurrency: n.concurrency,
  }))

  try {
    switch (opts.target) {
      case 'vercel':
        translateCronToVercel(resolve(opts.cwd, 'vercel.json'), manifestEntries)
        console.log(`  ✓ Cron → vercel.json crons[] (${cronNodes.length} entries)`)
        break
      case 'cloudflare':
        translateCronToCloudflare(resolve(opts.cwd, 'wrangler.toml'), manifestEntries)
        console.log(`  ✓ Cron → wrangler.toml [triggers] (${cronNodes.length})`)
        break
      case 'aws-lambda':
        translateCronToAws(resolve(opts.cwd, 'serverless.yml'), manifestEntries)
        console.log(`  ✓ Cron → serverless.yml functions (${cronNodes.length})`)
        break
      case 'deno-deploy':
        translateCronToDeno(resolve(opts.distDir, 'crons-entry.ts'), manifestEntries)
        console.log(`  ✓ Cron → ${opts.distDir}/crons-entry.ts (Deno.cron)`)
        break
      case 'node':
        console.log(`  ✓ Cron → in-process scheduler (theokit start)`)
        break
    }
  } catch (err) {
    if (err instanceof ExistingConfigUnparseableError) throw err
    throw err
  }
}

async function emitJobArtifacts(opts: {
  cwd: string
  serverDir: string
  distDir: string
}): Promise<void> {
  const jobsDir = resolve(opts.serverDir, 'jobs')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- known-internal path under project's own serverDir
  const jobNodes = existsSync(jobsDir) ? await scanJobs(jobsDir) : []
  const manifestPath = resolve(opts.distDir, 'jobs.json')
  writeJobManifest(manifestPath, jobNodes, opts.cwd)
  console.log(`  ✓ Jobs: ${jobNodes.length} declared`)
}

function relativize(absPath: string, root: string): string {
  if (absPath.startsWith(root)) {
    const trimmed = absPath.slice(root.length)
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  }
  return absPath
}
