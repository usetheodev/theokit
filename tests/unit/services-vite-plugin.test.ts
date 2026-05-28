import { describe, it, expect } from 'vitest'

import { buildServicesProxyConfig } from '../../packages/theo/src/services/index.js'
import type { ServicesConfig } from '../../packages/theo/src/services/index.js'

const PYTHON_SERVICE = {
  runtime: 'python' as const,
  port: 8001,
  proxy: '/api/agent',
  dev: 'uvicorn main:app',
  start: 'uvicorn main:app --workers 4',
  healthcheck: '/health',
  cors: false,
  passSetCookie: false,
}

const NODE_SERVICE = {
  runtime: 'node' as const,
  port: 8002,
  proxy: '/api/worker',
  dev: 'tsx watch src/index.ts',
  start: 'node dist/index.js',
  healthcheck: '/health',
  cors: false,
  passSetCookie: false,
}

describe('T2.1 — services Vite proxy builder', () => {
  it('empty services produces empty proxy map', () => {
    const result = buildServicesProxyConfig({})
    expect(result).toEqual({})
  })

  it('translates one python service to Vite proxy entry', () => {
    const services: ServicesConfig = { agent: PYTHON_SERVICE }
    const result = buildServicesProxyConfig(services)
    expect(result['/api/agent']).toBeDefined()
    expect(result['/api/agent']).toMatchObject({
      target: 'http://localhost:8001',
      changeOrigin: true,
    })
  })

  it('translates multiple services into separate proxy entries', () => {
    const services: ServicesConfig = { agent: PYTHON_SERVICE, worker: NODE_SERVICE }
    const result = buildServicesProxyConfig(services)
    expect(Object.keys(result)).toEqual(expect.arrayContaining(['/api/agent', '/api/worker']))
    expect(result['/api/worker']).toMatchObject({
      target: 'http://localhost:8002',
    })
  })

  it('preserves user-set Vite proxy entries via mergeWithUserProxy', () => {
    const services: ServicesConfig = { agent: PYTHON_SERVICE }
    const userProxy = { '/external': 'http://example.com' as const }
    const merged = buildServicesProxyConfig(services, userProxy)
    expect(merged['/external']).toBeDefined()
    expect(merged['/api/agent']).toBeDefined()
  })

  it('user-set proxy at colliding path takes precedence', () => {
    const services: ServicesConfig = { agent: PYTHON_SERVICE }
    const userProxy = { '/api/agent': 'http://user-override.example' }
    const merged = buildServicesProxyConfig(services, userProxy)
    // User wins on collision (we DO NOT clobber user config)
    expect(merged['/api/agent']).toBe('http://user-override.example')
  })
})
