import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

import { resolveSafePath } from './_workspace.js'

const MAX_WRITE_BYTES = 100 * 1024 // 100 KB per write

export function buildWorkspaceWrite(agentId: string) {
  return defineAgentTool({
    name: 'workspace_write',
    description:
      'Write a file to the conversation workspace. Path is relative to ' +
      '.theokit/workspace/<conversationId>/. Content cap: 100 KB. ' +
      'Creates parent directories as needed. Overwrites existing files.',
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .max(512)
        // EC-4 — reject NUL bytes that could truncate the filename.
        .refine((p) => !p.includes('\0'), { message: 'NUL byte not allowed' }),
      content: z.string().max(MAX_WRITE_BYTES, {
        message: `content exceeds ${MAX_WRITE_BYTES.toString()} byte cap`,
      }),
    }),
    handler: async ({ path, content }) => {
      const abs = resolveSafePath(agentId, path)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf-8')
      return JSON.stringify({ path, written: true, bytes: Buffer.byteLength(content, 'utf-8') })
    },
  })
}
