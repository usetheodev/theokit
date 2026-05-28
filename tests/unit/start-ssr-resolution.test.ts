import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveSsrEntry } from '../../packages/theo/src/cli/commands/start.js'

/**
 * T0.1 — SSR entry resolution for `theokit start`.
 *
 * tsup emits `.mjs` for ESM builds; `theokit start` was looking for `.js`
 * only and silently fell back to no-SSR. The fix tries `.mjs` first then
 * `.js`, returning null if neither exists.
 */

describe('resolveSsrEntry — T0.1', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'theokit-ssr-resolve-'))
    mkdirSync(join(tmp, 'server'), { recursive: true })
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('prefers .mjs when both .mjs and .js exist', () => {
    writeFileSync(join(tmp, 'server/entry-server.mjs'), 'export const render = () => {}')
    writeFileSync(join(tmp, 'server/entry-server.js'), 'module.exports = { render: () => {} }')
    const path = resolveSsrEntry(tmp)
    expect(path).toBe(join(tmp, 'server/entry-server.mjs'))
  })

  it('falls back to .js when only .js exists', () => {
    writeFileSync(join(tmp, 'server/entry-server.js'), 'module.exports = { render: () => {} }')
    const path = resolveSsrEntry(tmp)
    expect(path).toBe(join(tmp, 'server/entry-server.js'))
  })

  it('returns null when neither extension exists', () => {
    const path = resolveSsrEntry(tmp)
    expect(path).toBeNull()
  })

  it('returns an absolute path', () => {
    writeFileSync(join(tmp, 'server/entry-server.mjs'), '')
    const path = resolveSsrEntry(tmp)!
    expect(path.startsWith('/')).toBe(true)
  })
})
