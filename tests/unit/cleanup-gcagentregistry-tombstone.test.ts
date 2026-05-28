/**
 * T7.1 — gcAgentRegistry tombstone tests.
 *
 * SDK's Agent.registry handles GC natively in v1.1.0. The TheoKit-side
 * gcAgentRegistry becomes a no-op + warns ONCE per process (EC-10).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  gcAgentRegistry,
  __resetGcDeprecationWarnedForTests,
} from '../../packages/theo/src/cli/cleanup/cleanup.js'

beforeEach(() => {
  __resetGcDeprecationWarnedForTests()
})

describe('gcAgentRegistry tombstone (T7.1)', () => {
  it('test_gc_agent_registry_returns_no_op — result is {deleted:0, kept:0}', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await gcAgentRegistry({ dir: '/does-not-exist', maxAgents: 5 })
    expect(result).toEqual({ deleted: 0, kept: 0 })
    warnSpy.mockRestore()
  })

  it('test_gc_agent_registry_logs_deprecation — console.warn with `deprecated`', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await gcAgentRegistry({ dir: '/x', maxAgents: 5 })
    expect(warnSpy).toHaveBeenCalled()
    const msg = warnSpy.mock.calls[0][0] as string
    expect(msg).toContain('deprecated')
    warnSpy.mockRestore()
  })

  it('test_gc_agent_registry_does_not_delete_files — no fs interaction', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // No filesystem mocking — if the impl tried to fs.rm anything, it would
    // throw because we're passing a fake path. No throw = no fs interaction.
    const result = await gcAgentRegistry({
      dir: '/this/path/definitely/does/not/exist/abc',
      maxAgents: 5,
    })
    expect(result).toEqual({ deleted: 0, kept: 0 })
    warnSpy.mockRestore()
  })

  // EC-10 (SHOULD TEST)
  it('test_gc_agent_registry_warns_only_once_per_process — 100 calls = 1 warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 100; i++) {
      await gcAgentRegistry({ dir: '/x', maxAgents: 5 })
    }
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('test_dev_command_does_not_import_gc_agent_registry', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(__dirname, '../../packages/theo/src/cli/commands/dev.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/gcAgentRegistry/)
    expect(src).not.toMatch(/from\s+['"]\.\.\/cleanup\/cleanup\.js['"]/)
  })
})
