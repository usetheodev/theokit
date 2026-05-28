/* eslint-disable security/detect-non-literal-fs-filename --
 * Vite plugin entry. Reads `package.json` + checks for ts vs js source
 * layout under `theoSrcDir` (build-time literal). No HTTP input.
 */
import { existsSync } from 'node:fs'
import { resolve, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

import { broadcastRouteManifest } from '../devtools/server-side/route-manifest.js'
import { generateEntryServer } from '../router/entry-server.js'
import { generateEntryClient } from '../router/entry.js'
import { generateRouteManifest } from '../router/generate.js'
import { scanRoutes } from '../router/scan.js'
import { isRouteFile } from '../router/types.js'
import type { CorsConfig } from '../server/http/cors.js'
import type { AuditLogger } from '../server/observability/audit-log.js'
import type { PluginRunner } from '../server/plugins/plugin-runner.js'
import type { RateLimitConfig } from '../server/rate-limit/rate-limit.js'
import type { DisallowedConfig } from '../server/security/csrf.js'
import type { SecurityHeadersConfig } from '../server/security/security-headers.js'
import type { TheoTransformer } from '../server/transformer.js'
import { buildServicesProxyConfig, type ServicesConfig } from '../services/index.js'

import { createActionMiddleware } from './action-middleware.js'
import { createApiMiddleware } from './api-middleware.js'
// T2.1-T2.3 (architecture-medium-deferrals) — sibling extractions.
import { resolvePluginConfig } from './config-resolve.js'
import {
  DEVTOOLS_RESOLVED_ID,
  DEVTOOLS_VIRTUAL_ID,
  injectDevtoolsScript,
} from './inject-devtools.js'
import { injectEntryClient } from './inject-entry-client.js'
import { injectStylesheets } from './inject-stylesheets.js'
import { integrateUseTheoUI } from './integrate-ui.js'
import { resolveTheoRootDir } from './resolve-theo-root.js'
import { setupSsrDevMiddleware } from './ssr-dev-middleware.js'
import type { TheoUiDetectResult } from './theoui-detect.js'
import { setupWsUpgrade } from './ws-upgrade.js'

export {
  defineTheoIntegration,
  createIntegrationRegistry,
  IntegrationRouteCollisionError,
  IntegrationVirtualModulePrefixError,
} from './integrations.js'
export type {
  TheoIntegration,
  HookName as IntegrationHookName,
  Hook as IntegrationHook,
  HookContext as IntegrationHookContext,
  IntegrationRegistry,
  IntegrationRegistryOptions,
  IntegrationRoute,
  RouteHandler as IntegrationRouteHandler,
} from './integrations.js'

const VIRTUAL_ENTRY_ID = '/@theo/entry-client'
const RESOLVED_ENTRY_ID = '\0@theo/entry-client'
const VIRTUAL_MANIFEST_ID = '/@theo/route-manifest'
const RESOLVED_MANIFEST_ID = '\0@theo/route-manifest'
const VIRTUAL_ENTRY_SERVER_ID = '/@theo/entry-server'
const RESOLVED_ENTRY_SERVER_ID = '\0@theo/entry-server'
const VIRTUAL_RUNTIME_CONFIG_ID = '/@theo/runtime-config'
const RESOLVED_RUNTIME_CONFIG_ID = '\0@theo/runtime-config'

export interface TheoPluginOptions {
  root?: string
  rateLimit?: RateLimitConfig
  ssr?: boolean
  ssrStreaming?: boolean
  /**
   * Wave 2 (T3.1) — polyglot services config. When passed, the
   * services-typed-client plugin is wired and generates `clients/<name>.ts`
   * per service with an OpenAPI URL. Empty `{}` → no-op.
   */
  services?: ServicesConfig
}

/**
 * T3.3 — Find a consumer-side config file (`tailwind.config.*`, `postcss.config.*`)
 * by walking from projectRoot up to 3 levels. Returns the absolute path on the
 * first hit, or `undefined`. Used to defer to consumer's manual config (D3).
 */
function findConsumerConfig(projectRoot: string, basename: string): string | undefined {
  const extensions = ['.ts', '.js', '.mjs', '.cjs']
  let dir = projectRoot
  for (let level = 0; level < 3; level++) {
    for (const ext of extensions) {
      const candidate = resolve(dir, `${basename}${ext}`)
      if (existsSync(candidate)) return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * Async factory companion. Returns `[theoPlugin, ...autoChainedPlugins]`.
 *
 * Why this exists alongside the sync `theoPlugin()` factory: Vite does NOT
 * reliably merge plugins returned from a child plugin's `config()` hook
 * (verified empirically 2026-05-23 — plugins were silently dropped from
 * the resolved chain despite being returned correctly). The canonical
 * Vite pattern for plugin-from-plugin is to return `Plugin[]` from the
 * plugin factory itself, which Vite flattens into the consumer's
 * `plugins` array.
 *
 * Consumers should prefer `await theoPluginAsync(...)` over `theoPlugin(...)`
 * when they want @usetheo/ui + @tailwindcss/vite auto-chaining. The sync
 * factory remains for backward compatibility and tests.
 */
export async function theoPluginAsync(
  rootOrOptions?: string | TheoPluginOptions,
): Promise<Plugin[]> {
  const options =
    typeof rootOrOptions === 'string' ? { root: rootOrOptions } : (rootOrOptions ?? {})
  const projectRoot = options.root ?? process.cwd()

  const consumerTailwindConfig = findConsumerConfig(projectRoot, 'tailwind.config')
  const consumerPostcssConfig = findConsumerConfig(projectRoot, 'postcss.config')
  const uiPlugins = await integrateUseTheoUI(projectRoot, {
    consumerTailwindConfig,
    consumerPostcssConfig,
  })

  // Wave 2 (T3.1) — typed-client plugin wired only when services declared.
  // Empty `services: {}` (default) → plugin is a no-op (no fetch fired).
  const servicesPlugins: Plugin[] = []
  if (options.services && Object.keys(options.services).length > 0) {
    const { servicesTypedClientPlugin } = await import('./services-typed-client.js')
    servicesPlugins.push(
      servicesTypedClientPlugin({
        cwd: projectRoot,
        services: options.services,
      }),
    )
  }

  return [theoPlugin(rootOrOptions), ...uiPlugins, ...servicesPlugins]
}

// eslint-disable-next-line max-lines-per-function -- Vite plugin factory: state setup + hooks live together by Vite convention
export function theoPlugin(rootOrOptions?: string | TheoPluginOptions): Plugin {
  const options =
    typeof rootOrOptions === 'string' ? { root: rootOrOptions } : (rootOrOptions ?? {})
  const projectRoot = options.root ?? process.cwd()
  const appDir = resolve(projectRoot, 'app')
  const ssrEnabled = options.ssr ?? false

  // Resolve paths for SSR module loading. Pure helper extracted for T1.3
  // regression test — see resolve-theo-root.ts for branch documentation.
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const theoSrcDir = resolveTheoRootDir(currentDir)

  // EC-1: plugin runner cached in module closure. Instantiated in configResolved
  // (non-HMR-able). theo.config.ts edits during dev emit a warn but do NOT
  // re-instantiate — user must restart dev server for plugin changes.
  let pluginRunner: PluginRunner | undefined
  let transformer: TheoTransformer | undefined
  let resolvedBatching: { max?: number } | undefined
  let theoUi: TheoUiDetectResult | undefined
  let csrfMode: 'off' | 'warn' | 'strict' = 'strict'
  let securityHeaders: SecurityHeadersConfig | undefined
  let disallowed: DisallowedConfig | undefined
  // T1.2 — CORS config resolved from theo.config.ts; passed to api-middleware.
  let cors: CorsConfig | undefined
  // T4.1 — Audit logger from theo.config.ts.audit.logger
  let auditLogger: AuditLogger | undefined
  // T1.2 — devtools opt-out. `false` skips injection; anything else enables (dev only).
  let devtoolsEnabled = true
  // Dev mode flag set in configureServer. transformIndexHtml runs in both
  // dev and build; we only want to inject during dev.
  let isDevMode = false
  let configLoadedOnce = false

  return {
    name: 'theo',

    async configResolved() {
      // T2.1 (architecture-medium-deferrals, ADR D2) — config-load logic
      // extracted to `config-resolve.ts`. This hook owns only the one-shot
      // semantic and the closure-variable assignment.
      if (configLoadedOnce) return
      configLoadedOnce = true
      const resolved = await resolvePluginConfig(projectRoot)
      pluginRunner = resolved.pluginRunner
      transformer = resolved.transformer
      resolvedBatching = resolved.resolvedBatching
      theoUi = resolved.theoUi
      csrfMode = resolved.csrfMode
      securityHeaders = resolved.securityHeaders
      disallowed = resolved.disallowed
      cors = resolved.cors
      auditLogger = resolved.auditLogger
      devtoolsEnabled = resolved.devtoolsEnabled
    },

    // Vite calls this hook (sync return is fine — no awaits left after
    // the auto-chain moved to theoPluginAsync). The @usetheo/ui +
    // @tailwindcss/vite auto-chain lives in `theoPluginAsync` because
    // Vite drops plugins returned from a child plugin's config() hook.
    config() {
      // Detect whether we're running from source (.ts) or compiled dist (.js)
      const ext = existsSync(resolve(theoSrcDir, 'index.ts')) ? '.ts' : '.js'

      // Perf: pre-bundle heavy deps at server startup (not on first request).
      // Without this, a cold `pnpm dev` takes ~10s before serving `/` because
      // Vite discovers @usetheo/ui mid-request and stops to bundle it.
      // Measured 2026-05-22: cold first GET / = 10s → ~1s with includes wired.
      // See https://vite.dev/guide/dep-pre-bundling — "lazy dependency
      // discovery" is the canonical mitigation.
      const optimizeDepsInclude: string[] = []
      if (existsSync(resolve(projectRoot, 'node_modules', '@usetheo', 'ui'))) {
        optimizeDepsInclude.push('@usetheo/ui')
      }
      if (existsSync(resolve(projectRoot, 'node_modules', 'lucide-react'))) {
        optimizeDepsInclude.push('lucide-react')
      }

      // Perf: warm up the app's critical-path files so Vite transforms them
      // before the browser asks. Cuts the visible LCP when these files
      // import heavy barrels (TheoUI).
      const warmupClientFiles: string[] = []
      for (const candidate of ['app/layout.tsx', 'app/page.tsx', 'app/page.jsx']) {
        const full = resolve(projectRoot, candidate)
        if (existsSync(full)) warmupClientFiles.push(`./${candidate}`)
      }

      // Wave 2 completion T1.1 — translate `services: {}` into Vite proxy.
      // Empty services → empty record → Vite proxy unaffected.
      const servicesProxy =
        options.services && Object.keys(options.services).length > 0
          ? buildServicesProxyConfig(options.services)
          : undefined

      return {
        envPrefix: 'THEO_PUBLIC_',
        optimizeDeps: optimizeDepsInclude.length > 0 ? { include: optimizeDepsInclude } : undefined,
        server: {
          ...(warmupClientFiles.length > 0 ? { warmup: { clientFiles: warmupClientFiles } } : {}),
          ...(servicesProxy !== undefined ? { proxy: servicesProxy } : {}),
          // Skip watching gitignored heavy dirs to avoid hitting ENOSPC
          // (inotify watcher exhaustion). `referencias/` are deep-research
          // clones; `.theokit/` is per-conversation cache; `.theo/` is
          // build output. None should trigger HMR.
          watch: {
            ignored: [
              '**/referencias/**',
              '**/.theokit/**',
              '**/.theo/**',
              '**/dist/**',
              '**/node_modules/**',
            ],
          },
        },
        resolve: {
          alias: [
            // Order matters: most-specific first so `theokit/X` doesn't
            // get matched by the bare `theokit` alias.
            { find: 'theokit/server', replacement: resolve(theoSrcDir, `server/index${ext}`) },
            { find: 'theokit/client', replacement: resolve(theoSrcDir, `client/index${ext}`) },
            {
              find: 'theokit/react-query',
              replacement: resolve(theoSrcDir, `react-query/index${ext}`),
            },
            {
              find: 'theokit/vite-plugin',
              replacement: resolve(theoSrcDir, `vite-plugin/index${ext}`),
            },
            {
              find: 'theokit/adapters/web-shim',
              replacement: resolve(theoSrcDir, `adapters/web-shim${ext}`),
            },
            {
              find: 'theokit/adapters/ws-shim',
              replacement: resolve(theoSrcDir, `adapters/ws-shim${ext}`),
            },
            // T1.2 — devtools entry (DEV only; tree-shaken in build because
            // the script tag is never injected by inject-devtools.ts in build mode)
            {
              find: 'theokit/devtools/entry',
              replacement: resolve(theoSrcDir, `devtools/entry${ext === '.ts' ? '.tsx' : '.js'}`),
            },
            { find: 'theokit', replacement: resolve(theoSrcDir, `index${ext}`) },
          ],
        },
      }
    },

    // Auto-inject the entry-client `<script>` into every served HTML
    // (Phase 2 of nextjs-maturity plan). Runs BEFORE Vite's own
    // transform so the injection lands inside <body>, not after
    // Vite-injected content. Idempotent: if the user already wrote
    // the script tag, the HTML is returned unchanged.
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string): string {
        // 1. entry-client (always)
        const entry = injectEntryClient(html)
        if (entry.warning) console.warn(entry.warning)
        let next = entry.html

        // 2. devtools (dev only, respecting config.devtools = false)
        const devtools = injectDevtoolsScript(next, {
          isDev: isDevMode,
          enabled: devtoolsEnabled,
        })
        if (devtools.warning) console.warn(devtools.warning)
        next = devtools.html

        // 3. Stylesheet link (dev only) — fixes LCP. Without the
        // <link rel="stylesheet">, CSS only loads after the JS bundle
        // executes `import 'styles.css'`, causing FOUC + LCP > 9s.
        // Production builds rely on Vite's SSR bundle for the
        // correctly-hashed <link>. Font preload was tried + reverted
        // (see inject-stylesheets.ts comment); CLS was hydration
        // mismatch, not font swap.
        const styles = injectStylesheets(next, {
          isDev: isDevMode,
          hasPackage: (name) =>
            existsSync(resolve(projectRoot, 'node_modules', ...name.split('/'))),
        })
        next = styles.html

        return next
      },
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ENTRY_ID) return RESOLVED_ENTRY_ID
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_MANIFEST_ID
      if (id === VIRTUAL_ENTRY_SERVER_ID) return RESOLVED_ENTRY_SERVER_ID
      if (id === VIRTUAL_RUNTIME_CONFIG_ID) return RESOLVED_RUNTIME_CONFIG_ID
      // T1.2 — devtools virtual module. Only resolves in dev; build mode
      // never serves it because transformIndexHtml never injects the tag.
      if (id === DEVTOOLS_VIRTUAL_ID) return DEVTOOLS_RESOLVED_ID
    },

    load(id: string) {
      if (id === RESOLVED_ENTRY_ID) {
        return generateEntryClient(ssrEnabled, {
          theoUi: theoUi?.enabled
            ? { fonts: theoUi.config.fonts, theme: theoUi.config.theme }
            : undefined,
        })
      }
      if (id === RESOLVED_MANIFEST_ID) {
        const tree = scanRoutes(appDir)
        // T3.1 — also broadcast a devtools-shaped manifest to the overlay
        // (no-op in prod / when no dev server is attached).
        broadcastRouteManifest(tree)
        return generateRouteManifest(tree)
      }
      if (id === RESOLVED_ENTRY_SERVER_ID) {
        // SSR tree MUST mirror client tree shape — pass theoUi through so
        // <TheoUIProvider> wraps in both. Without this, React detects a
        // hydration mismatch and silently falls back to client-only
        // render — onClick handlers never get attached.
        return generateEntryServer({
          streaming: options.ssrStreaming === true,
          theoUi: theoUi?.enabled ? { theme: theoUi.config.theme } : undefined,
        })
      }
      if (id === RESOLVED_RUNTIME_CONFIG_ID) {
        // T1.3 — set globalThis.__THEO_TRANSFORMER__ so theoFetch picks it up
        const tName = transformer?.name ?? 'json'
        return [
          `// Generated by Theo Vite plugin`,
          `;(globalThis).__THEO_TRANSFORMER__ = ${JSON.stringify(tName)}`,
          `export const TRANSFORMER_NAME = ${JSON.stringify(tName)}`,
        ].join('\n')
      }
      if (id === DEVTOOLS_RESOLVED_ID) {
        // T1.2 — virtual module re-exports the real entry from theokit's devtools subpath.
        // The actual mount logic lives in packages/theo/src/devtools/entry.tsx;
        // we just emit a tiny shim that imports it (Vite's resolver finds the
        // file via the `theokit` package alias set up in `config()` above).
        return [
          `// Theo devtools — virtual entry (DEV only)`,
          `import('theokit/devtools/entry').catch((e) => console.error('[theo devtools] mount failed', e))`,
        ].join('\n')
      }
    },

    configureServer(server) {
      // T1.2 — mark dev mode so transformIndexHtml injects devtools script
      // and resolveId/load serve the virtual module. Build mode never calls
      // configureServer, so isDevMode stays false and injection is skipped.
      isDevMode = true

      // T2.4 — expose dev server WS to server-side broadcast helper
      // (so server modules can push events to the devtools UI without a
      // hard dependency on Vite). Cleared on server.close.
      ;(globalThis as { __theoViteHotServer?: typeof server }).__theoViteHotServer = server

      // T3.1 — re-broadcast the route manifest when the devtools bridge
      // asks. The initial broadcast happens during `load()` for the
      // manifest virtual module — that fires BEFORE the bridge subscribes.
      // The bridge sends 'theo:devtools:request-manifest' right after
      // subscribing; we reply with a fresh broadcast.
      server.ws.on('theo:devtools:request-manifest', () => {
        try {
          const tree = scanRoutes(appDir)
          broadcastRouteManifest(tree)
        } catch {
          /* fail silently — dev-only convenience */
        }
      })

      // Server middleware (action before API — more specific prefix first)
      const serverDir = resolve(projectRoot, 'server')
      server.middlewares.use(
        createActionMiddleware(server, serverDir, { pluginRunner, csrfMode, disallowed }),
      )
      // Wave 2 completion — services-proxy prefixes flow through to the
      // api-middleware so it can call `next()` for paths that should be
      // forwarded to a sidecar by Vite's proxyMiddleware (registered AFTER
      // configureServer hooks per Vite's middleware order).
      const servicesProxyPrefixes =
        options.services && Object.keys(options.services).length > 0
          ? Object.values(options.services).map((s) => s.proxy)
          : []
      server.middlewares.use(
        createApiMiddleware(server, serverDir, {
          rateLimitConfig: options.rateLimit,
          pluginRunner,
          batching: resolvedBatching,
          transformer,
          csrfMode,
          securityHeaders,
          disallowed,
          cors,
          auditLogger,
          servicesProxyPrefixes,
        }),
      )

      // EC-1: warn if theo.config.ts is edited during dev session — do NOT
      // re-instantiate runner (would cause register side-effect leaks).
      const configPath = resolve(projectRoot, 'theo.config.ts')
      server.watcher.on('change', (file) => {
        if (file === configPath) {
          console.warn(
            '\n[theokit] theo.config.ts changed; restart dev server for plugin changes to take effect\n',
          )
        }
      })

      // T2.2 (architecture-medium-deferrals) — SSR dev middleware extracted.
      if (ssrEnabled) {
        setupSsrDevMiddleware(server, {
          projectRoot,
          virtualEntryServerId: VIRTUAL_ENTRY_SERVER_ID,
          securityHeaders,
        })
      }

      // Frontend HMR watcher
      function handleRouteChange(filePath: string) {
        if (!isRouteFile(basename(filePath))) return
        if (!filePath.startsWith(appDir)) return

        const mod = server.moduleGraph.getModuleById(RESOLVED_MANIFEST_ID)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'full-reload' })
        }
      }

      server.watcher.on('add', handleRouteChange)
      server.watcher.on('unlink', handleRouteChange)

      // T2.3 (architecture-medium-deferrals) — WS upgrade extracted to sibling.
      setupWsUpgrade(server, projectRoot)

      // T2.4 — clear devtools WS reference on shutdown
      server.httpServer?.once('close', () => {
        ;(globalThis as { __theoViteHotServer?: unknown }).__theoViteHotServer = undefined
      })
    },
  }
}
