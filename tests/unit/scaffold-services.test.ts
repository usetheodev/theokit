import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  scaffoldServices,
  buildServicesSnippet,
  injectServicesIntoConfig,
  injectHeyApiDep,
  parseBackendFlags,
} from '../../packages/create-theo/src/scaffold-services.js'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'scaffold-services-test-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const BARE_THEO_CONFIG = `import { defineConfig } from 'theokit'
export default defineConfig({
  port: 3000,
})
`

const BARE_PACKAGE_JSON = JSON.stringify(
  {
    name: 'my-app',
    private: true,
    dependencies: {
      theokit: '^0.5.0',
    },
  },
  null,
  2,
)

describe('T4.1/T4.2 — scaffoldServices', () => {
  it('no-op when backends array is empty', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'my-app', backends: [] })
    expect(existsSync(join(tmp, 'services'))).toBe(false)
    expect(readFileSync(join(tmp, 'theo.config.ts'), 'utf-8')).toBe(BARE_THEO_CONFIG)
  })

  it('--backend python scaffolds services/agent/main.py', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'my-app', backends: ['python'] })
    const mainPath = join(tmp, 'services', 'agent', 'main.py')
    expect(existsSync(mainPath)).toBe(true)
    const main = readFileSync(mainPath, 'utf-8')
    expect(main).toContain('@app.get("/health")')
    expect(main).toContain('traceparent')
    expect(main).toContain('JsonFormatter')
  })

  it('--backend python substitutes name in pyproject.toml.tmpl → pyproject.toml', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'my-cool-app', backends: ['python'] })
    const pyprojectPath = join(tmp, 'services', 'agent', 'pyproject.toml')
    expect(existsSync(pyprojectPath)).toBe(true)
    expect(existsSync(`${pyprojectPath}.tmpl`)).toBe(false)
    expect(readFileSync(pyprojectPath, 'utf-8')).toContain('my-cool-app-agent-python')
  })

  it('--backend python writes Dockerfile with HEALTHCHECK', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'app', backends: ['python'] })
    const dockerfile = join(tmp, 'services', 'agent', 'Dockerfile')
    expect(existsSync(dockerfile)).toBe(true)
    expect(readFileSync(dockerfile, 'utf-8')).toContain('HEALTHCHECK')
  })

  it('--backend python writes services config to theo.config.ts', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'app', backends: ['python'] })
    const cfg = readFileSync(join(tmp, 'theo.config.ts'), 'utf-8')
    expect(cfg).toContain('services:')
    expect(cfg).toContain('agent:')
    expect(cfg).toContain("runtime: 'python'")
    expect(cfg).toContain('8001')
  })

  it('--backend node scaffolds services/worker/src/index.ts using Hono', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'app', backends: ['node'] })
    const indexPath = join(tmp, 'services', 'worker', 'src', 'index.ts')
    expect(existsSync(indexPath)).toBe(true)
    const content = readFileSync(indexPath, 'utf-8')
    expect(content).toContain("from 'hono'")
    expect(content).toContain('/health')
    expect(content).toContain('traceparent')
  })

  it('--backend node creates package.json with hono dep', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'cool-app', backends: ['node'] })
    const pkgPath = join(tmp, 'services', 'worker', 'package.json')
    expect(existsSync(pkgPath)).toBe(true)
    expect(existsSync(`${pkgPath}.tmpl`)).toBe(false)
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      name: string
      dependencies: Record<string, string>
    }
    expect(pkg.name).toBe('cool-app-agent-node')
    expect(pkg.dependencies.hono).toBeDefined()
  })

  it('multi-backend (python + node) scaffolds both', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'app', backends: ['python', 'node'] })
    expect(existsSync(join(tmp, 'services', 'agent', 'main.py'))).toBe(true)
    expect(existsSync(join(tmp, 'services', 'worker', 'src', 'index.ts'))).toBe(true)
    const cfg = readFileSync(join(tmp, 'theo.config.ts'), 'utf-8')
    expect(cfg).toContain('agent:')
    expect(cfg).toContain('worker:')
  })

  // EC-10: inject @hey-api/client-fetch
  it('EC-10: --backend python injects @hey-api/client-fetch into app package.json', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'app', backends: ['python'] })
    const pkg = JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@hey-api/client-fetch']).toBeDefined()
  })

  it('EC-10: --backend node also injects @hey-api/client-fetch', () => {
    writeFileSync(join(tmp, 'theo.config.ts'), BARE_THEO_CONFIG)
    writeFileSync(join(tmp, 'package.json'), BARE_PACKAGE_JSON)
    scaffoldServices({ targetDir: tmp, projectName: 'app', backends: ['node'] })
    const pkg = JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@hey-api/client-fetch']).toBeDefined()
  })
})

describe('helper functions', () => {
  it('buildServicesSnippet empty selections returns empty string', () => {
    expect(buildServicesSnippet([])).toBe('')
  })

  it('buildServicesSnippet produces valid TypeScript record', () => {
    const snippet = buildServicesSnippet([
      {
        name: 'agent',
        entry: {
          runtime: 'python',
          port: 8001,
          proxy: '/api/agent',
          dev: 'uvicorn main:app',
          start: 'uvicorn main:app --workers 4',
        },
      },
    ])
    expect(snippet).toContain('services:')
    expect(snippet).toContain('agent:')
    expect(snippet).toContain("runtime: 'python'")
  })

  it('injectServicesIntoConfig is idempotent', () => {
    const src = BARE_THEO_CONFIG
    const snippet = '  services: { x: {} },\n'
    const first = injectServicesIntoConfig(src, snippet)
    const second = injectServicesIntoConfig(first, snippet)
    expect(first).toBe(second)
  })

  it('injectHeyApiDep adds dep if missing', () => {
    const updated = injectHeyApiDep(BARE_PACKAGE_JSON)
    const pkg = JSON.parse(updated) as { dependencies: Record<string, string> }
    expect(pkg.dependencies['@hey-api/client-fetch']).toBeDefined()
  })

  it('injectHeyApiDep is idempotent', () => {
    const once = injectHeyApiDep(BARE_PACKAGE_JSON)
    const twice = injectHeyApiDep(once)
    // version should not change between runs
    const a = JSON.parse(once) as { dependencies: Record<string, string> }
    const b = JSON.parse(twice) as { dependencies: Record<string, string> }
    expect(a.dependencies['@hey-api/client-fetch']).toBe(b.dependencies['@hey-api/client-fetch'])
  })
})

describe('parseBackendFlags', () => {
  it('returns empty array when no --backend flag', () => {
    expect(parseBackendFlags(['my-app'])).toEqual([])
  })

  it('parses --backend python', () => {
    expect(parseBackendFlags(['my-app', '--backend', 'python'])).toEqual(['python'])
  })

  it('parses --backend=python (= form)', () => {
    expect(parseBackendFlags(['my-app', '--backend=python'])).toEqual(['python'])
  })

  it('parses --backend node', () => {
    expect(parseBackendFlags(['my-app', '--backend', 'node'])).toEqual(['node'])
  })

  it('parses multi-value: --backend python --backend node', () => {
    expect(parseBackendFlags(['my-app', '--backend', 'python', '--backend', 'node'])).toEqual([
      'python',
      'node',
    ])
  })

  it('throws on unknown backend', () => {
    expect(() => parseBackendFlags(['my-app', '--backend', 'go'])).toThrow(/unknown.*go/i)
  })

  it('error message lists valid options', () => {
    try {
      parseBackendFlags(['my-app', '--backend', 'rust'])
      throw new Error('should have thrown')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toContain('python')
      expect(msg).toContain('node')
    }
  })
})
