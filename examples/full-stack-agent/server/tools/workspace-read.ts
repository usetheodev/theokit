import { readFile } from 'node:fs/promises'

import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

import { resolveSafePath } from './_workspace.js'

const MAX_READ_BYTES = 4096

/**
 * Builder — returns a `CustomTool` scoped to the given agentId. Each
 * conversation gets its own sandbox.
 */
export function buildWorkspaceRead(agentId: string) {
  return defineAgentTool({
    name: 'workspace_read',
    description:
      'Read a file from the conversation workspace. Path is relative to ' +
      '.theokit/workspace/<conversationId>/. Returns first 4 KB of content. ' +
      'Returns { error: "not_found" } when the file does not exist.',
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .max(512)
        // EC-4 — reject NUL bytes that could truncate the filename
        // server-side and bypass the sandbox check.
        .refine((p) => !p.includes('\0'), { message: 'NUL byte not allowed' }),
    }),
    handler: async ({ path }) => {
      const abs = resolveSafePath(agentId, path)
      try {
        const buf = await readFile(abs)
        const bytes = buf.subarray(0, MAX_READ_BYTES)
        return JSON.stringify({
          path,
          content: new TextDecoder('utf-8').decode(bytes),
          truncated: buf.length > MAX_READ_BYTES,
        })
      } catch (err) {
        if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
          return JSON.stringify({ path, error: 'not_found' })
        }
        throw err
      }
    },
  })
}
