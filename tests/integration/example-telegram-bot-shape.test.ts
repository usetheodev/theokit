import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T4.1 — Telegram bot shape assertions.
 *
 * Real bot needs BotFather + Telegram polling; that's manual-smoke territory.
 * These tests pin the structural contract: imports, agentId scheme, env-key
 * preference, sentinels.
 */

const BOT = resolve(__dirname, '../../examples/full-stack-agent/server/telegram-bot.ts')
const src = readFileSync(BOT, 'utf-8')
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n')

describe('examples/full-stack-agent/server/telegram-bot.ts', () => {
  it('imports Agent from @usetheo/sdk', () => {
    expect(src).toMatch(/import\s+\{\s*Agent\s*\}\s+from\s+['"]@usetheo\/sdk['"]/)
  })

  it('imports GatewayRunner from @usetheo/gateway', () => {
    expect(src).toMatch(/import\s+\{\s*GatewayRunner\s*\}\s+from\s+['"]@usetheo\/gateway['"]/)
  })

  it('imports TelegramAdapter from @usetheo/gateway-telegram', () => {
    expect(src).toMatch(/TelegramAdapter\s*\}\s+from\s+['"]@usetheo\/gateway-telegram['"]/)
  })

  it('imports buildTools from ./tools/index.js', () => {
    expect(src).toMatch(/import\s+\{\s*buildTools\s*\}\s+from\s+['"]\.\/tools/)
  })

  it('exits when TELEGRAM_BOT_TOKEN is missing', () => {
    expect(code).toMatch(/process\.exit\(1\)/)
    expect(code).toMatch(/TELEGRAM_BOT_TOKEN/)
  })

  it('uses `tg-` prefix for agentId (channel namespacing)', () => {
    expect(code).toMatch(/agentId\s*=\s*`tg-/)
  })

  it('prefers OPENROUTER_API_KEY over ANTHROPIC_API_KEY', () => {
    // Order in resolveProvider: orKey first then anKey
    const or = code.indexOf('OPENROUTER_API_KEY')
    const an = code.indexOf('ANTHROPIC_API_KEY')
    expect(or).toBeGreaterThan(-1)
    expect(an).toBeGreaterThan(-1)
    expect(or).toBeLessThan(an)
  })

  it('uses Agent.getOrCreate (not Agent.create)', () => {
    expect(code).toMatch(/Agent\.getOrCreate\(/)
    expect(code).not.toMatch(/Agent\.create\(/)
  })

  it('passes buildTools(agentId) to Agent.getOrCreate', () => {
    expect(code).toMatch(/tools:\s*buildTools\(agentId\)/)
  })

  it('calls await runner.start()', () => {
    expect(code).toMatch(/await runner\.start\(\)/)
  })
})
