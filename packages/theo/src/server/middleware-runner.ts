import type { IncomingMessage, ServerResponse } from 'node:http'
import type { LoadModule } from './module-loader.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { scanMiddlewares } from './middleware-scan.js'

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
  const singleFilePath = join(serverDir, 'middleware.ts')
  const singleFileExists = existsSync(singleFilePath)
  const dirMiddlewares = scanMiddlewares(serverDir)
  const dirExists = dirMiddlewares.length > 0

  // 1. Ambiguity check — both file and directory is a configuration error
  if (singleFileExists && dirExists) {
    throw new Error(
      'Ambiguous middleware configuration: found both server/middleware.ts and server/middleware/ directory. ' +
      'Use one or the other, not both.',
    )
  }

  // 2. Run middleware chain from directory
  if (dirExists) {
    for (const mwPath of dirMiddlewares) {
      const mod = await loadModule(mwPath)
      const mw = mod.default
      if (typeof mw !== 'function') continue

      let nextCalled = false
      await mw(req, res, async () => { nextCalled = true })

      if (!nextCalled || res.writableEnded) {
        return { ctx: {}, aborted: true }
      }
    }
  }

  // 3. Run single middleware file (backward compat)
  if (singleFileExists) {
    const mod = await loadModule(singleFilePath)
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

  // 4. Create context (if exists)
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
