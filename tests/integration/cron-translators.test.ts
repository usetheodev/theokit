import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  translateCronToAws,
  translateCronToCloudflare,
  translateCronToDeno,
  translateCronToVercel,
  ExistingConfigUnparseableError,
} from '../../packages/theo/src/server/cron/adapter-translators.js'
import type { CronManifestEntry } from '../../packages/theo/src/server/cron/cron-manifest.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'theokit-cron-trans-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const cron = (name: string, schedule: string): CronManifestEntry => ({
  name,
  filePath: `server/crons/${name}.ts`,
  schedule,
  concurrency: 'forbid',
})

// ──────────────────────── Vercel ────────────────────────

describe('Vercel cron translator (T1.5 + EC-105)', () => {
  it('emits crons[] in vercel.json when file does not exist', () => {
    const vercelJson = join(root, 'vercel.json')
    translateCronToVercel(vercelJson, [cron('foo', '0 9 * * *')])
    const json = JSON.parse(readFileSync(vercelJson, 'utf8')) as Record<string, unknown>
    const crons = json.crons as Array<{ path: string; schedule: string }>
    expect(crons.length).toBe(1)
    expect(crons[0].path).toBe('/api/__crons/foo')
    expect(crons[0].schedule).toBe('0 9 * * *')
  })

  it('preserves existing fields (functions, headers, redirects) when merging', () => {
    const vercelJson = join(root, 'vercel.json')
    writeFileSync(
      vercelJson,
      JSON.stringify({
        functions: { 'api/x.ts': { maxDuration: 30 } },
        headers: [{ source: '/(.*)', headers: [{ key: 'X-Foo', value: 'bar' }] }],
        redirects: [{ source: '/old', destination: '/new', permanent: true }],
      }),
    )
    translateCronToVercel(vercelJson, [cron('a', '0 1 * * *')])
    const after = JSON.parse(readFileSync(vercelJson, 'utf8')) as Record<string, unknown>
    expect(after.functions).toEqual({ 'api/x.ts': { maxDuration: 30 } })
    expect(after.headers).toBeDefined()
    expect(after.redirects).toBeDefined()
    expect(after.crons).toBeDefined()
  })

  it('overwrites existing crons[] (managed slice)', () => {
    const vercelJson = join(root, 'vercel.json')
    writeFileSync(
      vercelJson,
      JSON.stringify({
        crons: [{ path: '/api/stale', schedule: '* * * * *' }],
      }),
    )
    translateCronToVercel(vercelJson, [cron('new', '0 0 * * *')])
    const after = JSON.parse(readFileSync(vercelJson, 'utf8')) as { crons: Array<{ path: string }> }
    expect(after.crons.length).toBe(1)
    expect(after.crons[0].path).toBe('/api/__crons/new')
  })

  it('throws ExistingConfigUnparseableError on garbage JSON', () => {
    const vercelJson = join(root, 'vercel.json')
    writeFileSync(vercelJson, '{ not valid json')
    expect(() => translateCronToVercel(vercelJson, [])).toThrow(ExistingConfigUnparseableError)
  })

  it('emits empty crons[] when input is empty', () => {
    const vercelJson = join(root, 'vercel.json')
    translateCronToVercel(vercelJson, [])
    const after = JSON.parse(readFileSync(vercelJson, 'utf8')) as { crons: unknown[] }
    expect(after.crons).toEqual([])
  })
})

// ──────────────────────── Cloudflare ────────────────────────

describe('Cloudflare cron translator (T1.5 + EC-105)', () => {
  it('emits [triggers] crons array when file does not exist', () => {
    const wrangler = join(root, 'wrangler.toml')
    translateCronToCloudflare(wrangler, [cron('foo', '0 9 * * *'), cron('bar', '*/15 * * * *')])
    const content = readFileSync(wrangler, 'utf8')
    expect(content).toMatch(/\[triggers\]/)
    expect(content).toMatch(/crons\s*=\s*\["0 9 \* \* \*", "\*\/15 \* \* \* \*"\]/)
  })

  it('preserves existing top-level config (name, main, compatibility_date)', () => {
    const wrangler = join(root, 'wrangler.toml')
    writeFileSync(
      wrangler,
      `name = "my-worker"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[vars]
FOO = "bar"
`,
    )
    translateCronToCloudflare(wrangler, [cron('a', '0 1 * * *')])
    const content = readFileSync(wrangler, 'utf8')
    expect(content).toContain('name = "my-worker"')
    expect(content).toContain('main = "src/index.ts"')
    expect(content).toContain('compatibility_date = "2026-01-01"')
    expect(content).toContain('[vars]')
    expect(content).toContain('FOO = "bar"')
    expect(content).toContain('[triggers]')
  })

  it('replaces existing [triggers] crons line in-place', () => {
    const wrangler = join(root, 'wrangler.toml')
    writeFileSync(
      wrangler,
      `name = "w"

[triggers]
crons = ["* * * * *"]
`,
    )
    translateCronToCloudflare(wrangler, [cron('new', '0 0 * * *')])
    const content = readFileSync(wrangler, 'utf8')
    expect(content).toContain('crons = ["0 0 * * *"]')
    // Old schedule replaced — should not appear as a managed cron value
    expect(content.match(/crons\s*=/g)?.length).toBe(1)
  })
})

// ──────────────────────── AWS Lambda ────────────────────────

describe('AWS Lambda cron translator (T1.5 + EC-105)', () => {
  it('inserts ? in DOW when DOM is *', () => {
    const yml = join(root, 'serverless.yml')
    translateCronToAws(yml, [cron('foo', '0 9 * * *')])
    const content = readFileSync(yml, 'utf8')
    expect(content).toContain('cron(0 9 * * ? *)')
  })

  it('inserts ? in DOM when DOW is specific', () => {
    const yml = join(root, 'serverless.yml')
    translateCronToAws(yml, [cron('foo', '0 9 * * MON')])
    const content = readFileSync(yml, 'utf8')
    expect(content).toContain('cron(0 9 ? * MON *)')
  })

  it('preserves existing service + provider config', () => {
    const yml = join(root, 'serverless.yml')
    writeFileSync(
      yml,
      `service: my-app
provider:
  name: aws
  runtime: nodejs22.x

functions:
  userAuth:
    handler: src/auth.handler
`,
    )
    translateCronToAws(yml, [cron('daily', '0 0 * * *')])
    const content = readFileSync(yml, 'utf8')
    expect(content).toContain('service: my-app')
    expect(content).toContain('userAuth:')
    expect(content).toContain('handler: src/auth.handler')
    expect(content).toContain('cron(0 0 * * ? *)')
  })
})

// ──────────────────────── Deno Deploy ────────────────────────

describe('Deno Deploy cron translator (T1.5)', () => {
  it('emits Deno.cron registrations', () => {
    const entry = join(root, 'crons-entry.ts')
    translateCronToDeno(entry, [cron('morning', '0 9 * * *'), cron('hourly', '0 * * * *')])
    const content = readFileSync(entry, 'utf8')
    expect(content).toMatch(/Deno\.cron\("morning",\s*"0 9 \* \* \*"/)
    expect(content).toMatch(/Deno\.cron\("hourly",\s*"0 \* \* \* \*"/)
  })

  it('overwrites existing entry file (managed file)', () => {
    const entry = join(root, 'crons-entry.ts')
    writeFileSync(entry, '// stale content')
    translateCronToDeno(entry, [cron('fresh', '* * * * *')])
    const content = readFileSync(entry, 'utf8')
    expect(content).not.toContain('stale')
    expect(content).toContain('fresh')
  })
})
