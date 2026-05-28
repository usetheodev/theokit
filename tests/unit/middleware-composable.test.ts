import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanMiddlewares } from '../../packages/theo/src/server/scan/middleware-scan.js'
import { runMiddlewareAndContext } from '../../packages/theo/src/server/http/middleware-runner.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { LoadModule } from '../../packages/theo/src/server/scan/module-loader.js'

// ---------------------------------------------------------------------------
// scanMiddlewares tests — use real filesystem
// ---------------------------------------------------------------------------

describe('scanMiddlewares', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `theo-mw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should return sorted paths for middleware files', () => {
    // Given: server/middleware/ with 01-cors.ts and 02-auth.ts
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '02-auth.ts'), 'export default () => {}')
    writeFileSync(join(mwDir, '01-cors.ts'), 'export default () => {}')

    // When: scanning middlewares
    const result = scanMiddlewares(tempDir)

    // Then: paths are sorted alphabetically
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(join(mwDir, '01-cors.ts'))
    expect(result[1]).toBe(join(mwDir, '02-auth.ts'))
  })

  it('should ignore files starting with underscore', () => {
    // Given: server/middleware/ with _helpers.ts only
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '_helpers.ts'), 'export const helper = true')

    // When: scanning
    const result = scanMiddlewares(tempDir)

    // Then: no files returned
    expect(result).toHaveLength(0)
  })

  it('should ignore files starting with dot', () => {
    // Given: server/middleware/ with .hidden.ts
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '.hidden.ts'), 'export default () => {}')

    // When: scanning
    const result = scanMiddlewares(tempDir)

    // Then: no files returned
    expect(result).toHaveLength(0)
  })

  it('should ignore non-ts/js files', () => {
    // Given: server/middleware/ with a .json file
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, 'config.json'), '{}')
    writeFileSync(join(mwDir, 'cors.ts'), 'export default () => {}')

    // When: scanning
    const result = scanMiddlewares(tempDir)

    // Then: only .ts file returned
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('cors.ts')
  })

  it('should return empty array when middleware directory does not exist', () => {
    // Given: no server/middleware/ directory
    // When: scanning
    const result = scanMiddlewares(tempDir)

    // Then: empty array
    expect(result).toEqual([])
  })

  it('should ignore subdirectories inside middleware/', () => {
    // Given: server/middleware/ with a subdirectory
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    mkdirSync(join(mwDir, 'nested'))
    writeFileSync(join(mwDir, 'cors.ts'), 'export default () => {}')

    // When: scanning
    const result = scanMiddlewares(tempDir)

    // Then: only files, not directories
    expect(result).toHaveLength(1)
  })

  it('should accept .js, .jsx, .tsx extensions', () => {
    // Given: files with various valid extensions
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, 'a.js'), '')
    writeFileSync(join(mwDir, 'b.jsx'), '')
    writeFileSync(join(mwDir, 'c.tsx'), '')
    writeFileSync(join(mwDir, 'd.ts'), '')

    // When: scanning
    const result = scanMiddlewares(tempDir)

    // Then: all four accepted
    expect(result).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// runMiddlewareAndContext tests — mock loadModule
// ---------------------------------------------------------------------------

function createMockReq(): IncomingMessage {
  return {} as IncomingMessage
}

function createMockRes(opts: { writableEnded?: boolean } = {}): ServerResponse {
  return {
    writableEnded: opts.writableEnded ?? false,
  } as unknown as ServerResponse
}

describe('runMiddlewareAndContext', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `theo-mw-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('should skip middleware when neither file nor directory exists', async () => {
    // Given: empty server directory, no middleware
    const loadModule: LoadModule = vi.fn()

    // When: running middleware
    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loadModule,
      tempDir,
    )

    // Then: not aborted, empty context
    expect(result.aborted).toBe(false)
    expect(result.ctx).toEqual({})
    expect(loadModule).not.toHaveBeenCalled()
  })

  it('should run single middleware.ts file (backward compat)', async () => {
    // Given: server/middleware.ts exists
    writeFileSync(join(tempDir, 'middleware.ts'), '')
    const callOrder: string[] = []

    const loadModule: LoadModule = vi.fn().mockResolvedValue({
      default: (_req: unknown, _res: unknown, next: () => Promise<void>) => {
        callOrder.push('single-mw')
        return next()
      },
    })

    // When: running middleware
    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loadModule,
      tempDir,
    )

    // Then: middleware ran, not aborted
    expect(result.aborted).toBe(false)
    expect(callOrder).toEqual(['single-mw'])
  })

  it('should run middleware chain from directory in sorted order', async () => {
    // Given: server/middleware/ with two files
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '01-first.ts'), '')
    writeFileSync(join(mwDir, '02-second.ts'), '')

    const callOrder: string[] = []

    const loadModule: LoadModule = vi.fn().mockImplementation(async (path: string) => {
      if (path.includes('01-first')) {
        return {
          default: (_req: unknown, _res: unknown, next: () => Promise<void>) => {
            callOrder.push('first')
            return next()
          },
        }
      }
      if (path.includes('02-second')) {
        return {
          default: (_req: unknown, _res: unknown, next: () => Promise<void>) => {
            callOrder.push('second')
            return next()
          },
        }
      }
      return {}
    })

    // When: running middleware
    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loadModule,
      tempDir,
    )

    // Then: both ran in order, not aborted
    expect(result.aborted).toBe(false)
    expect(callOrder).toEqual(['first', 'second'])
  })

  it('should abort chain when a middleware does not call next()', async () => {
    // Given: two middlewares, first does NOT call next
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '01-blocker.ts'), '')
    writeFileSync(join(mwDir, '02-never-runs.ts'), '')

    const callOrder: string[] = []

    const loadModule: LoadModule = vi.fn().mockImplementation(async (path: string) => {
      if (path.includes('01-blocker')) {
        return {
          default: (_req: unknown, _res: unknown, _next: () => Promise<void>) => {
            callOrder.push('blocker')
            // deliberately NOT calling next()
          },
        }
      }
      if (path.includes('02-never-runs')) {
        return {
          default: (_req: unknown, _res: unknown, next: () => Promise<void>) => {
            callOrder.push('never-runs')
            return next()
          },
        }
      }
      return {}
    })

    // When: running middleware
    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loadModule,
      tempDir,
    )

    // Then: aborted after first, second never ran
    expect(result.aborted).toBe(true)
    expect(callOrder).toEqual(['blocker'])
  })

  it('should abort chain when response is ended by a middleware', async () => {
    // Given: middleware that ends the response
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '01-responder.ts'), '')
    writeFileSync(join(mwDir, '02-after.ts'), '')

    const mockRes = createMockRes()

    const loadModule: LoadModule = vi.fn().mockImplementation(async (path: string) => {
      if (path.includes('01-responder')) {
        return {
          default: (_req: unknown, _res: unknown, next: () => Promise<void>) => {
            // Simulate response ending
            ;(mockRes as { writableEnded: boolean }).writableEnded = true
            return next()
          },
        }
      }
      if (path.includes('02-after')) {
        return {
          default: (_req: unknown, _res: unknown, next: () => Promise<void>) => next(),
        }
      }
      return {}
    })

    // When: running middleware
    const result = await runMiddlewareAndContext(createMockReq(), mockRes, loadModule, tempDir)

    // Then: aborted because response ended
    expect(result.aborted).toBe(true)
  })

  it('should throw error when both middleware.ts and middleware/ exist', async () => {
    // Given: both server/middleware.ts AND server/middleware/ with files
    writeFileSync(join(tempDir, 'middleware.ts'), '')
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '01-cors.ts'), '')

    const loadModule: LoadModule = vi.fn()

    // When/Then: should throw about ambiguity
    await expect(
      runMiddlewareAndContext(createMockReq(), createMockRes(), loadModule, tempDir),
    ).rejects.toThrow('Ambiguous middleware configuration')
  })

  it('should run middleware chain and then create context', async () => {
    // Given: middleware dir + context.ts
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '01-cors.ts'), '')
    writeFileSync(join(tempDir, 'context.ts'), '')

    const loadModule: LoadModule = vi.fn().mockImplementation(async (path: string) => {
      if (path.includes('01-cors')) {
        return {
          default: (_req: unknown, _res: unknown, next: () => Promise<void>) => next(),
        }
      }
      if (path.includes('context.ts')) {
        return {
          createContext: () => ({ userId: '123' }),
        }
      }
      return {}
    })

    // When: running middleware
    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loadModule,
      tempDir,
    )

    // Then: context created, not aborted
    expect(result.aborted).toBe(false)
    expect(result.ctx).toEqual({ userId: '123' })
  })

  it('should skip non-function default exports in middleware chain', async () => {
    // Given: middleware with non-function default export
    const mwDir = join(tempDir, 'middleware')
    mkdirSync(mwDir)
    writeFileSync(join(mwDir, '01-config.ts'), '')
    writeFileSync(join(mwDir, '02-real.ts'), '')

    const callOrder: string[] = []

    const loadModule: LoadModule = vi.fn().mockImplementation(async (path: string) => {
      if (path.includes('01-config')) {
        return { default: { some: 'config' } } // not a function
      }
      if (path.includes('02-real')) {
        return {
          default: (_req: unknown, _res: unknown, next: () => Promise<void>) => {
            callOrder.push('real')
            return next()
          },
        }
      }
      return {}
    })

    // When: running middleware
    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loadModule,
      tempDir,
    )

    // Then: skipped non-function, ran the real one
    expect(result.aborted).toBe(false)
    expect(callOrder).toEqual(['real'])
  })
})
