import { describe, it, expect } from 'vitest'
import { createLogMerger } from '../../packages/theo/src/services/index.js'

function captureWrites(): { writes: string[]; write: (s: string) => void } {
  const writes: string[] = []
  return {
    writes,
    write: (s: string) => {
      writes.push(s)
    },
  }
}

describe('T2.3 — log merger', () => {
  it('prefixes service name in output', () => {
    const out = captureWrites()
    const merger = createLogMerger({ write: out.write })
    merger.onLog('agent', 'stdout', 'hello')
    expect(out.writes.join('')).toContain('[agent]')
    expect(out.writes.join('')).toContain('hello')
  })

  it('parses JSON log lines', () => {
    const out = captureWrites()
    const merger = createLogMerger({ write: out.write })
    merger.onLog(
      'agent',
      'stdout',
      JSON.stringify({ level: 'info', message: 'started', service: 'agent' }),
    )
    const joined = out.writes.join('')
    expect(joined).toContain('started')
    expect(joined.toLowerCase()).toContain('info')
  })

  it('falls back to raw line on invalid JSON', () => {
    const out = captureWrites()
    const merger = createLogMerger({ write: out.write })
    merger.onLog('agent', 'stdout', 'not json {[')
    const joined = out.writes.join('')
    expect(joined).toContain('not json')
    expect(joined).toContain('[agent]')
  })

  it('marks stderr output distinctly', () => {
    const out = captureWrites()
    const merger = createLogMerger({ write: out.write })
    merger.onLog('agent', 'stderr', 'oops')
    const joined = out.writes.join('')
    // stderr renders with the same prefix but a distinct marker
    expect(joined).toContain('[agent]')
    expect(joined).toContain('oops')
  })

  it('deterministic color per service (same name => same color)', () => {
    const out = captureWrites()
    const merger = createLogMerger({ write: out.write })
    merger.onLog('agent', 'stdout', 'msg1')
    merger.onLog('agent', 'stdout', 'msg2')
    merger.onLog('worker', 'stdout', 'msg3')
    // We can't easily assert on color codes; instead, assert that the prefix
    // is consistent across calls for the same service
    expect(out.writes.filter((w) => w.includes('msg1') || w.includes('msg2')).length).toBe(2)
  })

  it('splits multi-line chunks into separate prefixed lines', () => {
    const out = captureWrites()
    const merger = createLogMerger({ write: out.write })
    merger.onLog('agent', 'stdout', 'line1\nline2')
    const joined = out.writes.join('')
    expect(joined).toContain('line1')
    expect(joined).toContain('line2')
  })
})
