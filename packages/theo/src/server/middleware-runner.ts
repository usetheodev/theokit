import type { IncomingMessage, ServerResponse } from 'node:http'
import type { LoadModule } from './module-loader.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface MiddlewareResult {
  ctx: unknown
  aborted: boolean
}

export async function runMiddlewareAndContext(
  req: IncomingMessage,
  res: ServerResponse,
  loadModule: LoadModule,
  serverDir: string,
): Promise<MiddlewareResult> {
  // 1. Run middleware (if exists)
  const middlewarePath = join(serverDir, 'middleware.ts')
  if (existsSync(middlewarePath)) {
    const mod = await loadModule(middlewarePath)
    const mw = mod.default
    if (typeof mw === 'function') {
      let nextCalled = false
      await mw(req, res, async () => {
        nextCalled = true
      })
      if (!nextCalled || res.writableEnded) {
        return { ctx: {}, aborted: true }
      }
    }
  }

  // 2. Create context (if exists)
  let ctx: unknown = {}
  const contextPath = join(serverDir, 'context.ts')
  if (existsSync(contextPath)) {
    const mod = await loadModule(contextPath)
    if (typeof mod.createContext === 'function') {
      ctx = await (mod.createContext as Function)({ request: req, response: res })
    }
  }

  return { ctx, aborted: false }
}
