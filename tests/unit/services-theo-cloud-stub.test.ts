import { describe, it, expect } from 'vitest'
import { prepareTheoCloudArtifacts } from '../../packages/theo/src/services/index.js'
import type { ServicesManifest } from '../../packages/theo/src/services/index.js'

describe('T3.5 — TheoCloud adapter scaffolding (Wave 2 stub)', () => {
  it('null manifest returns empty services', () => {
    const out = prepareTheoCloudArtifacts(null)
    expect(out.manifestVersion).toBe(1)
    expect(out.services).toEqual([])
  })

  it('reads service names from manifest', () => {
    const m: ServicesManifest = {
      version: 1,
      services: [
        {
          name: 'agent',
          runtime: 'python',
          port: 8001,
          proxy: '/api/agent',
          dev: 'uvicorn main:app',
          start: 'uvicorn main:app --workers 4',
          healthcheck: '/health',
          cors: false,
          passSetCookie: false,
        },
        {
          name: 'worker',
          runtime: 'node',
          port: 8002,
          proxy: '/api/worker',
          dev: 'tsx watch src/index.ts',
          start: 'node dist/index.js',
          healthcheck: '/health',
          cors: false,
          passSetCookie: false,
        },
      ],
    }
    const out = prepareTheoCloudArtifacts(m)
    expect(out.services).toEqual(['agent', 'worker'])
  })

  it('throws on unexpected manifest version (Wave 3 forward-compat guard)', () => {
    const bogus = { version: 99, services: [] } as unknown as ServicesManifest
    expect(() => prepareTheoCloudArtifacts(bogus)).toThrow(/unsupported manifest version/i)
  })

  it('does NOT yet emit K8s manifests (Wave 3)', () => {
    const m: ServicesManifest = { version: 1, services: [] }
    const out = prepareTheoCloudArtifacts(m)
    expect(out.k8sManifests).toBeUndefined()
    expect(out.helmValues).toBeUndefined()
  })
})
