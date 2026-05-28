/* eslint-disable security/detect-non-literal-fs-filename --
 * Node deploy adapter — derives all write paths from the trusted `cwd`
 * (CLI argument). The `.theo/docker-compose.yml` + `.theo/Caddyfile`
 * outputs use a fixed sub-path. Build-time tool — no HTTP input.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { build as viteBuild } from 'vite'

import type { TheoConfig } from '../config/schema.js'
import { generateCaddyfile, generateComposeYaml, readManifest } from '../services/index.js'

import type { AdapterBuildContext, DeployAdapter } from './types.js'

export const nodeAdapter: DeployAdapter = {
  name: 'node',

  async build(config: TheoConfig, cwd: string, ctx?: AdapterBuildContext): Promise<void> {
    // T1.1 (architecture-cleanup) — Vite plugin composition is INJECTED via `ctx.makeVitePlugins`.
    // The CLI (which already imports both `adapters/*` and `vite-plugin/*`) composes the
    // Plugin[] and passes it in, eliminating the previous `adapters → vite-plugin` edge
    // (CRITICAL layering inversion per ADR-0001 v2; fixed by ADR-0001 v3).
    if (!ctx?.makeVitePlugins) {
      throw new Error(
        '[adapter-node] build requires ctx.makeVitePlugins (CLI must inject the Vite plugin factory). ' +
          'This is a framework-internal invariant — see ADR-0001 v3 and docs/plans/architecture-cleanup-plan.md T1.1.',
      )
    }

    // Client build
    await viteBuild({
      root: cwd,
      plugins: ctx.makeVitePlugins({ root: cwd, ssr: config.ssr }),
      build: {
        outDir: '.theo/client',
        emptyOutDir: true,
      },
      logLevel: 'info',
    })

    // SSR build (only when ssr: true)
    if (config.ssr) {
      // eslint-disable-next-line no-console -- CLI build progress
      console.log('\n  Building SSR...\n')
      await viteBuild({
        root: cwd,
        plugins: ctx.makeVitePlugins({ root: cwd, ssr: true }),
        build: {
          ssr: true,
          outDir: '.theo/server',
          emptyOutDir: true,
          rollupOptions: {
            input: '/@theo/entry-server',
          },
        },
        logLevel: 'info',
      })
    }

    // Wave 2 (T2.1) — when polyglot services are declared, emit a
    // TheoCloud-shaped docker-compose harness + Caddyfile (with W3C
    // traceparent propagation via Caddy 2.11+ `tracing` directive).
    // Empty manifest → no emission (Wave 1 BC preserved).
    const manifest = readManifest(cwd)
    if (manifest && manifest.services.length > 0) {
      const yaml = generateComposeYaml(manifest, { webPort: config.port })
      const caddyfile = generateCaddyfile(manifest, {
        port: config.port,
        webHost: 'web',
      })
      writeFileSync(join(cwd, '.theo', 'docker-compose.yml'), yaml)
      writeFileSync(join(cwd, '.theo', 'Caddyfile'), caddyfile)
      // eslint-disable-next-line no-console -- CLI build progress
      console.log(
        `  ✓ TheoCloud-shaped harness: .theo/docker-compose.yml + .theo/Caddyfile ` +
          `(${String(manifest.services.length)} service(s))`,
      )
    }
  },
}
