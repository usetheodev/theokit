import { describe, expect, it, vi, afterEach } from 'vitest'
import { z } from 'zod'

import { defineAgentTool } from '../../packages/theo/src/server/define/define-agent-tool.js'

/**
 * T1.1 — defineAgentTool unit tests.
 *
 * Strict RED-first: every test below MUST fail before implementation lands.
 * Coverage: happy path, validation errors, edge cases (empty schema,
 * recursive schema), EC-6 (empty name), EC-7 (z.lazy recursion).
 */

describe('defineAgentTool', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a CustomTool with object input schema (happy path)', () => {
    const tool = defineAgentTool({
      name: 'greet',
      description: 'Greet a user by name',
      inputSchema: z.object({ name: z.string() }),
      handler: ({ name }) => `Hello, ${name}!`,
    })
    expect(tool.name).toBe('greet')
    expect(tool.description).toBe('Greet a user by name')
    expect(tool.inputSchema).toMatchObject({ type: 'object' })
    const props = (tool.inputSchema as { properties?: Record<string, { type: string }> }).properties
    expect(props?.name?.type).toBe('string')
    expect(typeof tool.handler).toBe('function')
  })

  it('handler parses input at runtime via the Zod schema', async () => {
    const tool = defineAgentTool({
      name: 'with_parse',
      description: 'Parse-then-call',
      inputSchema: z.object({ n: z.number().int() }),
      handler: ({ n }) => `n=${n}`,
    })
    const ok = await tool.handler({ n: 7 })
    expect(ok).toBe('n=7')
    await expect(tool.handler({ n: 'not-a-number' })).rejects.toThrow()
  })

  it('rejects non-object root schema', () => {
    // z.string() IS a valid ZodType (compile-time OK) but a runtime no-no for
    // the LLM tool contract. The handler signature widens via `as never` so
    // the test exercises the runtime guard.
    expect(() =>
      defineAgentTool({
        name: 'bad',
        description: 'top-level string',
        inputSchema: z.string(),
        handler: (() => 'ok') as never,
      }),
    ).toThrow(/inputSchema must be a ZodObject/)
  })

  it('rejects invalid name (whitespace + special chars)', () => {
    expect(() =>
      defineAgentTool({
        name: 'invalid name with spaces',
        description: 'd',
        inputSchema: z.object({}),
        handler: () => 'ok',
      }),
    ).toThrow(/name must match/)
  })

  it('EC-6 — rejects empty-string name', () => {
    expect(() =>
      defineAgentTool({
        name: '',
        description: 'd',
        inputSchema: z.object({}),
        handler: () => 'ok',
      }),
    ).toThrow(/name must match/)
  })

  it('warns (not throws) on empty description', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const tool = defineAgentTool({
      name: 'no_desc',
      description: '',
      inputSchema: z.object({}),
      handler: () => 'ok',
    })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/description/i)
    expect(tool.name).toBe('no_desc')
  })

  it('strips $schema from the generated JSON Schema', () => {
    const tool = defineAgentTool({
      name: 'plain',
      description: 'd',
      inputSchema: z.object({ x: z.string() }),
      handler: () => 'ok',
    })
    expect(tool.inputSchema).not.toHaveProperty('$schema')
  })

  it('handles empty z.object({}) — no-arg tool', () => {
    const tool = defineAgentTool({
      name: 'noargs',
      description: 'd',
      inputSchema: z.object({}),
      handler: () => 'pong',
    })
    expect(tool.inputSchema).toMatchObject({ type: 'object' })
  })

  it('EC-7 — handles recursive (z.lazy) schema within 1s', async () => {
    interface Self {
      children: Self[]
    }
    const SelfSchema: z.ZodType<Self> = z.object({
      children: z.array(z.lazy(() => SelfSchema)),
    })

    const start = Date.now()
    let err: unknown = null
    try {
      defineAgentTool({
        name: 'recursive',
        description: 'd',
        inputSchema: SelfSchema,
        handler: () => 'ok',
      })
    } catch (e) {
      err = e
    }
    const elapsed = Date.now() - start
    // Pass if either (a) returned within 1s (no hang) OR (b) threw a clear error
    expect(elapsed).toBeLessThan(1000)
    if (err !== null) {
      expect(err).toBeInstanceOf(Error)
    }
  })
})
