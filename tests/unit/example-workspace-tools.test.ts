import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  resolveSafePath,
  workspaceBaseDir,
} from '../../examples/full-stack-agent/server/tools/_workspace.js'
import { buildWorkspaceRead } from '../../examples/full-stack-agent/server/tools/workspace-read.js'
import { buildWorkspaceWrite } from '../../examples/full-stack-agent/server/tools/workspace-write.js'

/**
 * T2.3 — Workspace tools.
 *
 * Includes EC-4 (NUL byte refine) from the edge-case review.
 */

let originalCwd: string
let tmp: string

beforeEach(() => {
  originalCwd = process.cwd()
  tmp = mkdtempSync(join(tmpdir(), 'theokit-workspace-test-'))
  process.chdir(tmp)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(tmp, { recursive: true, force: true })
})

describe('resolveSafePath', () => {
  it('resolves a safe relative path under .theokit/workspace/<agentId>/', () => {
    const abs = resolveSafePath('web-abc', 'notes.md')
    expect(abs).toBe(resolve(tmp, '.theokit/workspace/web-abc/notes.md'))
  })

  it('rejects ../ traversal', () => {
    expect(() => resolveSafePath('web-abc', '../../../etc/passwd')).toThrow(/traversal blocked/)
  })

  it('rejects absolute path (resolve rebases)', () => {
    expect(() => resolveSafePath('web-abc', '/etc/passwd')).toThrow(/traversal blocked/)
  })

  it('rejects invalid agentId (special chars)', () => {
    expect(() => resolveSafePath('web; rm -rf /', 'notes.md')).toThrow(/invalid agentId/)
    expect(() => resolveSafePath('../web', 'notes.md')).toThrow(/invalid agentId/)
  })

  it('rejects empty agentId', () => {
    expect(() => resolveSafePath('', 'notes.md')).toThrow(/invalid agentId/)
  })

  it('EC-4 — rejects NUL byte in path', () => {
    expect(() => resolveSafePath('web-abc', 'notes.md\0../../../etc/passwd')).toThrow(
      /NUL byte not allowed/,
    )
  })

  it('allows nested directories', () => {
    const abs = resolveSafePath('web-abc', 'docs/notes/today.md')
    expect(abs).toBe(resolve(tmp, '.theokit/workspace/web-abc/docs/notes/today.md'))
  })
})

describe('workspaceBaseDir', () => {
  it('returns the sandbox path for a given agentId', () => {
    expect(workspaceBaseDir('web-abc')).toBe(resolve(tmp, '.theokit/workspace/web-abc'))
  })

  it('rejects invalid agentId', () => {
    expect(() => workspaceBaseDir('../bad')).toThrow(/invalid agentId/)
  })
})

describe('workspace_write + workspace_read roundtrip', () => {
  it('write then read returns the same content', async () => {
    const w = buildWorkspaceWrite('web-abc')
    const r = buildWorkspaceRead('web-abc')
    const wResult = JSON.parse(await w.handler({ path: 'notes.md', content: 'hello' })) as {
      written: boolean
    }
    expect(wResult.written).toBe(true)
    const rResult = JSON.parse(await r.handler({ path: 'notes.md' })) as { content: string }
    expect(rResult.content).toBe('hello')
  })

  it('read non-existent file returns { error: not_found }', async () => {
    const r = buildWorkspaceRead('web-abc')
    const result = JSON.parse(await r.handler({ path: 'missing.md' })) as { error?: string }
    expect(result.error).toBe('not_found')
  })

  it('write creates parent directories', async () => {
    const w = buildWorkspaceWrite('web-abc')
    await w.handler({ path: 'docs/today/notes.md', content: 'x' })
    const r = buildWorkspaceRead('web-abc')
    const result = JSON.parse(await r.handler({ path: 'docs/today/notes.md' })) as {
      content: string
    }
    expect(result.content).toBe('x')
  })

  it('EC-4 — Zod rejects NUL byte in path on write', async () => {
    const w = buildWorkspaceWrite('web-abc')
    await expect(
      w.handler({ path: 'notes.md\0../../../etc/passwd', content: 'evil' }),
    ).rejects.toThrow()
  })

  it('write rejects content > 100 KB via Zod max', async () => {
    const w = buildWorkspaceWrite('web-abc')
    await expect(
      w.handler({ path: 'big.bin', content: 'a'.repeat(100 * 1024 + 1) }),
    ).rejects.toThrow()
  })

  it('write rejects empty path via Zod min', async () => {
    const w = buildWorkspaceWrite('web-abc')
    await expect(w.handler({ path: '', content: 'x' })).rejects.toThrow()
  })

  it('write rejects ../ traversal at runtime', async () => {
    const w = buildWorkspaceWrite('web-abc')
    await expect(w.handler({ path: '../escape.md', content: 'x' })).rejects.toThrow(
      /traversal blocked/,
    )
  })

  it('isolates conversations: agent A cannot read agent B files', async () => {
    const wA = buildWorkspaceWrite('web-a')
    const rB = buildWorkspaceRead('web-b')
    await wA.handler({ path: 'secret.md', content: 'A only' })
    const result = JSON.parse(await rB.handler({ path: 'secret.md' })) as { error?: string }
    expect(result.error).toBe('not_found')
  })

  it('read truncates at 4 KB and signals truncated=true', async () => {
    // Write 5 KB directly to bypass the 100 KB write cap and the read cap.
    const base = workspaceBaseDir('web-abc')
    await mkdir(base, { recursive: true })
    await writeFile(join(base, 'big.txt'), 'x'.repeat(5000), 'utf-8')
    const r = buildWorkspaceRead('web-abc')
    const result = JSON.parse(await r.handler({ path: 'big.txt' })) as {
      content: string
      truncated: boolean
    }
    expect(result.content.length).toBeLessThanOrEqual(4096)
    expect(result.truncated).toBe(true)
  })
})
