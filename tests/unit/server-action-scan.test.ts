import { describe, it, expect, beforeEach } from 'vitest'
import { scanServerActions } from '../../packages/theo/src/server/action-scan.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let serverDir: string

beforeEach(() => {
  const base = join(
    tmpdir(),
    `theo-action-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  serverDir = join(base, 'server')
  mkdirSync(join(serverDir, 'actions'), { recursive: true })
})

function touch(relativePath: string, content = 'export const test = {}') {
  const full = join(serverDir, 'actions', relativePath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

describe('scanServerActions', () => {
  it('should find action file', () => {
    touch('create-user.ts')
    const actions = scanServerActions(serverDir)
    expect(actions).toHaveLength(1)
    expect(actions[0].actionPath).toBe('create-user')
  })

  it('should find nested action file', () => {
    touch('users/invite.ts')
    const actions = scanServerActions(serverDir)
    expect(actions[0].actionPath).toBe('users/invite')
  })

  it('should return empty for empty dir', () => {
    const actions = scanServerActions(serverDir)
    expect(actions).toEqual([])
  })

  it('should return empty for nonexistent dir', () => {
    const actions = scanServerActions('/nonexistent/path')
    expect(actions).toEqual([])
  })

  it('should ignore _prefixed dirs', () => {
    touch('_internal/helper.ts')
    const actions = scanServerActions(serverDir)
    expect(actions).toEqual([])
  })

  it('should have absolute filePath', () => {
    touch('create-user.ts')
    const actions = scanServerActions(serverDir)
    expect(actions[0].filePath).toContain('create-user.ts')
    expect(actions[0].filePath.startsWith('/')).toBe(true)
  })
})
