import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  resolveAgentMemory,
  AgentMemoryError,
  MEMORY_LINE_CAP,
  MEMORY_BYTE_CAP,
} from '../../src/config/agent-memory.js'

/**
 * A subagent declaring `memory:` got a directory nobody read.
 *
 * Measured 2026-09-12 with controls (`loadMcpJson` 6 files in this package, an invented term 0):
 * `agent-memory` returns 0 files in `packages/agents/src`, and the 7 hits in `@theokit/sdk@5.5.0` —
 * the version the downstream product runs — are the internal module names `local-agent-memory.ts`,
 * `local-agent-memory-direct.ts` and `local-agent-memory-provider.ts`, not this surface. The SDK's
 * `MemorySettings` is a different feature entirely: a vector store with embeddings and
 * `scope: "agent" | "user" | "team"`.
 *
 * So a subagent whose frontmatter says `memory: project` started every run with nothing, while its
 * own definition said otherwise — the shape this whole line of work exists to close.
 *
 * ## The three roots are decided together
 *
 * B-028's Definition of Done is explicit that supporting one and silently dropping two IS the defect.
 * `project` is committed and shared with the team, `local` is deliberately kept out of version
 * control, and `user` crosses projects. A consumer who wrote `memory: local` expecting privacy and
 * silently got the committed root would be the worst outcome available here.
 *
 * ## The cap is matched, and reported when it bites
 *
 * The reference loads the first 200 lines, capped at 25KB. Truncating silently would let an author
 * believe the whole file reached the subagent — the same silence as not reading it at all, only
 * harder to notice.
 */
function projectWith(files: Record<string, string>): { cwd: string; homeDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'theokit-agent-memory-'))
  const cwd = join(root, 'project')
  const homeDir = join(root, 'home')
  mkdirSync(cwd, { recursive: true })
  mkdirSync(homeDir, { recursive: true })
  for (const [rel, body] of Object.entries(files)) {
    const path = join(rel.startsWith('~/') ? homeDir : cwd, rel.replace(/^~\//, ''))
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, body)
  }
  return { cwd, homeDir }
}

describe('a subagent memory root resolves to the documented directory', () => {
  it('reads `memory: project` from the committed root', () => {
    const { cwd, homeDir } = projectWith({
      '.claude/agent-memory/auditor/MEMORY.md': 'PROJECT MEMORY',
    })

    const m = resolveAgentMemory({ agent: 'auditor', scope: 'project', cwd, homeDir })

    expect(m.root).toBe(join(cwd, '.claude', 'agent-memory', 'auditor'))
    expect(m.memory).toBe('PROJECT MEMORY')
  })

  it('reads `memory: local` from the root kept OUT of version control', () => {
    // The distinction that carries the privacy promise. An author who wrote `local` and silently got
    // the committed root would have their notes published by the next commit.
    const { cwd, homeDir } = projectWith({
      '.claude/agent-memory-local/auditor/MEMORY.md': 'LOCAL MEMORY',
      '.claude/agent-memory/auditor/MEMORY.md': 'COMMITTED MEMORY',
    })

    const m = resolveAgentMemory({ agent: 'auditor', scope: 'local', cwd, homeDir })

    expect(m.root).toBe(join(cwd, '.claude', 'agent-memory-local', 'auditor'))
    expect(m.memory, 'local must not fall through to the committed root').toBe('LOCAL MEMORY')
  })

  it('reads `memory: user` from the home root, which crosses projects', () => {
    const { cwd, homeDir } = projectWith({
      '~/.claude/agent-memory/auditor/MEMORY.md': 'USER MEMORY',
    })

    const m = resolveAgentMemory({ agent: 'auditor', scope: 'user', cwd, homeDir })

    expect(m.root).toBe(join(homeDir, '.claude', 'agent-memory', 'auditor'))
    expect(m.memory).toBe('USER MEMORY')
  })

  it('returns the root with no memory when the agent has written none yet', () => {
    // The ordinary first run. A subagent that has never written is not an error, and the ROOT still
    // resolves — that is where it will write.
    const { cwd, homeDir } = projectWith({})

    const m = resolveAgentMemory({ agent: 'fresh', scope: 'project', cwd, homeDir })

    expect(m.root).toBe(join(cwd, '.claude', 'agent-memory', 'fresh'))
    expect(m.memory).toBeUndefined()
    expect(m.truncated).toBe(false)
  })

  it('caps at 200 lines and SAYS it truncated', () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${String(i + 1)}`).join('\n')
    const { cwd, homeDir } = projectWith({ '.claude/agent-memory/wordy/MEMORY.md': long })

    const m = resolveAgentMemory({ agent: 'wordy', scope: 'project', cwd, homeDir })

    expect(m.memory?.split('\n')).toHaveLength(MEMORY_LINE_CAP)
    expect(m.memory).toContain('line 200')
    expect(m.memory, 'line 201 crossed the cap').not.toContain('line 201')
    expect(m.truncated, 'silent truncation is the same silence as not reading it').toBe(true)
  })

  it('caps at 25KB even when the line count is under the limit', () => {
    // Both caps, not whichever is convenient: ten very long lines are under 200 and over 25KB.
    const fat = Array.from({ length: 10 }, () => 'x'.repeat(4000)).join('\n')
    const { cwd, homeDir } = projectWith({ '.claude/agent-memory/fat/MEMORY.md': fat })

    const m = resolveAgentMemory({ agent: 'fat', scope: 'project', cwd, homeDir })

    expect(Buffer.byteLength(m.memory ?? '', 'utf8')).toBeLessThanOrEqual(MEMORY_BYTE_CAP)
    expect(m.truncated).toBe(true)
  })

  it('does not truncate, or claim to, when the file fits', () => {
    // The control. A loader that reported truncation unconditionally would make the flag useless.
    const { cwd, homeDir } = projectWith({ '.claude/agent-memory/small/MEMORY.md': 'one line' })

    const m = resolveAgentMemory({ agent: 'small', scope: 'project', cwd, homeDir })

    expect(m.memory).toBe('one line')
    expect(m.truncated).toBe(false)
  })

  it('REFUSES a scope the reference does not define, rather than guessing', () => {
    // The DoD's first branch: read the documented root, or refuse. Falling back to `project` on an
    // unrecognised value would put an author's notes in the committed root by accident.
    const { cwd, homeDir } = projectWith({})

    expect(() => resolveAgentMemory({ agent: 'a', scope: 'team' as never, cwd, homeDir })).toThrow(
      AgentMemoryError,
    )
  })

  it('refuses a scope that only resolves through the prototype chain', () => {
    // `constructor`, `toString` and friends answer `in` truthily on any object. With `in` instead of
    // `Object.hasOwn`, `memory: constructor` would index a function and resolve a root nobody
    // declared. Added when the cast that hid this was removed.
    const { cwd, homeDir } = projectWith({})

    for (const forged of ['constructor', 'toString', '__proto__']) {
      expect(() =>
        resolveAgentMemory({ agent: 'a', scope: forged as never, cwd, homeDir }),
      ).toThrow(AgentMemoryError)
    }
  })

  it('refuses an agent name that would escape the memory root', () => {
    // The name comes from a subagent file that arrives with the repository. `../` in it would let a
    // project read or write outside the directory this surface is confined to.
    const { cwd, homeDir } = projectWith({})

    expect(() =>
      resolveAgentMemory({ agent: '../escape', scope: 'project', cwd, homeDir }),
    ).toThrow(AgentMemoryError)
  })

  it('refuses `user` scope with no home directory instead of writing into the project', () => {
    const { cwd } = projectWith({})

    expect(() => resolveAgentMemory({ agent: 'a', scope: 'user', cwd })).toThrow(AgentMemoryError)
  })
})
