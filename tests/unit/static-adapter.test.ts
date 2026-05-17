import { describe, it, expect } from 'vitest'
import {
  staticAdapter,
  buildStatic,
  detectApiRoutes,
  StaticApiRoutesDetectedError,
} from '../../packages/theo/src/adapters/static.js'
import { VALID_TARGETS } from '../../packages/theo/src/adapters/types.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TheoConfig } from '../../packages/theo/src/config/schema.js'

const fakeConfig: TheoConfig = {} as TheoConfig

describe('Static adapter — shape', () => {
  it('exposes the DeployAdapter contract', () => {
    expect(staticAdapter.name).toBe('static')
    expect(typeof staticAdapter.build).toBe('function')
  })

  it('is listed in VALID_TARGETS', () => {
    expect(VALID_TARGETS).toContain('static')
  })
})

describe('detectApiRoutes', () => {
  function makeServerDir(structure: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'theo-static-test-'))
    for (const [path, content] of Object.entries(structure)) {
      const full = join(root, path)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, content)
    }
    return root
  }

  it('returns empty array when server/ does not exist', () => {
    const result = detectApiRoutes(join(tmpdir(), 'theo-no-server-' + Date.now()))
    expect(result).toEqual([])
  })

  it('returns empty array when server/ exists but routes/ does not', () => {
    const dir = makeServerDir({ 'actions/login.ts': 'export const POST = {}' })
    try {
      expect(detectApiRoutes(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('finds .ts route files', () => {
    const dir = makeServerDir({
      'routes/users.ts': 'export const GET = {}',
      'routes/posts.ts': 'export const GET = {}',
    })
    try {
      const result = detectApiRoutes(dir)
      expect(result.sort()).toEqual(['posts.ts', 'users.ts'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('finds nested route files', () => {
    const dir = makeServerDir({
      'routes/users/[id].ts': 'export const GET = {}',
    })
    try {
      expect(detectApiRoutes(dir)).toContain('users/[id].ts')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ignores non-route files', () => {
    const dir = makeServerDir({
      'routes/users.ts': 'export const GET = {}',
      'routes/README.md': 'docs',
      'routes/.gitkeep': '',
    })
    try {
      expect(detectApiRoutes(dir)).toEqual(['users.ts'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('buildStatic — orchestration', () => {
  it('aborts with StaticApiRoutesDetectedError when API routes are found', async () => {
    const written: Record<string, string> = {}
    await expect(
      buildStatic(fakeConfig, '/fake/cwd', {
        detectApiRoutes: () => ['users.ts'],
        collectPaths: async () => [],
        renderHtml: async () => '<html></html>',
        writeFile: async (p, c) => {
          written[p] = c
        },
        ensureDir: async () => {},
        runNodeBuild: async () => {},
        scanAppRoutes: () => ({ segment: '', path: '/', children: [] }),
        loadStaticPaths: async () => null,
      }),
    ).rejects.toThrow(StaticApiRoutesDetectedError)
    expect(Object.keys(written)).toHaveLength(0)
  })

  it('renders one HTML file per resolved path', async () => {
    const written: Record<string, string> = {}
    await buildStatic(fakeConfig, '/fake/cwd', {
      detectApiRoutes: () => [],
      collectPaths: async () => [
        { url: '/', filename: 'index.html' },
        { url: '/about', filename: 'about.html' },
      ],
      renderHtml: async (url) => `<html><body>${url}</body></html>`,
      writeFile: async (p, c) => {
        written[p] = c
      },
      ensureDir: async () => {},
      runNodeBuild: async () => {},
      scanAppRoutes: () => ({ segment: '', path: '/', children: [] }),
      loadStaticPaths: async () => null,
    })
    expect(Object.keys(written).sort()).toEqual([
      '/fake/cwd/.theo/static/about.html',
      '/fake/cwd/.theo/static/index.html',
    ])
    expect(written['/fake/cwd/.theo/static/index.html']).toContain('<body>/</body>')
    expect(written['/fake/cwd/.theo/static/about.html']).toContain('<body>/about</body>')
  })

  it('runs node build before rendering', async () => {
    const calls: string[] = []
    await buildStatic(fakeConfig, '/cwd', {
      detectApiRoutes: () => [],
      collectPaths: async () => {
        calls.push('collect')
        return []
      },
      renderHtml: async () => '',
      writeFile: async () => {
        calls.push('write')
      },
      ensureDir: async () => {},
      runNodeBuild: async () => {
        calls.push('node-build')
      },
      scanAppRoutes: () => {
        calls.push('scan')
        return { segment: '', path: '/', children: [] }
      },
      loadStaticPaths: async () => null,
    })
    expect(calls[0]).toBe('node-build')
    expect(calls.indexOf('scan')).toBeGreaterThan(calls.indexOf('node-build'))
  })

  it('does not render when no paths resolved', async () => {
    let renderCalled = false
    await buildStatic(fakeConfig, '/cwd', {
      detectApiRoutes: () => [],
      collectPaths: async () => [],
      renderHtml: async () => {
        renderCalled = true
        return ''
      },
      writeFile: async () => {},
      ensureDir: async () => {},
      runNodeBuild: async () => {},
      scanAppRoutes: () => ({ segment: '', path: '/', children: [] }),
      loadStaticPaths: async () => null,
    })
    expect(renderCalled).toBe(false)
  })

  it('propagates renderHtml errors with the failing URL', async () => {
    await expect(
      buildStatic(fakeConfig, '/cwd', {
        detectApiRoutes: () => [],
        collectPaths: async () => [{ url: '/broken', filename: 'broken.html' }],
        renderHtml: async () => {
          throw new Error('SSR exploded')
        },
        writeFile: async () => {},
        ensureDir: async () => {},
        runNodeBuild: async () => {},
        scanAppRoutes: () => ({ segment: '', path: '/', children: [] }),
        loadStaticPaths: async () => null,
      }),
    ).rejects.toThrow(/\/broken/)
  })
})
