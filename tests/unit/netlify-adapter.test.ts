import { describe, it, expect } from 'vitest'
import {
  netlifyAdapter,
  buildNetlify,
  renderNetlifyFunction,
  mergeNetlifyToml,
  NetlifyConflictError,
} from '../../packages/theo/src/adapters/netlify.js'
import { VALID_TARGETS } from '../../packages/theo/src/adapters/types.js'
import type { TheoConfig } from '../../packages/theo/src/config/schema.js'

const baseConfig: TheoConfig = {
  appDir: 'app',
  serverDir: 'server',
  port: 3000,
  ssr: false,
  serialization: 'json',
} as TheoConfig

describe('Netlify adapter — shape', () => {
  it('exposes the DeployAdapter contract', () => {
    expect(netlifyAdapter.name).toBe('netlify')
    expect(typeof netlifyAdapter.build).toBe('function')
  })

  it('is listed in VALID_TARGETS', () => {
    expect(VALID_TARGETS).toContain('netlify')
  })
})

describe('renderNetlifyFunction — template', () => {
  it('exports an ESM handler', () => {
    const out = renderNetlifyFunction()
    expect(out).toContain('export default')
  })
})

describe('mergeNetlifyToml (EC-2)', () => {
  it('emits a default toml when none exists', () => {
    const merged = mergeNetlifyToml(null)
    expect(merged).toContain('[[redirects]]')
    expect(merged).toContain('/api/*')
    expect(merged).toContain('/.netlify/functions/theo')
  })

  it('preserves [build] when present', () => {
    const existing = [
      '[build]',
      '  command = "npm run build"',
      '  publish = "dist"',
      '',
      '[[headers]]',
      '  for = "/*"',
      '  [headers.values]',
      '    X-Frame-Options = "DENY"',
    ].join('\n')
    const merged = mergeNetlifyToml(existing)
    expect(merged).toContain('[build]')
    expect(merged).toContain('command = "npm run build"')
    expect(merged).toContain('X-Frame-Options')
  })

  it('appends Theo redirect when no conflicting /api/* redirect exists', () => {
    const existing = ['[[redirects]]', '  from = "/old"', '  to = "/new"', '  status = 301'].join(
      '\n',
    )
    const merged = mergeNetlifyToml(existing)
    expect(merged).toContain('from = "/old"')
    expect(merged).toContain('from = "/api/*"')
  })

  it('aborts with NetlifyConflictError when /api/* points elsewhere (EC-2)', () => {
    const existing = [
      '[[redirects]]',
      '  from = "/api/*"',
      '  to = "/somewhere/else"',
      '  status = 200',
    ].join('\n')
    expect(() => mergeNetlifyToml(existing)).toThrow(NetlifyConflictError)
  })

  it('preserves arbitrary unknown sections', () => {
    const existing = ['[context.production.environment]', '  NODE_VERSION = "20"'].join('\n')
    const merged = mergeNetlifyToml(existing)
    expect(merged).toContain('[context.production.environment]')
    expect(merged).toContain('NODE_VERSION = "20"')
  })

  it('is idempotent: re-merging an already-merged toml does not duplicate the redirect', () => {
    const once = mergeNetlifyToml(null)
    const twice = mergeNetlifyToml(once)
    const occurrences = (twice.match(/from = "\/api\/\*"/g) ?? []).length
    expect(occurrences).toBe(1)
  })
})

describe('buildNetlify — orchestration', () => {
  it('writes function entry + toml when no toml exists', async () => {
    const written: Record<string, string> = {}
    await buildNetlify(baseConfig, '/cwd', {
      runNodeBuild: async () => {},
      writeFile: (p, c) => {
        written[p] = c
      },
      ensureDir: () => {},
      readTomlIfExists: () => null,
    })
    const keys = Object.keys(written)
    expect(keys.some((k) => k.includes('.netlify/functions/theo.mjs'))).toBe(true)
    expect(keys.some((k) => k.endsWith('netlify.toml'))).toBe(true)
  })

  it('preserves existing toml content (EC-2)', async () => {
    let tomlWritten = ''
    await buildNetlify(baseConfig, '/cwd', {
      runNodeBuild: async () => {},
      writeFile: (p, c) => {
        if (p.endsWith('netlify.toml')) tomlWritten = c
      },
      ensureDir: () => {},
      readTomlIfExists: () => '[build]\n  command = "echo custom"',
    })
    expect(tomlWritten).toContain('echo custom')
    expect(tomlWritten).toContain('/api/*')
  })

  it('propagates conflict from existing toml', async () => {
    await expect(
      buildNetlify(baseConfig, '/cwd', {
        runNodeBuild: async () => {},
        writeFile: () => {},
        ensureDir: () => {},
        readTomlIfExists: () =>
          '[[redirects]]\n  from = "/api/*"\n  to = "/elsewhere"\n  status = 200',
      }),
    ).rejects.toThrow(NetlifyConflictError)
  })
})
