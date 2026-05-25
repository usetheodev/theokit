/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time atomic write: caller-controlled paths only. No HTTP input
 * reaches these fs calls.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Write `content` to `path` atomically via the tmp + rename pattern.
 *
 * Two concurrent calls to `writeAtomic(path, ...)` are guaranteed to
 * leave `path` containing valid content from ONE of the calls (never
 * truncated, never interleaved). POSIX rename is atomic on the same
 * filesystem.
 *
 * EC-106 (jobs-crons-webhooks-cost-tracking-plan) — shared helper for
 * `.theo/crons.json` and `.theo/jobs.json` manifest writes so a
 * concurrent dev-server scan + build manifest emit never produces
 * partial JSON.
 *
 * @param path  destination path
 * @param content  bytes (UTF-8 string) to write
 */
export function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  // Include a random suffix so two concurrent writes don't trample each
  // other's tmp file. crypto.randomBytes is non-blocking + collision-safe
  // for the tiny entropy we need (8 hex chars = 32 bits).
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, path)
}
