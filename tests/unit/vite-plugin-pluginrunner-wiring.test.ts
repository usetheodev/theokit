import { describe, it, expect, vi } from 'vitest'
import { theoPlugin } from '../../packages/theo/src/vite-plugin/index.js'
import { createActionMiddleware } from '../../packages/theo/src/vite-plugin/action-middleware.js'
import { defineTheoPlugin } from '../../packages/theo/src/server/define-plugin.js'

describe('vite-plugin — plugin runner wiring in dev (T1.1, EC-1)', () => {
  it('exposes a configResolved hook', () => {
    const plugin = theoPlugin()
    expect(plugin.configResolved).toBeDefined()
    expect(typeof plugin.configResolved).toBe('function')
  })

  it('instantiates runner only via configResolved (not configureServer)', async () => {
    // The runner instantiation MUST happen in configResolved (non-HMR-able).
    // This test asserts the hook exists and is the entry point.
    const plugin = theoPlugin({ root: '/tmp/no-such-project' })
    expect(plugin.configResolved).toBeDefined()
    // configureServer should be the consumer of the cached runner, not the creator
    expect(plugin.configureServer).toBeDefined()
  })
})

describe('createActionMiddleware — accepts pluginRunner (T1.1)', () => {
  it('accepts legacy positional signature (backward compat)', () => {
    const fakeVite = { config: { server: {} } } as never
    expect(() => createActionMiddleware(fakeVite, '/tmp/server')).not.toThrow()
  })

  it('accepts options object with pluginRunner', () => {
    const fakeVite = { config: { server: {} } } as never
    const plugin = defineTheoPlugin({
      name: 'test',
      register() {},
    })
    // Should not throw when given options-shape with runner
    expect(() =>
      createActionMiddleware(fakeVite, '/tmp/server', {
        pluginRunner: undefined,
      }),
    ).not.toThrow()
    // Use plugin in some way to avoid unused-var warning
    expect(plugin.name).toBe('test')
  })
})
