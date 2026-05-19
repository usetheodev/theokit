import type { Plugin } from 'vite'
import { resolve, basename, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { scanRoutes } from '../router/scan.js'
import { generateRouteManifest } from '../router/generate.js'
import { generateEntryClient } from '../router/entry.js'
import { generateEntryServer } from '../router/entry-server.js'
import { isRouteFile } from '../router/types.js'
import { createApiMiddleware } from './api-middleware.js'
import { createActionMiddleware } from './action-middleware.js'
import { scanWebSocketRoutes } from '../server/ws-scan.js'
import type { RateLimitConfig } from '../server/rate-limit.js'
import { createPluginRunnerFromConfig } from '../server/load-plugins.js'
import type { PluginRunner } from '../server/plugin-runner.js'
import { loadConfig } from '../config/load-config.js'
import { resolveTransformer, type TheoTransformer } from '../server/transformer.js'
import { detectTheoUi, type TheoUiDetectResult } from './theoui-detect.js'
import { resolveTheoRootDir } from './resolve-theo-root.js'
import { injectEntryClient } from './inject-entry-client.js'
import { generateNonce } from '../server/nonce.js'
import { applySecurityHeaders } from '../server/security-headers.js'

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

export function theoPlugin(rootOrOptions?: string | TheoPluginOptions): Plugin {
  const options = typeof rootOrOptions === 'string' ? { root: rootOrOptions } : (rootOrOptions ?? {})
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
  let csrfMode: 'off' | 'warn' | 'strict' = 'warn'
  let securityHeaders: import('../server/security-headers.js').SecurityHeadersConfig | undefined
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
        // T1.4 — extract batching config
        if (userConfig.batching === true) {
          resolvedBatching = {}
        } else if (
          typeof userConfig.batching === 'object' &&
          userConfig.batching !== null
        ) {
          resolvedBatching = userConfig.batching as { max?: number }
        }
        // T2.1 — detect TheoUI presence + resolve config
        theoUi = detectTheoUi(projectRoot, userConfig.ui as never)
        // Phase 5 — CSRF warn-first (EC-1)
        csrfMode = (userConfig.security?.csrf ?? 'warn') as 'off' | 'warn' | 'strict'
        // Phase 6 — Default security headers (D4 / EC-2)
        securityHeaders = userConfig.security?.headers as never
      } catch (err) {
        // Config load errors are surfaced elsewhere (validate-structure).
        // Plugin runner remains undefined; middlewares run without hooks.
        void err
      }
    },

    config() {
      // Detect whether we're running from source (.ts) or compiled dist (.js)
      const ext = existsSync(resolve(theoSrcDir, 'index.ts')) ? '.ts' : '.js'
      return {
        envPrefix: 'THEO_PUBLIC_',
        resolve: {
          alias: [
            // Order matters: most-specific first so `theokit/X` doesn't
            // get matched by the bare `theokit` alias.
            { find: 'theokit/server', replacement: resolve(theoSrcDir, `server/index${ext}`) },
            { find: 'theokit/client', replacement: resolve(theoSrcDir, `client/index${ext}`) },
            { find: 'theokit/react-query', replacement: resolve(theoSrcDir, `react-query/index${ext}`) },
            { find: 'theokit/vite-plugin', replacement: resolve(theoSrcDir, `vite-plugin/index${ext}`) },
            { find: 'theokit/adapters/web-shim', replacement: resolve(theoSrcDir, `adapters/web-shim${ext}`) },
            { find: 'theokit/adapters/ws-shim', replacement: resolve(theoSrcDir, `adapters/ws-shim${ext}`) },
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
        const result = injectEntryClient(html)
        if (result.warning) {
          console.warn(result.warning)
        }
        return result.html
      },
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ENTRY_ID) return RESOLVED_ENTRY_ID
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_MANIFEST_ID
      if (id === VIRTUAL_ENTRY_SERVER_ID) return RESOLVED_ENTRY_SERVER_ID
      if (id === VIRTUAL_RUNTIME_CONFIG_ID) return RESOLVED_RUNTIME_CONFIG_ID
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
        return generateRouteManifest(tree)
      }
      if (id === RESOLVED_ENTRY_SERVER_ID) {
        // SSR tree MUST mirror client tree shape — pass theoUi through so
        // <TheoUIProvider> wraps in both. Without this, React detects a
        // hydration mismatch and silently falls back to client-only
        // render — onClick handlers never get attached.
        return generateEntryServer({
          streaming: options.ssrStreaming === true,
          theoUi: theoUi?.enabled
            ? { theme: theoUi.config.theme }
            : undefined,
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
    },

    configureServer(server) {
      // Server middleware (action before API — more specific prefix first)
      const serverDir = resolve(projectRoot, 'server')
      server.middlewares.use(createActionMiddleware(server, serverDir, { pluginRunner }))
      server.middlewares.use(
        createApiMiddleware(server, serverDir, {
          rateLimitConfig: options.rateLimit,
          pluginRunner,
          batching: resolvedBatching,
          transformer,
          csrfMode,
          securityHeaders,
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
        server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? '/'
          // Skip API, static, and HMR requests
          if (url.startsWith('/api/') || url.startsWith('/@') || url.startsWith('/node_modules/') || url.includes('.')) {
            return next()
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

            const mod = await server.ssrLoadModule(VIRTUAL_ENTRY_SERVER_ID)
            const result = await mod.render(url, { nonce })

            if (result && typeof result === 'object' && 'redirect' in result) {
              res.writeHead(302, { Location: (result.redirect as Response).headers.get('location') ?? '/' })
              res.end()
              return
            }

            // render() returns HTML string — inject into template
            const ssrHtml = result as string
            const rootDivMatch = template.match(/<div id=["']root["'][^>]*>/)
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
            return next()
          }
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
      if (wsRoutes.length > 0 && server.httpServer) {
        import('ws').then(({ WebSocketServer }) => {
          const wss = new WebSocketServer({ noServer: true })

          server.httpServer!.on('upgrade', async (request, socket, head) => {
            const url = request.url ?? '/'
            if (!url.startsWith('/ws/')) return // Let Vite handle HMR etc.

            const wsPath = url.split('?')[0]
            const match = wsRoutes.find(r => r.wsPath === wsPath)
            if (!match) { socket.destroy(); return }

            try {
              const mod = await server.ssrLoadModule(match.filePath)
              const handler = mod.default ?? mod

              wss.handleUpgrade(request, socket, head, (ws) => {
                handler.onOpen?.(ws, request)
                ws.on('message', (data: Buffer) => handler.onMessage?.(ws, data.toString()))
                ws.on('close', (code: number, reason: Buffer) => handler.onClose?.(ws, code, reason))
                ws.on('error', (err: Error) => handler.onError?.(ws, err))
              })
            } catch {
              socket.destroy()
            }
          })
        }).catch(() => {
          console.warn('[Theo] WebSocket routes found but "ws" package not installed. Run: npm install ws')
        })
      }
    },
  }
}
