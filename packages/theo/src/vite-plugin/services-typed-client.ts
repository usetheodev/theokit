/**
 * Vite plugin (T3.1) — generates a typed TS client from each service's
 * OpenAPI URL using `@hey-api/openapi-ts` (soft dep — graceful skip when
 * not installed; warns on failure).
 *
 * Dev-only (`apply: 'serve'`). Fire-and-forget — never blocks dev startup.
 *
 * D3: best-effort, warn-only. Generator failure must NEVER crash dev.
 */
import { resolve } from 'node:path'

import type { Plugin } from 'vite'

import { generateTypedClient, type ServicesConfig } from '../services/index.js'

export interface ServicesTypedClientPluginOptions {
  cwd: string
  services: ServicesConfig
}

export function servicesTypedClientPlugin(opts: ServicesTypedClientPluginOptions): Plugin {
  return {
    name: 'theokit:services-typed-client',
    apply: 'serve', // dev-only; never runs in build
    configureServer() {
      // EC-5: ordering — services-typed-client fires AFTER orchestrateDev's
      // healthcheck-gated readiness (orchestrateDev is awaited synchronously
      // in cli/commands/dev.ts BEFORE createServer, so by the time Vite's
      // configureServer hook fires, services are healthy).
      const outputDir = resolve(opts.cwd, 'clients')
      for (const [name, def] of Object.entries(opts.services)) {
        if (!def.openapi) continue
        const openapi = def.openapi
        void generateTypedClient({
          service: {
            name,
            runtime: def.runtime,
            port: def.port,
            proxy: def.proxy,
            dev: def.dev,
            start: def.start,
            healthcheck: def.healthcheck,
            cors: def.cors,
            passSetCookie: def.passSetCookie,
            openapi,
            ...(def.build !== undefined ? { build: def.build } : {}),
            ...(def.env !== undefined ? { env: def.env } : {}),
            ...(def.dependsOn !== undefined ? { dependsOn: def.dependsOn } : {}),
          },
          outputDir,
          log: (_level, msg) => {
            // Use console.warn unconditionally — eslint disallows console.log
            // in source code; warn is appropriate for "best-effort with skip"
            // semantics of this plugin.
            console.warn(`[services-typed-client] ${msg}`)
          },
        })
      }
    },
  }
}
