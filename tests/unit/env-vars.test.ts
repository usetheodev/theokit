import { describe, it, expect, beforeAll } from 'vitest'
import { theoPlugin } from '../../packages/theo/src/vite-plugin/index.js'

/**
 * config() became async in T3.3 (zero-config-polish) so it can await
 * integrateUseTheoUI() for @usetheo/ui auto-config. Tests now await the hook.
 */
describe('Env Vars: THEO_PUBLIC_* prefix', () => {
  const plugin = theoPlugin({ root: '/tmp/test-project' })
  const configHook = plugin.config as (this: unknown, ...args: unknown[]) => Promise<unknown>

  // NOTE: even though Vite types config() may be sync OR async, TheoKit's
  // implementation always returns a Promise after T3.3. Tests await it.

  let config: Record<string, unknown>

  beforeAll(async () => {
    config = (await configHook.call({}, {} as any, {} as any)) as Record<string, unknown>
  })

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
    expect(resolve.alias.some((a) => a.find === 'theokit')).toBe(true)
    expect(resolve.alias.some((a) => a.find === 'theokit/server')).toBe(true)
  })

  it('should have both envPrefix and resolve in config', () => {
    expect(config).toHaveProperty('envPrefix')
    expect(config).toHaveProperty('resolve')
  })
})
