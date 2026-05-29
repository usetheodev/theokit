import { defineCron } from 'theokit/server/cron'
import { readdir, stat, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * Daily GC of stale conversation transcripts.
 *
 * The `@usetheo/sdk` Agent persists chat history under
 * `.theokit/agents/<agentId>/messages.jsonl`. With no TTL the directory
 * grows unbounded — production foot-gun. This cron removes any agent
 * directory whose `messages.jsonl` hasn't been touched in 30 days.
 */
const MAX_AGE_DAYS = 30
const AGENTS_DIR = '.theokit/agents'

export default defineCron('cleanup-conversations', {
  schedule: '0 4 * * *', // Daily 04:00 UTC
  handler: async ({ log }) => {
    const root = resolve(process.cwd(), AGENTS_DIR)
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    let removed = 0
    let kept = 0
    let entries: Awaited<ReturnType<typeof readdir>>
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch {
      log.info({ msg: 'No agents dir yet — first run', dir: root })
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const agentDir = join(root, entry.name)
      const messagesFile = join(agentDir, 'messages.jsonl')
      try {
        const s = await stat(messagesFile)
        if (s.mtimeMs < cutoff) {
          await rm(agentDir, { recursive: true, force: true })
          removed++
        } else {
          kept++
        }
      } catch {
        // messages.jsonl missing → orphan dir, remove
        await rm(agentDir, { recursive: true, force: true }).catch(() => {})
        removed++
      }
    }
    log.info({ msg: 'cleanup-conversations complete', removed, kept, maxAgeDays: MAX_AGE_DAYS })
  },
})
