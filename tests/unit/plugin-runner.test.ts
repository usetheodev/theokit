import { describe, it, expect } from 'vitest'
import {
  PluginRunner,
  DuplicatePluginError,
  DuplicateDecorationError,
} from '../../packages/theo/src/server/plugins/plugin-runner.js'
import { defineTheoPlugin } from '../../packages/theo/src/server/define/define-plugin.js'
import type {
  PluginContext,
  PluginErrorContext,
} from '../../packages/theo/src/server/plugin-types.js'

function makeCtx(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    request: { method: 'GET', url: '/', headers: {} } as PluginContext['request'],
    response: {
      writableEnded: false,
      headersSent: false,
    } as PluginContext['response'],
    ctx: {},
    requestId: 'test-req-id',
    ...overrides,
  }
}

describe('PluginRunner — registry', () => {
  it('registers a plugin by name', async () => {
    const runner = new PluginRunner()
    const plugin = defineTheoPlugin({
      name: 'test',
      register() {},
    })
    await runner.register(plugin)
    expect(runner.has('test')).toBe(true)
  })

  it('refuses duplicate plugin names', async () => {
    const runner = new PluginRunner()
    await runner.register(defineTheoPlugin({ name: 'dup', register() {} }))
    await expect(runner.register(defineTheoPlugin({ name: 'dup', register() {} }))).rejects.toThrow(
      DuplicatePluginError,
    )
  })

  it('returns false for has() on unknown plugin', () => {
    const runner = new PluginRunner()
    expect(runner.has('missing')).toBe(false)
  })
})

describe('PluginRunner — onRequest hook', () => {
  it('runs onRequest hooks in registration order', async () => {
    const runner = new PluginRunner()
    const calls: string[] = []
    await runner.register(
      defineTheoPlugin({
        name: 'a',
        register(app) {
          app.addHook('onRequest', () => {
            calls.push('a')
          })
        },
      }),
    )
    await runner.register(
      defineTheoPlugin({
        name: 'b',
        register(app) {
          app.addHook('onRequest', () => {
            calls.push('b')
          })
        },
      }),
    )
    await runner.runOnRequest(makeCtx())
    expect(calls).toEqual(['a', 'b'])
  })

  it('short-circuits when a hook ends the response', async () => {
    const runner = new PluginRunner()
    const calls: string[] = []
    await runner.register(
      defineTheoPlugin({
        name: 'a',
        register(app) {
          app.addHook('onRequest', (hookCtx) => {
            calls.push('a')
            ;(hookCtx.response as { writableEnded: boolean }).writableEnded = true
          })
        },
      }),
    )
    await runner.register(
      defineTheoPlugin({
        name: 'b',
        register(app) {
          app.addHook('onRequest', () => {
            calls.push('b')
          })
        },
      }),
    )
    const ctx = makeCtx()
    const result = await runner.runOnRequest(ctx)
    expect(calls).toEqual(['a'])
    expect(result.shortCircuited).toBe(true)
  })

  it('runs no hooks when nothing is registered', async () => {
    const runner = new PluginRunner()
    const result = await runner.runOnRequest(makeCtx())
    expect(result.shortCircuited).toBe(false)
  })
})

describe('PluginRunner — preHandler hook', () => {
  it('runs preHandler hooks in order', async () => {
    const runner = new PluginRunner()
    const calls: string[] = []
    await runner.register(
      defineTheoPlugin({
        name: 'a',
        register(app) {
          app.addHook('preHandler', () => {
            calls.push('a')
          })
        },
      }),
    )
    await runner.runPreHandler(makeCtx())
    expect(calls).toEqual(['a'])
  })

  it('short-circuits preHandler when response ends', async () => {
    const runner = new PluginRunner()
    const calls: string[] = []
    await runner.register(
      defineTheoPlugin({
        name: 'short',
        register(app) {
          app.addHook('preHandler', (c) => {
            calls.push('short')
            ;(c.response as { writableEnded: boolean }).writableEnded = true
          })
        },
      }),
    )
    await runner.register(
      defineTheoPlugin({
        name: 'never',
        register(app) {
          app.addHook('preHandler', () => {
            calls.push('never')
          })
        },
      }),
    )
    const result = await runner.runPreHandler(makeCtx())
    expect(calls).toEqual(['short'])
    expect(result.shortCircuited).toBe(true)
  })
})

describe('PluginRunner — onResponse hook', () => {
  it('runs onResponse hooks in order', async () => {
    const runner = new PluginRunner()
    const calls: string[] = []
    await runner.register(
      defineTheoPlugin({
        name: 'a',
        register(app) {
          app.addHook('onResponse', () => {
            calls.push('a')
          })
        },
      }),
    )
    await runner.register(
      defineTheoPlugin({
        name: 'b',
        register(app) {
          app.addHook('onResponse', () => {
            calls.push('b')
          })
        },
      }),
    )
    await runner.runOnResponse(makeCtx())
    expect(calls).toEqual(['a', 'b'])
  })

  it('does not loop when onResponse throws inside error path (EC-9)', async () => {
    const runner = new PluginRunner()
    let onErrorCalls = 0
    await runner.register(
      defineTheoPlugin({
        name: 'throw',
        register(app) {
          app.addHook('onResponse', () => {
            throw new Error('onResponse boom')
          })
          app.addHook('onError', () => {
            onErrorCalls++
          })
        },
      }),
    )
    const ctx = makeCtx()
    // Simulating: we're already in the error path
    await runner.runOnResponse(ctx, { inErrorPath: true })
    // onError should NOT be called again because we are already in the error path
    expect(onErrorCalls).toBe(0)
  })
})

describe('PluginRunner — onError hook', () => {
  it('runs onError hooks when an error occurs', async () => {
    const runner = new PluginRunner()
    const captured: unknown[] = []
    await runner.register(
      defineTheoPlugin({
        name: 'logger',
        register(app) {
          app.addHook('onError', (c) => {
            captured.push((c as PluginErrorContext).error)
          })
        },
      }),
    )
    const err = new Error('boom')
    await runner.runOnError(makeCtx(), err)
    expect(captured).toEqual([err])
  })

  it('runs all onError hooks even when multiple plugins are registered', async () => {
    const runner = new PluginRunner()
    const calls: string[] = []
    await runner.register(
      defineTheoPlugin({
        name: 'sentry',
        register(app) {
          app.addHook('onError', () => {
            calls.push('sentry')
          })
        },
      }),
    )
    await runner.register(
      defineTheoPlugin({
        name: 'metrics',
        register(app) {
          app.addHook('onError', () => {
            calls.push('metrics')
          })
        },
      }),
    )
    await runner.runOnError(makeCtx(), new Error('x'))
    expect(calls).toEqual(['sentry', 'metrics'])
  })

  it('does not loop when onError itself throws', async () => {
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'bad',
        register(app) {
          app.addHook('onError', () => {
            throw new Error('error in error handler')
          })
        },
      }),
    )
    // Should not throw, should not recurse
    await expect(runner.runOnError(makeCtx(), new Error('original'))).resolves.toBeDefined()
  })
})

describe('PluginRunner — decorateRequest', () => {
  it('applies decorations to ctx before hooks run', async () => {
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'db',
        register(app) {
          app.decorateRequest('db', { query: () => 'fake-db' })
        },
      }),
    )
    const ctx = makeCtx()
    runner.applyDecorations(ctx.ctx as Record<string, unknown>)
    expect((ctx.ctx as { db: { query: () => string } }).db.query()).toBe('fake-db')
  })

  it('throws DuplicateDecorationError when two plugins decorate the same key (EC-7)', async () => {
    const runner = new PluginRunner()
    await runner.register(
      defineTheoPlugin({
        name: 'pluginA',
        register(app) {
          app.decorateRequest('user', { id: 1 })
        },
      }),
    )
    await expect(
      runner.register(
        defineTheoPlugin({
          name: 'pluginB',
          register(app) {
            app.decorateRequest('user', { id: 2 })
          },
        }),
      ),
    ).rejects.toThrow(DuplicateDecorationError)
  })
})
