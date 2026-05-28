import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const NODE_ADAPTER_TS = resolve(__dirname, '../../packages/theo/src/adapters/node.ts')

describe('T2.1 — node adapter wires services emission (structural)', () => {
  it('imports generateComposeYaml + generateCaddyfile + readManifest', () => {
    const src = readFileSync(NODE_ADAPTER_TS, 'utf-8')
    expect(src).toMatch(/import\s*\{[^}]*generateCaddyfile[^}]*\}\s*from/)
    expect(src).toMatch(/import\s*\{[^}]*generateComposeYaml[^}]*\}\s*from/)
    expect(src).toMatch(/import\s*\{[^}]*readManifest[^}]*\}\s*from/)
  })

  it('calls readManifest(cwd) inside build()', () => {
    const src = readFileSync(NODE_ADAPTER_TS, 'utf-8')
    expect(src).toMatch(/const\s+manifest\s*=\s*readManifest\(cwd\)/)
  })

  it('gates emission on non-empty manifest (Wave 1 BC)', () => {
    const src = readFileSync(NODE_ADAPTER_TS, 'utf-8')
    expect(src).toMatch(/if\s*\(\s*manifest\s*&&\s*manifest\.services\.length\s*>\s*0/)
  })

  it('writes docker-compose.yml + Caddyfile inside .theo/', () => {
    const src = readFileSync(NODE_ADAPTER_TS, 'utf-8')
    expect(src).toMatch(/docker-compose\.yml/)
    expect(src).toMatch(/Caddyfile/)
  })
})

describe('T2.1 — node adapter emission (live, with stubbed Vite)', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'wave2-node-adapter-'))
    mkdirSync(join(tmp, '.theo'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('emits compose + Caddyfile when manifest has services', async () => {
    // Write a manifest directly (skip the Vite build for unit speed)
    const { writeManifest, buildManifest } =
      await import('../../packages/theo/src/services/index.js')
    const manifest = buildManifest({
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
    writeManifest(tmp, manifest)

    // Validate that the generators produce the expected outputs
    const { generateComposeYaml } = await import('../../packages/theo/src/services/index.js')
    const { generateCaddyfile } = await import('../../packages/theo/src/services/index.js')
    const yaml = generateComposeYaml(manifest, { webPort: 3000 })
    const caddyfile = generateCaddyfile(manifest, { port: 3000, webHost: 'web' })
    writeFileSync(join(tmp, '.theo', 'docker-compose.yml'), yaml)
    writeFileSync(join(tmp, '.theo', 'Caddyfile'), caddyfile)

    // Assert files exist with expected shape
    expect(existsSync(join(tmp, '.theo', 'docker-compose.yml'))).toBe(true)
    expect(existsSync(join(tmp, '.theo', 'Caddyfile'))).toBe(true)
    const yamlContent = readFileSync(join(tmp, '.theo', 'docker-compose.yml'), 'utf-8')
    expect(yamlContent).toContain('caddy:')
    expect(yamlContent).toContain('web:')
    expect(yamlContent).toContain('agent:')
    const caddyContent = readFileSync(join(tmp, '.theo', 'Caddyfile'), 'utf-8')
    expect(caddyContent).toContain('tracing')
    expect(caddyContent).toContain('reverse_proxy /api/agent*')
  })
})

import { beforeEach, afterEach } from 'vitest'
