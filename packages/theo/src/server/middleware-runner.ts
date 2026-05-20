/* eslint-disable security/detect-non-literal-fs-filename --
 * Middleware runner. Checks for `serverDir/middleware.ts` + `context.ts`,
 * cached by CR-017. Paths are derived from `serverDir` (cwd-derived). No
 * HTTP input.
 */
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'

import { scanMiddlewares } from './middleware-scan.js'
import type { LoadModule } from './module-loader.js'

export interface MiddlewareResult {
  ctx: unknown
  aborted: boolean
}

// CR-017 fix: in dev `existsSync` + `scanMiddlewares` ran on EVERY request,
// turning a constant filesystem read into per-request overhead. We cache
// the scan result by serverDir. In prod the same scan should be done once
// at boot — `theo build` already emits a manifest, but the dev path uses
// this runtime cache as a defense-in-depth. The cache is invalidated by
// process restart (Vite HMR replaces the module, clearing this map).
interface MiddlewareCacheEntry {
  singleFilePath: string
  singleFileExists: boolean
  dirMiddlewares: string[]
}
const middlewareCache = new Map<string, MiddlewareCacheEntry>()

export function _resetMiddlewareCacheForTests(): void {
  middlewareCache.clear()
}

// Middleware default-export contract: a function (req, res, next).
type MiddlewareFn = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>
type ContextFactory = (args: { request: IncomingMessage; response: ServerResponse }) => unknown // Promise<unknown> is structurally `unknown`; one arm covers both.

function getCachedScan(serverDir: string): MiddlewareCacheEntry {
  let cached = middlewareCache.get(serverDir)
  if (!cached) {
    const singleFilePath = join(serverDir, 'middleware.ts')
    cached = {
      singleFilePath,
      singleFileExists: existsSync(singleFilePath),
      dirMiddlewares: scanMiddlewares(serverDir),
    }
    middlewareCache.set(serverDir, cached)
  }
  return cached
}

async function runOneMiddleware(
  mw: MiddlewareFn,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ nextCalled: boolean }> {
  // Object-held flag avoids TS narrowing `let nextCalled = false` to the
  // literal `false`, which would make `!nextCalled` an "always-truthy"
  // condition under control-flow analysis.
  const state = { nextCalled: false }
  await mw(req, res, () => {
    state.nextCalled = true
  })
  return state
}

export async function runMiddlewareAndContext(
  req: IncomingMessage,
  res: ServerResponse,
  loadModule: LoadModule,
  serverDir: string,
): Promise<MiddlewareResult> {
  const { singleFilePath, singleFileExists, dirMiddlewares } = getCachedScan(serverDir)
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
      const mw = mod.default as MiddlewareFn | undefined
      if (typeof mw !== 'function') continue

      const { nextCalled } = await runOneMiddleware(mw, req, res)
      if (!nextCalled || res.writableEnded) {
        return { ctx: {}, aborted: true }
      }
    }
  }

  // 3. Run single middleware file (backward compat)
  if (singleFileExists) {
    const mod = await loadModule(singleFilePath)
    const mw = mod.default as MiddlewareFn | undefined
    if (typeof mw === 'function') {
      const { nextCalled } = await runOneMiddleware(mw, req, res)
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
    const createContext = mod.createContext as ContextFactory | undefined
    if (typeof createContext === 'function') {
      ctx = await createContext({ request: req, response: res })
    }
  }

  return { ctx, aborted: false }
}
