import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { theoCloudAdapter } from '../../packages/theo/src/adapters/theo-cloud.js'
import { VALID_TARGETS } from '../../packages/theo/src/adapters/types.js'

describe('T2.3 — theo-cloud adapter (Wave 2 stub)', () => {
  it('VALID_TARGETS includes "theo-cloud"', () => {
    expect(VALID_TARGETS).toContain('theo-cloud')
  })

  it('adapter name is "theo-cloud"', () => {
    expect(theoCloudAdapter.name).toBe('theo-cloud')
  })

  it('build() succeeds with null manifest (empty services)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wave2-theocloud-'))
    try {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await theoCloudAdapter.build({ port: 3000, ssr: false } as never, tmp)
      const logCalls = consoleSpy.mock.calls.map((c) => String(c[0]))
      expect(logCalls.some((l) => l.includes('Wave 2 stub'))).toBe(true)
      expect(logCalls.some((l) => l.includes('services=none'))).toBe(true)
      consoleSpy.mockRestore()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('build() logs service names when manifest has services', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wave2-theocloud-'))
    try {
      const { buildManifest, writeManifest } =
        await import('../../packages/theo/src/services/index.js')
      writeManifest(
        tmp,
        buildManifest({
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
        }),
      )

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await theoCloudAdapter.build({ port: 3000, ssr: false } as never, tmp)
      const logCalls = consoleSpy.mock.calls.map((c) => String(c[0]))
      expect(logCalls.some((l) => l.includes('services=agent'))).toBe(true)
      expect(logCalls.some((l) => l.includes('Wave 3'))).toBe(true)
      consoleSpy.mockRestore()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('theo-cloud is registered in the Adapter Registry (replaces former switch case)', () => {
    // T1.1 (architecture-medium-deferrals plan, ADR D1) — the switch in
    // runAdapterBuild was replaced by `adapters/registry.ts`. Assertion shifts
    // from "case 'theo-cloud'" in build.ts to "'theo-cloud':" key in registry.ts.
    const registryTs = readFileSync(
      join(__dirname, '../../packages/theo/src/adapters/registry.ts'),
      'utf-8',
    )
    expect(registryTs).toMatch(/['"]theo-cloud['"]\s*:/)
    expect(registryTs).toMatch(/theoCloudAdapter/)
  })
})
