import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/define-channel')

function read(rel: string): string {
  return readFileSync(resolve(FIXTURE, rel), 'utf-8')
}

describe('T2.1 — define-channel fixture', () => {
  it('fixture exists with package.json', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
  })

  it('channel module uses defineChannel from theokit/server', () => {
    const src = read('server/channels/notifications.ts')
    // The test scans a fixture's source file (a few hundred bytes). The
    // import-pattern regex has bounded character classes; backtracking
    // cannot escalate at this input size.
    expect(src).toMatch(/import\s*\{[^}]*defineChannel[^}]*\}\s*from\s*['"]theokit\/server['"]/)
    // matches `defineChannel(`, `defineChannel<T>(`, `defineChannel<T,U>(` …
    // eslint-disable-next-line security/detect-unsafe-regex -- bounded input + non-overlapping quantifiers
    expect(src).toMatch(/defineChannel\s*(?:<[^>]+>)?\s*\(/)
  })

  it('channel handler implements onSubscribe + onMessage', () => {
    const src = read('server/channels/notifications.ts')
    expect(src).toMatch(/onSubscribe/)
    expect(src).toMatch(/onMessage/)
  })

  it('app/page.tsx connects to the channel via browser WebSocket', () => {
    const src = read('app/page.tsx')
    expect(src).toMatch(/new\s+WebSocket\(/)
  })

  it('README documents the channel pub/sub pattern', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/channel|room|defineChannel/i)
  })
})
