import { describe, expect, it } from 'vitest'

import { echo } from '../../examples/full-stack-agent/server/tools/echo.js'
import { buildTools } from '../../examples/full-stack-agent/server/tools/index.js'

/**
 * T2.4 + index catalog smoke.
 */

describe('echo', () => {
  it('returns input verbatim', async () => {
    expect(await echo.handler({ text: 'hi' })).toBe('hi')
  })

  it('handles empty string', async () => {
    expect(await echo.handler({ text: '' })).toBe('')
  })

  it('handles unicode (emoji + CJK)', async () => {
    expect(await echo.handler({ text: '日本語 🚀' })).toBe('日本語 🚀')
  })

  it('rejects input > 1000 chars via Zod max', async () => {
    await expect(echo.handler({ text: 'a'.repeat(1001) })).rejects.toThrow()
  })
})

describe('tools/index — buildTools catalog', () => {
  it('returns 8 tools', () => {
    const tools = buildTools('web-test')
    expect(tools).toHaveLength(8)
  })

  it('includes all 8 tool names', () => {
    const tools = buildTools('web-test')
    const names = tools.map((t) => t.name)
    for (const expected of [
      'current_time',
      'calculator',
      'random_number',
      'web_fetch',
      'web_search',
      'workspace_read',
      'workspace_write',
      'echo',
    ]) {
      expect(names, `missing tool: ${expected}`).toContain(expected)
    }
  })
})
