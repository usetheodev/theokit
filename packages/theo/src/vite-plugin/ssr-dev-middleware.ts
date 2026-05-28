/**
 * T2.2 (architecture-medium-deferrals plan, ADR D2) — SSR dev middleware
 * extracted from `vite-plugin/index.ts` for SRP.
 *
 * `setupSsrDevMiddleware(server, opts)` registers a Connect-style middleware
 * on the Vite dev server that:
 *   1. Skips API, static, and HMR requests (let other middlewares handle).
 *   2. Reads `index.html`, runs `transformIndexHtml`.
 *   3. Generates per-request nonce, applies security headers (CSP + Cache-Control).
 *   4. Calls `ssrLoadModule(VIRTUAL_ENTRY_SERVER_ID).render(url, { nonce })`.
 *   5. Injects rendered HTML (with hydration script) into root div.
 *   6. On error: ssrFixStacktrace + fallback to CSR via `next()`.
 *
 * No-op when `ssrEnabled === false`. Caller's responsibility to gate.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ViteDevServer } from 'vite'

import { generateNonce } from '../server/auth/nonce.js'
import {
  applySecurityHeaders,
  type SecurityHeadersConfig,
} from '../server/security/security-headers.js'

interface SsrRenderResult {
  html: string
  hydrationData: {
    loaderData?: unknown
    actionData?: unknown
    errors?: unknown
  }
}

interface SsrEntryServer {
  render: (
    url: string,
    opts: { nonce: string },
  ) => Promise<SsrRenderResult | { redirect: Response } | string>
}

function isSsrRenderResult(value: unknown): value is SsrRenderResult {
  if (typeof value !== 'object' || value === null) return false
  if (!('html' in value)) return false
  return typeof (value as Record<string, unknown>).html === 'string'
}

export interface SsrDevMiddlewareOptions {
  projectRoot: string
  virtualEntryServerId: string
  securityHeaders: SecurityHeadersConfig | undefined
}

/**
 * Attach the SSR dev middleware to a Vite dev server. Caller decides whether
 * to invoke this based on `ssrEnabled` — this function does not gate.
 */
export function setupSsrDevMiddleware(server: ViteDevServer, opts: SsrDevMiddlewareOptions): void {
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
        const indexPath = resolve(opts.projectRoot, 'index.html')
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- projectRoot is from `theokit dev`'s caller-controlled cwd
        let template = readFileSync(indexPath, 'utf-8')
        template = await server.transformIndexHtml(url, template)

        // T4.1 — Generate a per-request nonce and apply security headers BEFORE render.
        // The same nonce flows into React's renderToPipeableStream({ nonce }) so every
        // emitted <script> carries it AND into the CSP script-src directive.
        // EC-3: applySecurityHeaders also forces Cache-Control: private, no-store.
        const nonce = generateNonce()
        applySecurityHeaders(
          res,
          opts.securityHeaders ?? {},
          { production: process.env.NODE_ENV === 'production' },
          { nonce },
        )

        const mod = (await server.ssrLoadModule(opts.virtualEntryServerId)) as SsrEntryServer
        const result = await mod.render(url, { nonce })

        if (result && typeof result === 'object' && 'redirect' in result) {
          res.writeHead(302, {
            Location: result.redirect.headers.get('location') ?? '/',
          })
          res.end()
          return
        }

        // Backward-compat: old render returned string. New shape returns
        // { html, hydrationData } so the framework can emit the hydration
        // data script OUTSIDE the React root (fixes hydration mismatch).
        let ssrHtml: string
        let hydrationScript = ''
        if (typeof result === 'string') {
          ssrHtml = result
        } else if (isSsrRenderResult(result)) {
          ssrHtml = result.html
          const dataJson = JSON.stringify(result.hydrationData).replace(/</g, '\\u003c')
          hydrationScript = `<script nonce="${nonce}">window.__staticRouterHydrationData=${dataJson}</script>`
        } else {
          ssrHtml = ''
        }
        const rootDivMatch = /<div id=["']root["'][^>]*>/.exec(template)
        if (!rootDivMatch) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(template)
          return
        }

        const splitIdx = template.indexOf(rootDivMatch[0]) + rootDivMatch[0].length
        const html =
          template.slice(0, splitIdx) + ssrHtml + hydrationScript + template.slice(splitIdx)

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
