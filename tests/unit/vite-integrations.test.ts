import { describe, it, expect } from 'vitest'
import {
  defineTheoIntegration,
  IntegrationRouteCollisionError,
  IntegrationVirtualModulePrefixError,
  createIntegrationRegistry,
} from '../../packages/theo/src/vite-plugin/integrations.js'

describe('defineTheoIntegration', () => {
  it('returns the integration identity (factory)', () => {
    const intg = defineTheoIntegration({
      name: 'foo',
      hooks: {
        'theo:config:setup': () => {},
      },
    })
    expect(intg.name).toBe('foo')
    expect(intg.hooks['theo:config:setup']).toBeTypeOf('function')
  })
})

describe('IntegrationRegistry — virtual modules (EC-6)', () => {
  it('accepts a virtual module ID with the correct prefix', () => {
    const reg = createIntegrationRegistry({ existingRoutes: [] })
    reg.callHook('foo', 'theo:config:setup', {
      addVirtualModule: (id, code) => {
        expect(id).toBe('virtual:integration:foo/myModule')
      },
    })
    // Direct call to underlying API
    reg.addVirtualModule('foo', 'virtual:integration:foo/x', 'export const x = 1')
    expect(reg.getVirtualModule('virtual:integration:foo/x')).toContain('export const x = 1')
  })

  it('rejects a virtual module ID without the integration prefix (EC-6)', () => {
    const reg = createIntegrationRegistry({ existingRoutes: [] })
    expect(() =>
      reg.addVirtualModule('foo', '/@theo/manifest', 'whatever'),
    ).toThrow(IntegrationVirtualModulePrefixError)
  })

  it('rejects a virtual module ID with the wrong integration name (EC-6)', () => {
    const reg = createIntegrationRegistry({ existingRoutes: [] })
    expect(() =>
      reg.addVirtualModule('foo', 'virtual:integration:bar/x', 'wat'),
    ).toThrow(IntegrationVirtualModulePrefixError)
  })

  it('lists registered virtual modules', () => {
    const reg = createIntegrationRegistry({ existingRoutes: [] })
    reg.addVirtualModule('foo', 'virtual:integration:foo/a', 'a')
    reg.addVirtualModule('foo', 'virtual:integration:foo/b', 'b')
    expect(reg.listVirtualModules()).toEqual([
      'virtual:integration:foo/a',
      'virtual:integration:foo/b',
    ])
  })
})

describe('IntegrationRegistry — route collisions (EC-5)', () => {
  it('accepts a route that does not conflict with user routes', () => {
    const reg = createIntegrationRegistry({ existingRoutes: ['/api/users'] })
    reg.addRoute('observability', '/metrics', async () => new Response('ok'))
    expect(reg.listRoutes()).toEqual([{ path: '/metrics', owner: 'observability' }])
  })

  it('rejects a route that conflicts with a user route (EC-5)', () => {
    const reg = createIntegrationRegistry({
      existingRoutes: ['/api/users', '/metrics'],
    })
    expect(() =>
      reg.addRoute('observability', '/metrics', async () => new Response('ok')),
    ).toThrow(IntegrationRouteCollisionError)
  })

  it('rejects a route that conflicts with another integration', () => {
    const reg = createIntegrationRegistry({ existingRoutes: [] })
    reg.addRoute('a', '/metrics', async () => new Response('a'))
    expect(() =>
      reg.addRoute('b', '/metrics', async () => new Response('b')),
    ).toThrow(IntegrationRouteCollisionError)
  })
})

describe('IntegrationRegistry — hook firing order', () => {
  it('runs hooks in registration order', async () => {
    const reg = createIntegrationRegistry({ existingRoutes: [] })
    const calls: string[] = []
    reg.registerIntegration(
      defineTheoIntegration({
        name: 'a',
        hooks: {
          'theo:config:setup': () => {
            calls.push('a')
          },
        },
      }),
    )
    reg.registerIntegration(
      defineTheoIntegration({
        name: 'b',
        hooks: {
          'theo:config:setup': () => {
            calls.push('b')
          },
        },
      }),
    )
    await reg.fire('theo:config:setup', {})
    expect(calls).toEqual(['a', 'b'])
  })

  it('does not crash when no integrations declare a hook', async () => {
    const reg = createIntegrationRegistry({ existingRoutes: [] })
    await reg.fire('theo:build:done', {})
    // No assertion — just must not throw
  })

  it('propagates hook errors with the offending integration name', async () => {
    const reg = createIntegrationRegistry({ existingRoutes: [] })
    reg.registerIntegration(
      defineTheoIntegration({
        name: 'bad',
        hooks: {
          'theo:config:setup': () => {
            throw new Error('boom')
          },
        },
      }),
    )
    await expect(reg.fire('theo:config:setup', {})).rejects.toThrow(/bad/)
  })
})
