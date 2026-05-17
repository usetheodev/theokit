import { describe, it, expect } from 'vitest'
import {
  createPluginRunnerFromConfig,
  InvalidPluginShapeError,
} from '../../packages/theo/src/server/load-plugins.js'
import { defineTheoPlugin } from '../../packages/theo/src/server/define-plugin.js'

describe('createPluginRunnerFromConfig', () => {
  it('returns undefined when plugins is null', async () => {
    expect(await createPluginRunnerFromConfig(null)).toBeUndefined()
  })

  it('returns undefined when plugins is undefined', async () => {
    expect(await createPluginRunnerFromConfig(undefined)).toBeUndefined()
  })

  it('returns undefined when plugins is empty array', async () => {
    expect(await createPluginRunnerFromConfig([])).toBeUndefined()
  })

  it('returns a runner with the registered plugin', async () => {
    const plugin = defineTheoPlugin({
      name: 'demo',
      register(app) {
        app.addHook('onRequest', () => {})
      },
    })
    const runner = await createPluginRunnerFromConfig([plugin])
    expect(runner).toBeDefined()
    expect(runner!.has('demo')).toBe(true)
  })

  it('throws InvalidPluginShapeError for non-object entries', async () => {
    await expect(
      createPluginRunnerFromConfig([42]),
    ).rejects.toThrow(InvalidPluginShapeError)
  })

  it('throws for entries missing name', async () => {
    await expect(
      createPluginRunnerFromConfig([{ register: () => {} }]),
    ).rejects.toThrow(/missing "name"/)
  })

  it('throws for entries missing register function', async () => {
    await expect(
      createPluginRunnerFromConfig([{ name: 'foo' }]),
    ).rejects.toThrow(/missing "register"/)
  })

  it('reports the offending index', async () => {
    await expect(
      createPluginRunnerFromConfig([
        defineTheoPlugin({ name: 'ok', register() {} }),
        { not: 'a plugin' },
      ]),
    ).rejects.toThrow(/plugins\[1\]/)
  })
})
