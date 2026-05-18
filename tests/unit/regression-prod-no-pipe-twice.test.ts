import { describe, it, expect } from 'vitest'
import { generateEntryServer } from '../../packages/theo/src/router/entry-server.js'

/**
 * Regression for nextjs-maturity T3.1.
 *
 * Production bug observed: `Error: React currently only supports piping
 * to one writable stream` logged on every prod SSR request. Caused by
 * the entry-server using `onAllReady` with React 19, where the runtime
 * auto-flushes the shell and a manual `pipe()` in onAllReady becomes
 * the second pipe call → throw.
 *
 * The fix: pipe in `onShellReady` (Next.js pattern) with a `piped`
 * guard. Pin the shape.
 */

describe('T3.1 — entry-server pipes on onShellReady (not onAllReady)', () => {
  it('generated entry uses onShellReady to call pipe', () => {
    const out = generateEntryServer({})
    expect(out).toMatch(/onShellReady\(\)\s*\{[^}]*pipe\(passthrough\)/)
  })

  it('generated entry does NOT call pipe inside onAllReady', () => {
    const out = generateEntryServer({})
    // Either onAllReady is absent OR it does not contain pipe(passthrough)
    const onAllReadyMatch = out.match(/onAllReady\(\)\s*\{([^}]*)\}/)
    if (onAllReadyMatch) {
      expect(onAllReadyMatch[1]).not.toContain('pipe(')
    }
  })

  it('guard flag prevents double-pipe even if onShellReady fires twice', () => {
    const out = generateEntryServer({})
    expect(out).toContain('let piped = false')
    expect(out).toMatch(/if\s*\(\s*!piped\s*\)/)
  })

  it('same pattern applies with theoUi enabled', () => {
    const out = generateEntryServer({ theoUi: { theme: 'noir' } })
    expect(out).toMatch(/onShellReady\(\)/)
    expect(out).toContain('let piped = false')
  })

  it('same pattern applies for streaming entry', () => {
    const out = generateEntryServer({ streaming: true })
    // Streaming entry has different shape; just assert it has not regressed
    // to the old onAllReady + pipe pattern.
    const onAllReadyMatch = out.match(/onAllReady\(\)\s*\{([^}]*pipe\([^)]*\)[^}]*)\}/)
    expect(onAllReadyMatch, 'streaming onAllReady should not call pipe()').toBeNull()
  })
})
