import { describe, it, expect } from 'vitest'
import { theoPlugin } from '../../packages/theo/src/vite-plugin/index.js'

describe('Env Vars: THEO_PUBLIC_* prefix', () => {
  const plugin = theoPlugin({ root: '/tmp/test-project' })
  const configHook = plugin.config as Function
  const config = configHook() as Record<string, unknown>

  it('should have envPrefix set to THEO_PUBLIC_', () => {
    expect(config.envPrefix).toBe('THEO_PUBLIC_')
  })

  it('should have envPrefix as a string (not array)', () => {
    expect(typeof config.envPrefix).toBe('string')
  })

  it('should preserve resolve aliases alongside envPrefix', () => {
    const resolve = config.resolve as { alias: Array<{ find: string }> }
    expect(resolve.alias).toBeDefined()
    expect(resolve.alias.length).toBeGreaterThanOrEqual(2)
    expect(resolve.alias.some(a => a.find === 'theo')).toBe(true)
    expect(resolve.alias.some(a => a.find === 'theo/server')).toBe(true)
  })

  it('should have both envPrefix and resolve in config', () => {
    expect(config).toHaveProperty('envPrefix')
    expect(config).toHaveProperty('resolve')
  })
})
