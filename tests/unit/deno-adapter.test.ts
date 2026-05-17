import { describe, it, expect } from 'vitest'
import {
  denoDeployAdapter,
  buildDeno,
  renderDenoEntry,
} from '../../packages/theo/src/adapters/deno-deploy.js'
import { VALID_TARGETS } from '../../packages/theo/src/adapters/types.js'
import type { TheoConfig } from '../../packages/theo/src/config/schema.js'

const baseConfig: TheoConfig = {
  appDir: 'app',
  serverDir: 'server',
  port: 8000,
  ssr: false,
  serialization: 'json',
} as TheoConfig

describe('Deno Deploy adapter — shape', () => {
  it('exposes the DeployAdapter contract', () => {
    expect(denoDeployAdapter.name).toBe('deno-deploy')
    expect(typeof denoDeployAdapter.build).toBe('function')
  })

  it('is listed in VALID_TARGETS', () => {
    expect(VALID_TARGETS).toContain('deno-deploy')
  })
})

describe('renderDenoEntry — template', () => {
  it('embeds the configured port', () => {
    const out = renderDenoEntry(7777)
    expect(out).toContain('7777')
  })

  it('uses Deno.serve (no Node http import)', () => {
    const out = renderDenoEntry(8000)
    expect(out).toContain('Deno.serve')
    expect(out).not.toMatch(/from 'node:http'/)
  })

  it('reads env via Deno.env', () => {
    const out = renderDenoEntry(8000)
    expect(out).toContain('Deno.env')
  })

  it('guards the runtime — fails fast when Deno global is absent', () => {
    const out = renderDenoEntry(8000)
    expect(out).toContain('typeof Deno')
  })

  it('imports theokit via npm: specifier (Deno Deploy compat)', () => {
    const out = renderDenoEntry(8000)
    expect(out).toContain("from 'npm:theokit/server'")
    expect(out).toContain("from 'npm:theokit/adapters/web-shim'")
  })

  it('wires the full executeRoute pipeline through the shim', () => {
    const out = renderDenoEntry(8000)
    expect(out).toContain('createWebShim')
    expect(out).toContain('executeRoute')
    expect(out).toContain('matchRoute')
  })
})

describe('buildDeno — orchestration', () => {
  it('runs node build before writing the Deno entry', async () => {
    const calls: string[] = []
    await buildDeno(baseConfig, '/cwd', {
      runNodeBuild: async () => {
        calls.push('node-build')
      },
      writeEntry: () => {
        calls.push('write')
      },
      ensureDir: () => {},
    })
    expect(calls).toEqual(['node-build', 'write'])
  })

  it('writes the entry as .theo/deno/server.ts', async () => {
    let writtenPath = ''
    await buildDeno(baseConfig, '/test', {
      runNodeBuild: async () => {},
      writeEntry: (p) => {
        writtenPath = p
      },
      ensureDir: () => {},
    })
    expect(writtenPath).toContain('/.theo/deno/server.ts')
  })

  it('propagates node build errors', async () => {
    await expect(
      buildDeno(baseConfig, '/cwd', {
        runNodeBuild: async () => {
          throw new Error('Vite failed')
        },
        writeEntry: () => {},
        ensureDir: () => {},
      }),
    ).rejects.toThrow(/Vite failed/)
  })
})
