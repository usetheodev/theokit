import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface MiddlewareResult {
  ctx: unknown
  aborted: boolean
}

export async function runMiddlewareAndContext(
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  serverDir: string,
): Promise<MiddlewareResult> {
  // 1. Run middleware (if exists)
  const middlewarePath = join(serverDir, 'middleware.ts')
  if (existsSync(middlewarePath)) {
    const mod = await vite.ssrLoadModule(middlewarePath)
    const mw = mod.default
    if (typeof mw === 'function') {
      let nextCalled = false
      await mw(req, res, async () => {
        nextCalled = true
      })
      // EC-1: Check if response was already sent (middleware bug: next() + res.end())
      if (!nextCalled || res.writableEnded) {
        return { ctx: {}, aborted: true }
      }
    }
  }

  // 2. Create context (if exists)
  let ctx: unknown = {}
  const contextPath = join(serverDir, 'context.ts')
  if (existsSync(contextPath)) {
    const mod = await vite.ssrLoadModule(contextPath)
    if (typeof mod.createContext === 'function') {
      ctx = await mod.createContext({ request: req })
    }
  }

  return { ctx, aborted: false }
}
