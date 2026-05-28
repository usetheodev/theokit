/**
 * Builds a Vite `server.proxy` configuration from TheoKit's
 * declarative `services: {}` config (T2.1).
 *
 * Pure function — no Vite imports, just data shaping. The Vite plugin
 * (services-dev.ts) calls this and merges the result into `vite.config.server.proxy`.
 *
 * Pattern follows Vite proxy reference (referencias/vite/packages/vite/src/node/server/middlewares/proxy.ts):
 *  - Each path prefix becomes its own entry
 *  - `changeOrigin: true` set by default (matches Vite's string-shortcut behavior)
 *  - User-set entries take precedence on prefix collision (we never clobber)
 */
import type { ServicesConfig } from '../schema/schema.js'

/**
 * Shape compatible with Vite's `server.proxy` type. We intentionally don't
 * import Vite's `ProxyOptions` so this module stays platform-neutral and
 * unit-testable without Vite.
 */
export interface ViteProxyEntry {
  target: string
  changeOrigin: boolean
  rewrite?: (path: string) => string
}

export type ViteProxyConfig = Record<string, string | ViteProxyEntry>

export function buildServicesProxyConfig(
  services: ServicesConfig,
  userProxy: ViteProxyConfig = {},
): ViteProxyConfig {
  const fromServices: ViteProxyConfig = {}
  for (const [, def] of Object.entries(services)) {
    const prefix = def.proxy
    fromServices[prefix] = {
      target: `http://localhost:${String(def.port)}`,
      changeOrigin: true,
      // Strip the service's `proxy` prefix from the upstream URL so the
      // sidecar receives its own native paths (e.g. `/api/agent/echo` →
      // `/echo`). The sidecar declares routes against its own root path —
      // it doesn't know about the TheoKit proxy prefix.
      rewrite: (path: string) =>
        path.startsWith(prefix) ? path.slice(prefix.length) || '/' : path,
    }
  }
  // User proxy wins on collision (we add services first, then spread user on top)
  return { ...fromServices, ...userProxy }
}
