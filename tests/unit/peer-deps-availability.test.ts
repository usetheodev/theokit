import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PKG = JSON.parse(
  readFileSync(resolve(__dirname, '../../packages/theo/package.json'), 'utf8'),
) as {
  peerDependencies: Record<string, string>
  peerDependenciesMeta: Record<string, { optional?: boolean }>
}

describe('T0.4 — unstorage + db0 as optional peer-deps', () => {
  it('unstorage listed in peerDependencies (happy path)', () => {
    expect(PKG.peerDependencies.unstorage).toBeDefined()
    expect(PKG.peerDependencies.unstorage).toMatch(/^\^1\./)
  })

  it('unstorage marked optional in peerDependenciesMeta (happy path)', () => {
    expect(PKG.peerDependenciesMeta.unstorage?.optional).toBe(true)
  })

  it('db0 listed in peerDependencies (happy path)', () => {
    expect(PKG.peerDependencies.db0).toBeDefined()
    expect(PKG.peerDependencies.db0).toMatch(/^\^0\./)
  })

  it('db0 marked optional in peerDependenciesMeta (happy path)', () => {
    expect(PKG.peerDependenciesMeta.db0?.optional).toBe(true)
  })

  it('unstorage importable in workspace tests (validation error: dep not installed)', async () => {
    const unstorage = (await import('unstorage')) as { createStorage?: unknown }
    expect(typeof unstorage.createStorage).toBe('function')
  })

  it('db0 importable in workspace tests (validation error)', async () => {
    const db0 = (await import('db0')) as { createDatabase?: unknown }
    expect(typeof db0.createDatabase).toBe('function')
  })

  it('ws stays optional (BC; edge case)', () => {
    expect(PKG.peerDependenciesMeta.ws?.optional).toBe(true)
  })
})
