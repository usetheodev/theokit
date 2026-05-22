import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import { defineAgentTool } from '../../packages/theo/src/server/define-agent-tool.js'
import type { CustomTool } from '../../packages/theo/src/server/define-agent-tool.js'

/**
 * T1.1 — defineAgentTool type tests.
 *
 * Pins the handler input inference via z.infer<T> and the return type
 * (CustomTool — structurally identical to @usetheo/sdk's CustomTool).
 */

describe('defineAgentTool (types)', () => {
  it('infers handler input from inputSchema', () => {
    defineAgentTool({
      name: 'check',
      description: 'd',
      inputSchema: z.object({ count: z.number(), tag: z.string() }),
      handler: (input) => {
        expectTypeOf(input).toEqualTypeOf<{ count: number; tag: string }>()
        return 'ok'
      },
    })
  })

  it('handler may return string OR Promise<string>', () => {
    defineAgentTool({
      name: 'sync',
      description: 'd',
      inputSchema: z.object({}),
      handler: () => 'sync',
    })

    defineAgentTool({
      name: 'async',
      description: 'd',
      inputSchema: z.object({}),
      handler: async () => 'async',
    })
  })

  it('rejects handler returning a number', () => {
    defineAgentTool({
      name: 'badreturn',
      description: 'd',
      inputSchema: z.object({}),
      // @ts-expect-error — number is not assignable to string | Promise<string>
      handler: () => 42,
    })
  })

  it('return type matches CustomTool structurally', () => {
    const tool = defineAgentTool({
      name: 'check_return',
      description: 'd',
      inputSchema: z.object({ x: z.string() }),
      handler: ({ x }) => x,
    })
    expectTypeOf(tool).toExtend<CustomTool>()
  })
})
