import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BUILD_TS = resolve(__dirname, '../../packages/theo/src/cli/commands/build.ts')

describe('T1.2 — build.ts wires services manifest', () => {
  it('imports buildManifest + writeManifest from services barrel', () => {
    // T2.1 + T4.1 (architecture-cleanup) — barrel-only deep-imports.
    const src = readFileSync(BUILD_TS, 'utf-8')
    expect(src).toMatch(/buildManifest as buildServicesManifest/)
    expect(src).toMatch(/writeManifest as writeServicesManifest/)
    expect(src).toMatch(/from\s*['"][^'"]*services\/(index|manifest)/)
  })

  it('calls buildServicesManifest + writeServicesManifest', () => {
    const src = readFileSync(BUILD_TS, 'utf-8')
    expect(src).toMatch(/buildServicesManifest\(config\.services\)/)
    expect(src).toMatch(/writeServicesManifest\(cwd,/)
  })

  it('emits manifest BEFORE runAdapterBuild (so adapters can read it)', () => {
    const src = readFileSync(BUILD_TS, 'utf-8')
    const idxEmit = src.indexOf('writeServicesManifest')
    const idxAdapter = src.indexOf('runAdapterBuild(')
    expect(idxEmit).toBeGreaterThan(-1)
    expect(idxAdapter).toBeGreaterThan(-1)
    expect(idxEmit).toBeLessThan(idxAdapter)
  })

  it('logs the service count when non-empty', () => {
    const src = readFileSync(BUILD_TS, 'utf-8')
    expect(src).toMatch(/Services manifest/)
  })
})

describe('T1.2 — buildManifest + writeManifest (live)', () => {
  it('produces a valid manifest for empty services (Wave 1 BC)', async () => {
    const { buildManifest, writeManifest, readManifest } =
      await import('../../packages/theo/src/services/index.js')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')

    const tmp = mkdtempSync(join(tmpdir(), 'wave2-build-test-'))
    try {
      const m = buildManifest({})
      writeManifest(tmp, m)
      const re = readManifest(tmp)
      expect(re?.version).toBe(1)
      expect(re?.services).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('produces populated manifest for non-empty services', async () => {
    const { buildManifest, writeManifest, readManifest } =
      await import('../../packages/theo/src/services/index.js')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')

    const tmp = mkdtempSync(join(tmpdir(), 'wave2-build-test-'))
    try {
      const m = buildManifest({
        agent: {
          runtime: 'python',
          port: 8001,
          proxy: '/api/agent',
          dev: 'uvicorn main:app',
          start: 'uvicorn main:app --workers 4',
          healthcheck: '/health',
          cors: false,
          passSetCookie: false,
        },
      })
      writeManifest(tmp, m)
      const re = readManifest(tmp)
      expect(re?.services).toHaveLength(1)
      expect(re?.services[0]?.name).toBe('agent')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
