/**
 * Inline request handler for `theokit start` (T4.2 architecture-cleanup).
 *
 * Wires the per-request flow: security headers → action/route/static branches
 * → SSR fallback → CSR fallback → 500 page.
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { generateNonce } from '../../server/auth/nonce.js'
import { sendError } from '../../server/http/send-response.js'
import { buildSecurityHeaders } from '../../server/security/security-headers.js'

import {
  tryServeAction,
  tryServeApiRoute,
  tryServeCustom404,
  tryServeStatic,
  type RequestHandlerCtx,
} from './start-handlers.js'
import {
  isSsrRenderResult,
  type SsrRender,
  type SsrRenderResult,
  type SsrRenderStreaming,
} from './start-ssr-setup.js'

export interface RequestHandlerContext {
  buildCtx: (
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    startTime: number,
  ) => RequestHandlerCtx
  securityHeadersConfig: Parameters<typeof buildSecurityHeaders>[0]
  ssrRender: SsrRender | null
  ssrRenderStreaming: SsrRenderStreaming | null
  ssrStreamingEnabled: boolean
  htmlHead: string
  htmlTail: string
  indexHtml: string
  custom500Html: string | null
}

function asSsrRenderResult(value: SsrRenderResult): SsrRenderResult {
  return value
}

/* eslint-disable complexity, sonarjs/cognitive-complexity --
 * inline request orchestrator co-located so the lifecycle is readable end-to-end.
 */
export function createRequestHandler(
  ctx: RequestHandlerContext,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = req.url ?? '/'
      const requestId = randomUUID()
      const start = Date.now()

      // Per-request nonce (EC-6 dev/prod parity).
      const nonce = generateNonce()
      const securityHeaders = buildSecurityHeaders(
        ctx.securityHeadersConfig,
        { production: true },
        { nonce },
      )
      for (const [k, v] of Object.entries(securityHeaders)) {
        res.setHeader(k, v)
      }

      const handlerCtx = ctx.buildCtx(req, res, requestId, start)

      try {
        if (await tryServeAction(handlerCtx)) return
        if (await tryServeApiRoute(handlerCtx)) return
        if (tryServeStatic(handlerCtx)) return
        if (tryServeCustom404(handlerCtx)) return

        // SSR streaming branch
        if (ctx.ssrStreamingEnabled && ctx.ssrRenderStreaming) {
          const controller = new AbortController()
          const onClose = (): void => {
            controller.abort()
          }
          req.on('close', onClose)
          try {
            const result = await ctx.ssrRenderStreaming(url, res, {
              signal: controller.signal,
              nonce,
            })
            if (result && typeof result === 'object' && 'redirect' in result) {
              res.writeHead(302, { Location: result.redirect.headers.get('location') ?? '/' })
              res.end()
              return
            }
            return
          } catch (streamErr) {
            console.error('[SSR Stream Error]', (streamErr as Error).message)
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/html' })
            }
            if (!res.writableEnded) {
              res.end(ctx.custom500Html ?? '<h1>500 — Server Error</h1>')
            }
            return
          } finally {
            req.removeListener('close', onClose)
          }
        }

        // SSR (non-streaming) branch
        if (ctx.ssrRender) {
          try {
            const result = await ctx.ssrRender(url, { nonce })
            if (result && typeof result === 'object' && 'redirect' in result) {
              res.writeHead(302, { Location: result.redirect.headers.get('location') ?? '/' })
              res.end()
              return
            }
            let ssrHtml = ''
            let hydrationScript = ''
            if (typeof result === 'string') {
              ssrHtml = result
            } else if (isSsrRenderResult(result)) {
              const rendered = asSsrRenderResult(result)
              ssrHtml = rendered.html
              const dataJson = JSON.stringify(rendered.hydrationData).replace(/</g, '\\u003c')
              hydrationScript = `<script${
                nonce ? ` nonce="${nonce}"` : ''
              }>window.__staticRouterHydrationData=${dataJson}</script>`
            }
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(ctx.htmlHead + ssrHtml + hydrationScript + ctx.htmlTail)
            return
          } catch (ssrErr) {
            console.error('[SSR Error] Falling back to CSR:', (ssrErr as Error).message)
            // Fall through to CSR fallback
          }
        }

        // CSR fallback
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(ctx.indexHtml)
      } catch (err) {
        if (ctx.custom500Html && !res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/html' })
          res.end(ctx.custom500Html)
        } else if (!res.headersSent) {
          sendError(res, 'INTERNAL_ERROR', (err as Error).message, 500)
        } else {
          res.end()
        }
      }
    })()
  }
}
/* eslint-enable complexity, sonarjs/cognitive-complexity */
