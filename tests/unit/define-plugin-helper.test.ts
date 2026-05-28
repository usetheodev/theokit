import { describe, expect, expectTypeOf, it } from 'vitest'
import { definePlugin } from '../../packages/theo/src/server/plugin-types.js'
import * as theokit from '../../packages/theo/src/server/index.js'
import type { TheoPlugin } from '../../packages/theo/src/server/plugin-types.js'

describe('T2.1 — definePlugin() identity helper (ADR-0008 D6)', () => {
  it('returns input unchanged — pure identity function (happy path)', () => {
    const input: TheoPlugin = {
      name: 'pure-identity',
      register: () => {},
    }
    const output = definePlugin(input)
    expect(output).toBe(input)
  })

  it('inferred return type is TheoPlugin (type test)', () => {
    const plugin = definePlugin({
      name: 'inferred',
      register: () => {},
    })
    expectTypeOf(plugin).toEqualTypeOf<TheoPlugin>()
    expect(plugin.name).toBe('inferred')
  })

  it('accepts async register function (edge case)', async () => {
    let registered = false
    const plugin = definePlugin({
      name: 'async-register',
      register: async () => {
        await Promise.resolve()
        registered = true
      },
    })
    expect(typeof plugin.register).toBe('function')
    await plugin.register({} as never)
    expect(registered).toBe(true)
  })

  it('exported from theokit/server barrel (error scenario: barrel BC)', () => {
    expect(typeof theokit.definePlugin).toBe('function')
    expect(theokit.definePlugin).toBe(definePlugin)
  })

  it('rejects missing name at compile time (TS @ts-expect-error)', () => {
    // @ts-expect-error — name is required
    const _bad = definePlugin({ register: () => {} })
    expect(typeof _bad).toBe('object')
  })

  it('preserves sync register without wrapping in Promise', () => {
    let count = 0
    const plugin = definePlugin({
      name: 'sync',
      register: () => {
        count = 1
      },
    })
    const result = plugin.register({} as never)
    expect(count).toBe(1)
    expect(result).toBeUndefined()
  })
})
