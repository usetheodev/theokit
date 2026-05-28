import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { defineRoute } from 'theokit/server'

/**
 * GET /api/conversations — lists agent registries under
 * `<cwd>/.theokit/agents/`. Returns id + last-modified timestamp per dir.
 * Used by `/history` page to show recent conversations.
 *
 * Each conversation maps to one `Agent.getOrCreate(<id>)` from @usetheo/sdk
 * (the SDK auto-persists turns in `messages.jsonl` inside each dir).
 */
export const GET = defineRoute({
  handler: () => {
    const agentsDir = resolve(process.cwd(), '.theokit', 'agents')
    let entries: { id: string; mtime: number; bytes: number }[] = []
    try {
      const names = readdirSync(agentsDir, { withFileTypes: true })
      for (const dirent of names) {
        if (!dirent.isDirectory()) continue
        const dirPath = join(agentsDir, dirent.name)
        let bytes = 0
        try {
          const messagesPath = join(dirPath, 'messages.jsonl')
          bytes = statSync(messagesPath).size
        } catch {
          // No messages.jsonl yet — empty conversation
        }
        const mtime = statSync(dirPath).mtime.getTime()
        entries.push({ id: dirent.name, mtime, bytes })
      }
      // Newest first
      entries.sort((a, b) => b.mtime - a.mtime)
    } catch {
      // No .theokit/agents/ yet — empty list
      entries = []
    }
    return { conversations: entries }
  },
})
