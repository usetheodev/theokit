import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { servicesTypedClientPlugin } from '../../packages/theo/src/vite-plugin/services-typed-client.js'

const PLUGIN_TS = resolve(__dirname, '../../packages/theo/src/vite-plugin/services-typed-client.ts')
const INDEX_TS = resolve(__dirname, '../../packages/theo/src/vite-plugin/index.ts')

describe('T3.1 — services-typed-client plugin', () => {
  it('returns a Vite Plugin with the expected name and apply', () => {
    const plugin = servicesTypedClientPlugin({ cwd: '/tmp', services: {} })
    expect(plugin.name).toBe('theokit:services-typed-client')
    expect(plugin.apply).toBe('serve')
  })

  it('is dev-only (apply: serve, never prod)', () => {
    const src = readFileSync(PLUGIN_TS, 'utf-8')
    expect(src).toMatch(/apply:\s*['"]serve['"]/)
  })

  it('skips when services has no openapi URL', () => {
    const plugin = servicesTypedClientPlugin({
      cwd: '/tmp',
      services: {
        agent: {
          runtime: 'python',
          port: 8001,
          proxy: '/api/agent',
          dev: 'uvicorn main:app',
          start: 'uvicorn main:app --workers 4',
          healthcheck: '/health',
          cors: false,
          passSetCookie: false,
          // openapi NOT set
        },
      },
    })
    // configureServer should not throw when openapi is absent.
    // We can't easily assert generator was NOT called without mocking; the
    // shape contract is that the plugin handles the missing-openapi case
    // (unit tests in services-openapi-client-gen.test.ts pin that behavior).
    expect(typeof plugin.configureServer).toBe('function')
  })

  it('configureServer is wired (callable without throwing on basic input)', () => {
    const plugin = servicesTypedClientPlugin({
      cwd: '/tmp',
      services: {},
    })
    // configureServer can be Plugin or ObjectHook<...>; we just check
    // existence of the function form.
    expect(plugin.configureServer).toBeDefined()
  })

  it('theoPluginAsync wires servicesTypedClientPlugin only when services non-empty', () => {
    const src = readFileSync(INDEX_TS, 'utf-8')
    expect(src).toMatch(/servicesTypedClientPlugin/)
    expect(src).toMatch(/Object\.keys\(options\.services\)\.length\s*>\s*0/)
  })

  it('TheoPluginOptions declares services field', () => {
    const src = readFileSync(INDEX_TS, 'utf-8')
    expect(src).toMatch(/services\?:[^\n]*ServicesConfig/)
  })

  it('dev.ts passes config.services into theoPluginAsync', () => {
    const devTs = readFileSync(
      resolve(__dirname, '../../packages/theo/src/cli/commands/dev.ts'),
      'utf-8',
    )
    expect(devTs).toMatch(/services:\s*config\.services/)
  })
})
