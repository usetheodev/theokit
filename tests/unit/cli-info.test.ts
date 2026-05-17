import { describe, it, expect } from 'vitest'
import { buildInfo } from '../../packages/theo/src/cli/commands/info.js'

describe('buildInfo', () => {
  it('produces a markdown output with theokit version section', async () => {
    const out = await buildInfo({
      cwd: '/fake/cwd',
      readPackageJson: () => null,
      detectRuntime: () => ({ name: 'node', version: '22.0.0' }),
      loadConfig: async () => ({ ok: true, summary: 'config OK' }),
      countRoutes: () => 0,
    })
    expect(out).toContain('# Theo info')
    expect(out).toContain('Runtime')
    expect(out).toContain('node 22.0.0')
  })

  it('reports project package.json name+version when available', async () => {
    const out = await buildInfo({
      cwd: '/fake',
      readPackageJson: () => ({ name: 'my-app', version: '1.2.3' }),
      detectRuntime: () => ({ name: 'node', version: '22.0.0' }),
      loadConfig: async () => ({ ok: true, summary: 'config OK' }),
      countRoutes: () => 5,
    })
    expect(out).toContain('my-app@1.2.3')
    expect(out).toContain('Routes: 5')
  })

  it('reports "(missing)" when package.json is absent (no crash)', async () => {
    const out = await buildInfo({
      cwd: '/fake',
      readPackageJson: () => null,
      detectRuntime: () => ({ name: 'node', version: '22.0.0' }),
      loadConfig: async () => ({ ok: true, summary: 'config OK' }),
      countRoutes: () => 0,
    })
    expect(out).toContain('Project: (missing)')
  })

  it('reports INVALID config without throwing', async () => {
    const out = await buildInfo({
      cwd: '/fake',
      readPackageJson: () => null,
      detectRuntime: () => ({ name: 'node', version: '22.0.0' }),
      loadConfig: async () => ({ ok: false, summary: 'port must be a number' }),
      countRoutes: () => 0,
    })
    expect(out).toContain('Config: INVALID')
    expect(out).toContain('port must be a number')
  })

  it('detects Bun runtime', async () => {
    const out = await buildInfo({
      cwd: '/fake',
      readPackageJson: () => null,
      detectRuntime: () => ({ name: 'bun', version: '1.1.42' }),
      loadConfig: async () => ({ ok: true, summary: 'config OK' }),
      countRoutes: () => 0,
    })
    expect(out).toContain('bun 1.1.42')
  })

  it('handles scan failure by reporting "Scan failed:" without crashing', async () => {
    const out = await buildInfo({
      cwd: '/fake',
      readPackageJson: () => null,
      detectRuntime: () => ({ name: 'node', version: '22.0.0' }),
      loadConfig: async () => ({ ok: true, summary: 'config OK' }),
      countRoutes: () => {
        throw new Error('scan exploded')
      },
    })
    expect(out).toContain('Scan failed: scan exploded')
  })

  it('output is valid markdown (starts with #)', async () => {
    const out = await buildInfo({
      cwd: '/fake',
      readPackageJson: () => null,
      detectRuntime: () => ({ name: 'node', version: '22.0.0' }),
      loadConfig: async () => ({ ok: true, summary: 'config OK' }),
      countRoutes: () => 0,
    })
    expect(out).toMatch(/^# /)
  })
})
