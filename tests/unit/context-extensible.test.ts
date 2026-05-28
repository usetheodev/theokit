import { describe, it, expect } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { runMiddlewareAndContext } from '../../packages/theo/src/server/http/middleware-runner.js'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function createMockReq(): IncomingMessage {
  return { method: 'GET', url: '/', headers: {} } as unknown as IncomingMessage
}

function createMockRes(): ServerResponse {
  return { writableEnded: false } as unknown as ServerResponse
}

function createTempServerDir(contextCode?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'theo-ctx-test-'))
  if (contextCode) {
    writeFileSync(join(dir, 'context.ts'), contextCode)
  }
  return dir
}

function createMockLoader(modules: Record<string, Record<string, unknown>>) {
  return async (path: string) => {
    const mod = modules[path]
    if (!mod) throw new Error(`Module not found: ${path}`)
    return mod
  }
}

describe('Context extensibility', () => {
  it('should receive custom user data from createContext', async () => {
    const serverDir = createTempServerDir('dummy')
    const contextPath = join(serverDir, 'context.ts')

    const loader = createMockLoader({
      [contextPath]: {
        createContext: () => ({ user: 'alice', role: 'admin' }),
      },
    })

    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loader,
      serverDir,
    )
    expect(result.aborted).toBe(false)
    const ctx = result.ctx as { user: string; role: string }
    expect(ctx.user).toBe('alice')
    expect(ctx.role).toBe('admin')
  })

  it('should preserve nested objects in context', async () => {
    const serverDir = createTempServerDir('dummy')
    const contextPath = join(serverDir, 'context.ts')

    const loader = createMockLoader({
      [contextPath]: {
        createContext: () => ({
          user: { name: 'bob', permissions: ['read', 'write'] },
          config: { theme: 'dark' },
        }),
      },
    })

    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loader,
      serverDir,
    )
    const ctx = result.ctx as {
      user: { name: string; permissions: string[] }
      config: { theme: string }
    }
    expect(ctx.user.name).toBe('bob')
    expect(ctx.user.permissions).toEqual(['read', 'write'])
    expect(ctx.config.theme).toBe('dark')
  })

  it('should accept agent-like metadata in context', async () => {
    const serverDir = createTempServerDir('dummy')
    const contextPath = join(serverDir, 'context.ts')

    const loader = createMockLoader({
      [contextPath]: {
        createContext: () => ({
          agentId: 'agent-123',
          tools: ['search', 'calculator'],
          model: 'gpt-4',
        }),
      },
    })

    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loader,
      serverDir,
    )
    const ctx = result.ctx as { agentId: string; tools: string[]; model: string }
    expect(ctx.agentId).toBe('agent-123')
    expect(ctx.tools).toEqual(['search', 'calculator'])
    expect(ctx.model).toBe('gpt-4')
  })

  it('should default to empty object when no context.ts exists', async () => {
    const serverDir = createTempServerDir() // no context.ts

    const loader = createMockLoader({})

    const result = await runMiddlewareAndContext(
      createMockReq(),
      createMockRes(),
      loader,
      serverDir,
    )
    expect(result.aborted).toBe(false)
    expect(result.ctx).toEqual({})
  })
})
