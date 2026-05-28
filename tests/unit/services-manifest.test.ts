import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildManifest,
  writeManifest,
  readManifest,
} from '../../packages/theo/src/services/index.js'
import type { ServicesConfig } from '../../packages/theo/src/services/index.js'

let tmp: string

const PYTHON_SERVICE = {
  runtime: 'python' as const,
  port: 8001,
  proxy: '/api/agent',
  dev: 'uvicorn main:app',
  start: 'uvicorn main:app --workers 4',
  healthcheck: '/health',
  cors: false,
  passSetCookie: false,
}

const NODE_SERVICE = {
  runtime: 'node' as const,
  port: 8002,
  proxy: '/api/worker',
  dev: 'tsx watch src/index.ts',
  start: 'node dist/index.js',
  healthcheck: '/health',
  cors: false,
  passSetCookie: false,
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'services-manifest-test-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('T1.4 — services manifest', () => {
  it('buildManifest empty returns version:1 and empty services array', () => {
    const m = buildManifest({})
    expect(m.version).toBe(1)
    expect(m.services).toEqual([])
  })

  it('buildManifest one service produces one entry', () => {
    const cfg: ServicesConfig = { agent: PYTHON_SERVICE }
    const m = buildManifest(cfg)
    expect(m.services).toHaveLength(1)
    expect(m.services[0]?.name).toBe('agent')
    expect(m.services[0]?.runtime).toBe('python')
  })

  it('buildManifest preserves all fields', () => {
    const cfg: ServicesConfig = {
      agent: {
        ...PYTHON_SERVICE,
        env: { MY: 'x' },
        dependsOn: [],
        build: 'echo build',
        openapi: 'http://localhost:8001/openapi.json',
      },
    }
    const m = buildManifest(cfg)
    expect(m.services[0]?.env).toEqual({ MY: 'x' })
    expect(m.services[0]?.build).toBe('echo build')
    expect(m.services[0]?.openapi).toBe('http://localhost:8001/openapi.json')
  })

  it('buildManifest applies topological order (deps first)', () => {
    const cfg: ServicesConfig = {
      a: { ...PYTHON_SERVICE, port: 8001, proxy: '/api/a', dependsOn: ['b'] },
      b: { ...NODE_SERVICE, port: 8002, proxy: '/api/b' },
      c: { ...NODE_SERVICE, port: 8003, proxy: '/api/c', dependsOn: ['a'] },
    }
    const m = buildManifest(cfg)
    const names = m.services.map((s) => s.name)
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('a'))
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'))
  })

  it('writeManifest + readManifest roundtrip preserves shape', () => {
    const cfg: ServicesConfig = { agent: PYTHON_SERVICE }
    const m = buildManifest(cfg)
    writeManifest(tmp, m)
    const restored = readManifest(tmp)
    expect(restored).toEqual(m)
  })

  it('readManifest returns null when file missing', () => {
    const restored = readManifest(tmp)
    expect(restored).toBeNull()
  })

  it('readManifest throws actionable error on malformed JSON', () => {
    const filePath = join(tmp, '.theo', 'services.json')
    mkdirSync(join(tmp, '.theo'), { recursive: true })
    writeFileSync(filePath, '{not json')
    expect(() => readManifest(tmp)).toThrow(/services\.json/i)
  })

  it('manifest contains no platform-specific fields (D5 enforcement)', () => {
    const cfg: ServicesConfig = { agent: PYTHON_SERVICE }
    const m = buildManifest(cfg)
    writeManifest(tmp, m)
    const raw = readFileSync(join(tmp, '.theo', 'services.json'), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    expect(parsed).not.toHaveProperty('vercel')
    expect(parsed).not.toHaveProperty('cloudflare')
    expect(parsed).not.toHaveProperty('theoCloud')
  })

  // EC-6
  it('writeManifest creates .theo/ directory if absent (EC-6)', () => {
    expect(existsSync(join(tmp, '.theo'))).toBe(false)
    const m = buildManifest({})
    writeManifest(tmp, m)
    expect(existsSync(join(tmp, '.theo'))).toBe(true)
    expect(existsSync(join(tmp, '.theo', 'services.json'))).toBe(true)
  })
})
