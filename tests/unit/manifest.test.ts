import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  generateManifest,
  writeManifest,
  loadManifest,
} from '../../packages/theo/src/server/manifest.js'

const TMP_DIR = join(__dirname, '..', '__tmp_manifest_test__')

function setupFixture(structure: Record<string, string>): void {
  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = join(TMP_DIR, filePath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
}

describe('generateManifest', () => {
  beforeEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
    mkdirSync(TMP_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it('should scan routes and return manifest with correct routePaths and paramNames', () => {
    const serverDir = join(TMP_DIR, 'server')
    setupFixture({
      'server/routes/health.ts': 'export const GET = { handler: () => ({ ok: true }) }',
      'server/routes/users/[id].ts': 'export const GET = { handler: () => ({}) }',
    })

    const manifest = generateManifest(serverDir)

    expect(manifest.version).toBe(1)
    expect(manifest.routes).toHaveLength(2)

    const healthRoute = manifest.routes.find((r) => r.routePath === '/api/health')
    expect(healthRoute).toBeDefined()
    expect(healthRoute!.paramNames).toEqual([])

    const userRoute = manifest.routes.find((r) => r.routePath === '/api/users/:id')
    expect(userRoute).toBeDefined()
    expect(userRoute!.paramNames).toEqual(['id'])
  })

  it('should scan actions and include in manifest', () => {
    const serverDir = join(TMP_DIR, 'server')
    setupFixture({
      'server/actions/create-user.ts': 'export const createUser = {}',
    })

    const manifest = generateManifest(serverDir)

    expect(manifest.actions).toHaveLength(1)
    expect(manifest.actions[0].actionPath).toBe('create-user')
  })

  it('should scan websockets and include in manifest', () => {
    const serverDir = join(TMP_DIR, 'server')
    setupFixture({
      'server/ws/chat.ts': 'export default {}',
    })

    const manifest = generateManifest(serverDir)

    expect(manifest.websockets).toHaveLength(1)
    expect(manifest.websockets[0].wsPath).toBe('/ws/chat')
  })

  it('should return empty arrays when server dir has no routes/actions/ws', () => {
    const serverDir = join(TMP_DIR, 'server')
    mkdirSync(serverDir, { recursive: true })

    const manifest = generateManifest(serverDir)

    expect(manifest.routes).toEqual([])
    expect(manifest.actions).toEqual([])
    expect(manifest.websockets).toEqual([])
    expect(manifest.version).toBe(1)
    expect(manifest.generatedAt).toBeDefined()
  })
})

describe('writeManifest', () => {
  beforeEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
    mkdirSync(TMP_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it('should write valid JSON file to .theo/manifest.json', () => {
    const outputDir = join(TMP_DIR, '.theo')
    const manifest = {
      version: 1 as const,
      generatedAt: new Date().toISOString(),
      routes: [
        { filePath: 'routes/health.ts', routePath: '/api/health', paramNames: [] },
      ],
      actions: [],
      websockets: [],
    }

    writeManifest(manifest, outputDir)

    const manifestPath = join(outputDir, 'manifest.json')
    expect(existsSync(manifestPath)).toBe(true)

    const written = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    expect(written.version).toBe(1)
    expect(written.routes).toHaveLength(1)
    expect(written.routes[0].routePath).toBe('/api/health')
  })
})

describe('loadManifest', () => {
  beforeEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
    mkdirSync(TMP_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it('should recompile RegExp patterns from routePaths', () => {
    const distDir = join(TMP_DIR, '.theo')
    const serverDir = join(TMP_DIR, 'server')
    mkdirSync(distDir, { recursive: true })
    writeFileSync(
      join(distDir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          { filePath: 'routes/users/[id].ts', routePath: '/api/users/:id', paramNames: ['id'] },
        ],
        actions: [],
        websockets: [],
      }),
    )

    const loaded = loadManifest(distDir, serverDir)

    expect(loaded.routes).toHaveLength(1)
    expect(loaded.routes[0].pattern).toBeInstanceOf(RegExp)
    expect(loaded.routes[0].pattern.test('/api/users/123')).toBe(true)
    expect(loaded.routes[0].pattern.test('/api/users')).toBe(false)
  })

  it('should resolve filePaths relative to serverDir', () => {
    const distDir = join(TMP_DIR, '.theo')
    const serverDir = join(TMP_DIR, 'server')
    mkdirSync(distDir, { recursive: true })
    writeFileSync(
      join(distDir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          { filePath: 'routes/health.ts', routePath: '/api/health', paramNames: [] },
        ],
        actions: [
          { filePath: 'actions/create-user.ts', actionPath: 'create-user' },
        ],
        websockets: [],
      }),
    )

    const loaded = loadManifest(distDir, serverDir)

    expect(loaded.routes[0].filePath).toBe(resolve(serverDir, 'routes/health.ts'))
    expect(loaded.actions[0].filePath).toBe(resolve(serverDir, 'actions/create-user.ts'))
  })

  it('should resolve filePaths correctly with different serverDir (EC-2)', () => {
    const distDir = join(TMP_DIR, '.theo')
    const deployServerDir = join(TMP_DIR, 'deploy', 'server')
    mkdirSync(distDir, { recursive: true })
    writeFileSync(
      join(distDir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          { filePath: 'routes/health.ts', routePath: '/api/health', paramNames: [] },
        ],
        actions: [],
        websockets: [],
      }),
    )

    const loaded = loadManifest(distDir, deployServerDir)

    // filePath should be resolved relative to the DEPLOY serverDir, not the build one
    expect(loaded.routes[0].filePath).toBe(resolve(deployServerDir, 'routes/health.ts'))
  })

  it('should throw when manifest.json does not exist', () => {
    const distDir = join(TMP_DIR, '.theo')
    const serverDir = join(TMP_DIR, 'server')
    mkdirSync(distDir, { recursive: true })

    expect(() => loadManifest(distDir, serverDir)).toThrow(/theo build/)
  })
})
