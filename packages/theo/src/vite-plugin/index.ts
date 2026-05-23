/* eslint-disable security/detect-non-literal-fs-filename --
 * Vite plugin entry. Reads `package.json` + checks for ts vs js source
 * layout under `theoSrcDir` (build-time literal). No HTTP input.
 */
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { resolve, basename, dirname } from 'node:path'
import type { Duplex } from 'node:stream'
import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

import { loadConfig } from '../config/load-config.js'
import { broadcastRouteManifest } from '../devtools/server-side/route-manifest.js'
import { generateEntryServer } from '../router/entry-server.js'
import { generateEntryClient } from '../router/entry.js'
import { generateRouteManifest } from '../router/generate.js'
import { scanRoutes } from '../router/scan.js'
import { isRouteFile } from '../router/types.js'
import type { AuditLogger } from '../server/audit-log.js'
import type { CorsConfig } from '../server/cors.js'
import type { DisallowedConfig } from '../server/csrf.js'
import { createPluginRunnerFromConfig } from '../server/load-plugins.js'
import { generateNonce } from '../server/nonce.js'
import type { PluginRunner } from '../server/plugin-runner.js'
import type { RateLimitConfig } from '../server/rate-limit.js'
import { applySecurityHeaders } from '../server/security-headers.js'
import type { SecurityHeadersConfig } from '../server/security-headers.js'
import { resolveTransformer, type TheoTransformer } from '../server/transformer.js'
import { scanWebSocketRoutes } from '../server/ws-scan.js'

import { createActionMiddleware } from './action-middleware.js'
import { createApiMiddleware } from './api-middleware.js'
import {
  DEVTOOLS_RESOLVED_ID,
  DEVTOOLS_VIRTUAL_ID,
  injectDevtoolsScript,
} from './inject-devtools.js'
import { injectEntryClient } from './inject-entry-client.js'
import { injectStylesheets } from './inject-stylesheets.js'
import { integrateUseTheoUI } from './integrate-ui.js'
import { resolveTheoRootDir } from './resolve-theo-root.js'
import { detectTheoUi, type TheoUiDetectResult } from './theoui-detect.js'

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

  return [theoPlugin(rootOrOptions), ...uiPlugins]
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
      if (configLoadedOnce) return
      configLoadedOnce = true
      try {
        const userConfig = await loadConfig(projectRoot)
        pluginRunner = await createPluginRunnerFromConfig(userConfig.plugins)
        // T1.2 — resolve transformer once from config.serialization
        transformer = resolveTransformer(userConfig.serialization)
        // T1.4 — extract batching config. The Zod schema admits
        // `boolean | { max?: number }`; we normalize both to an object.
        if (userConfig.batching === true) {
          resolvedBatching = {}
        } else if (typeof userConfig.batching === 'object') {
          resolvedBatching = userConfig.batching
        }
        // T2.1 — detect TheoUI presence + resolve config
        theoUi = detectTheoUi(projectRoot, userConfig.ui)
        // Phase 5 — CSRF warn-first (EC-1)
        // T6.1 — default flipped from 'warn' to 'strict' for 0.3.0.
        csrfMode = userConfig.security?.csrf ?? 'strict'
        // Phase 6 — Default security headers (D4 / EC-2)
        securityHeaders = userConfig.security?.headers
        // T5.1 — disallowedRoutes per-route escalation
        disallowed = userConfig.security?.disallowed
        // T1.2 — CORS config
        cors = userConfig.security?.cors
        // T4.1 — Audit logger (when user provides one). Validate duck shape lazily.
        const maybeLogger = (userConfig as { audit?: { logger?: unknown } }).audit?.logger
        if (maybeLogger && typeof (maybeLogger as { log?: unknown }).log === 'function') {
          auditLogger = maybeLogger as AuditLogger
        }
        // T1.2 — devtools opt-out
        devtoolsEnabled = userConfig.devtools !== false
      } catch {
        // Config load errors are surfaced elsewhere (validate-structure).
        // Plugin runner remains undefined; middlewares run without hooks.
      }
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

      return {
        envPrefix: 'THEO_PUBLIC_',
        optimizeDeps: optimizeDepsInclude.length > 0 ? { include: optimizeDepsInclude } : undefined,
        server: {
          ...(warmupClientFiles.length > 0
            ? { warmup: { clientFiles: warmupClientFiles } }
            : {}),
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

        // 3. Stylesheet links (dev only) — fixes LCP. Without this, CSS
        // only loads after JS bundle executes the `import 'styles.css'`,
        // causing FOUC + LCP > 9s on cold loads. In prod, Vite's SSR
        // bundle emits the correct hashed <link> automatically.
        const styles = injectStylesheets(next, {
          isDev: isDevMode,
          hasPackage: (name) => existsSync(resolve(projectRoot, 'node_modules', ...name.split('/'))),
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

    // eslint-disable-next-line max-lines-per-function -- Vite `configureServer` is the conventional place to wire middlewares + watchers + WS upgrades; co-located by design
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

      // SSR dev middleware
      if (ssrEnabled) {
        // Connect-style middleware expects a sync next(); we delegate to
        // an async handler via void-wrapped IIFE so the returned Promise
        // does not satisfy a callback that should return void.
        server.middlewares.use((req, res, next) => {
          void (async () => {
            const url = req.url ?? '/'
            // Skip API, static, and HMR requests
            if (
              url.startsWith('/api/') ||
              url.startsWith('/@') ||
              url.startsWith('/node_modules/') ||
              url.includes('.')
            ) {
              next()
              return
            }

            try {
              const indexPath = resolve(projectRoot, 'index.html')
              let template = readFileSync(indexPath, 'utf-8')
              template = await server.transformIndexHtml(url, template)

              // T4.1 — Generate a per-request nonce and apply security
              // headers BEFORE we render. The same nonce flows into React's
              // `renderToPipeableStream({ nonce })` so every emitted
              // <script> carries it AND into the CSP script-src directive.
              // EC-3: applySecurityHeaders also forces Cache-Control:
              // private, no-store so CDNs don't reserve the HTML with a
              // stale nonce.
              const nonce = generateNonce()
              applySecurityHeaders(
                res,
                securityHeaders ?? {},
                { production: process.env.NODE_ENV === 'production' },
                { nonce },
              )

              interface SsrEntryServer {
                render: (
                  url: string,
                  opts: { nonce: string },
                ) => Promise<string | { redirect: Response }>
              }
              const mod = (await server.ssrLoadModule(VIRTUAL_ENTRY_SERVER_ID)) as SsrEntryServer
              const result = await mod.render(url, { nonce })

              if (typeof result === 'object' && 'redirect' in result) {
                res.writeHead(302, {
                  Location: result.redirect.headers.get('location') ?? '/',
                })
                res.end()
                return
              }

              // render() returns HTML string — inject into template
              const ssrHtml = result
              const rootDivMatch = /<div id=["']root["'][^>]*>/.exec(template)
              if (!rootDivMatch) {
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end(template)
                return
              }

              const splitIdx = template.indexOf(rootDivMatch[0]) + rootDivMatch[0].length
              const html = template.slice(0, splitIdx) + ssrHtml + template.slice(splitIdx)

              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(html)
            } catch (err) {
              server.ssrFixStacktrace(err as Error)
              console.error('[SSR Dev Error]', err)
              // Fallback to CSR
              next()
              return
            }
          })()
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

      // WebSocket upgrade handler (dev mode)
      const wsRoutes = scanWebSocketRoutes(resolve(projectRoot, 'server'))
      const wsHttpServer = server.httpServer
      if (wsRoutes.length > 0 && wsHttpServer) {
        // Lazy-import `ws` so non-WS apps don't pay the cost.
        void import('ws')
          .then(({ WebSocketServer }) => {
            const wss = new WebSocketServer({ noServer: true })

            interface WsHandler {
              onOpen?: (ws: unknown, request: unknown) => void | Promise<void>
              onMessage?: (ws: unknown, data: string) => void | Promise<void>
              onClose?: (ws: unknown, code: number, reason: Buffer) => void | Promise<void>
              onError?: (ws: unknown, err: Error) => void | Promise<void>
            }

            wsHttpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
              void (async () => {
                const url = request.url ?? '/'
                if (!url.startsWith('/ws/')) return // Let Vite handle HMR etc.

                const wsPath = url.split('?')[0]
                const match = wsRoutes.find((r) => r.wsPath === wsPath)
                if (!match) {
                  socket.destroy()
                  return
                }

                try {
                  const mod = await server.ssrLoadModule(match.filePath)
                  const handler = ((mod as { default?: unknown }).default ?? mod) as WsHandler

                  wss.handleUpgrade(request, socket, head, (ws) => {
                    void handler.onOpen?.(ws, request)
                    ws.on('message', (data: Buffer) => {
                      void handler.onMessage?.(ws, data.toString())
                    })
                    ws.on('close', (code: number, reason: Buffer) => {
                      void handler.onClose?.(ws, code, reason)
                    })
                    ws.on('error', (err: Error) => {
                      void handler.onError?.(ws, err)
                    })
                  })
                } catch {
                  socket.destroy()
                }
              })()
            })
          })
          .catch(() => {
            console.warn(
              '[Theo] WebSocket routes found but "ws" package not installed. Run: npm install ws',
            )
          })
      }

      // T2.4 — clear devtools WS reference on shutdown
      server.httpServer?.once('close', () => {
        ;(globalThis as { __theoViteHotServer?: unknown }).__theoViteHotServer = undefined
      })
    },
  }
}
