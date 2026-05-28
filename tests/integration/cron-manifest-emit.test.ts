import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  CRON_MANIFEST_SCHEMA_VERSION,
  writeCronManifest,
} from '../../packages/theo/src/server/cron/cron-manifest.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'theokit-cron-manifest-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('cron-manifest (T1.3 + EC-106)', () => {
  it('emits schemaVersion=1 + correct shape', () => {
    const path = join(root, 'crons.json')
    writeCronManifest(path, [
      {
        name: 'morning',
        filePath: 'server/crons/morning.ts',
        schedule: '0 9 * * *',
        concurrency: 'forbid',
      },
    ])
    const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(json.schemaVersion).toBe(1)
    expect(typeof json.generatedAt).toBe('string')
    expect(Array.isArray(json.crons)).toBe(true)
    expect(json.crons).toEqual([
      {
        name: 'morning',
        filePath: 'server/crons/morning.ts',
        schedule: '0 9 * * *',
        concurrency: 'forbid',
      },
    ])
  })

  it('CRON_MANIFEST_SCHEMA_VERSION pinned to 1', () => {
    expect(CRON_MANIFEST_SCHEMA_VERSION).toBe(1)
  })

  it('writes empty crons array for no crons', () => {
    const path = join(root, 'crons.json')
    writeCronManifest(path, [])
    const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(json.crons).toEqual([])
  })

  // EC-106 — atomic write under concurrency
  it('produces valid JSON under 5 concurrent writes (atomic via tmp + rename)', async () => {
    const path = join(root, 'crons.json')
    const writes = Array.from({ length: 5 }, (_, i) =>
      Promise.resolve().then(() =>
        writeCronManifest(path, [
          {
            name: `cron-${i}`,
            filePath: `c${i}.ts`,
            schedule: '* * * * *',
            concurrency: 'forbid',
          },
        ]),
      ),
    )
    await Promise.all(writes)
    // File MUST always be valid JSON (never truncated, never interleaved).
    const content = readFileSync(path, 'utf8')
    const json = JSON.parse(content) as Record<string, unknown>
    expect(json.schemaVersion).toBe(1)
    expect(Array.isArray(json.crons)).toBe(true)
  })

  it('rejects mid-flight write does not leave partial file', () => {
    const path = join(root, 'crons.json')
    // Write valid first
    writeCronManifest(path, [
      { name: 'a', filePath: 'a.ts', schedule: '* * * * *', concurrency: 'forbid' },
    ])
    const before = readFileSync(path, 'utf8')
    expect(() => JSON.parse(before)).not.toThrow()
    // Pre-existing dummy file with garbage — overwrite atomically
    writeFileSync(path, 'garbage-not-json')
    writeCronManifest(path, [
      { name: 'b', filePath: 'b.ts', schedule: '* * * * *', concurrency: 'allow' },
    ])
    const after = readFileSync(path, 'utf8')
    expect(() => JSON.parse(after)).not.toThrow()
    expect(JSON.parse(after).crons[0].name).toBe('b')
  })
})
