import { describe, it, expect } from 'vitest'
import { generateComposeYaml } from '../../packages/theo/src/services/index.js'
import { generateCaddyfile } from '../../packages/theo/src/services/index.js'
import type { ServicesManifest } from '../../packages/theo/src/services/index.js'

function pythonService(name: string, port = 8001, proxy = `/api/${name}`) {
  return {
    name,
    runtime: 'python' as const,
    port,
    proxy,
    dev: 'uvicorn main:app',
    start: 'uvicorn main:app --workers 4',
    healthcheck: '/health',
    cors: false,
    passSetCookie: false,
  }
}

describe('T3.3 — compose-generator', () => {
  it('empty services: emits web + caddy only', () => {
    const m: ServicesManifest = { version: 1, services: [] }
    const yaml = generateComposeYaml(m, { webPort: 3000 })
    expect(yaml).toContain('caddy:')
    expect(yaml).toContain('web:')
    expect(yaml).not.toContain('agent:')
  })

  it('python service entry includes healthcheck on /health', () => {
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    const yaml = generateComposeYaml(m, { webPort: 3000 })
    expect(yaml).toContain('agent:')
    expect(yaml).toMatch(/curl -f http:\/\/localhost:8001\/health/)
  })

  it('Caddy depends_on services with condition: service_healthy', () => {
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    const yaml = generateComposeYaml(m, { webPort: 3000 })
    expect(yaml).toMatch(/depends_on:[\s\S]+agent:[\s\S]+condition: service_healthy/)
  })

  it('injects THEOKIT_SERVICE_NAME and PORT env (EC-8)', () => {
    const m: ServicesManifest = { version: 1, services: [pythonService('agent', 8001)] }
    const yaml = generateComposeYaml(m, { webPort: 3000 })
    expect(yaml).toContain('THEOKIT_SERVICE_NAME')
    expect(yaml).toContain('"agent"')
    expect(yaml).toContain('THEOKIT_SERVICE_PORT')
    expect(yaml).toContain('"8001"')
  })
})

describe('T3.3 — caddy-generator', () => {
  it('Caddyfile includes tracing directive (W3C traceparent)', () => {
    const m: ServicesManifest = { version: 1, services: [] }
    const cf = generateCaddyfile(m, { port: 3000, webHost: 'web' })
    expect(cf).toContain('tracing')
  })

  it('Caddyfile emits reverse_proxy per service', () => {
    const m: ServicesManifest = {
      version: 1,
      services: [pythonService('agent', 8001, '/api/agent')],
    }
    const cf = generateCaddyfile(m, { port: 3000, webHost: 'web' })
    expect(cf).toContain('reverse_proxy /api/agent* agent:8001')
  })

  it('emits CORS headers when opt-in', () => {
    const m: ServicesManifest = {
      version: 1,
      services: [{ ...pythonService('agent'), cors: true }],
    }
    const cf = generateCaddyfile(m, { port: 3000, webHost: 'web' })
    expect(cf).toContain('Access-Control-Allow-Origin')
  })

  it('orders services by prefix length DESC (EC-23)', () => {
    const m: ServicesManifest = {
      version: 1,
      services: [
        pythonService('short', 8001, '/api'),
        pythonService('long', 8002, '/api/agent/v2'),
      ],
    }
    const cf = generateCaddyfile(m, { port: 3000, webHost: 'web' })
    const idxLong = cf.indexOf('/api/agent/v2*')
    const idxShort = cf.indexOf('/api* ')
    expect(idxLong).toBeGreaterThan(-1)
    expect(idxShort).toBeGreaterThan(-1)
    expect(idxLong).toBeLessThan(idxShort)
  })

  it('default fallback routes to web container', () => {
    const m: ServicesManifest = { version: 1, services: [pythonService('agent')] }
    const cf = generateCaddyfile(m, { port: 3000, webHost: 'web' })
    expect(cf).toContain('reverse_proxy web:3000')
  })
})
