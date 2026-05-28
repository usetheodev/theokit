import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T3.1 — chat.ts shape assertions. Heavier behavioural tests run in
 * Playwright (Phase 5).
 */

const CHAT = resolve(__dirname, '../../examples/full-stack-agent/server/routes/chat.ts')
const src = readFileSync(CHAT, 'utf-8')
// Strip block + line comments before checking for code-level patterns.
// JSDoc and `//` comments may mention things like `agent.dispose()` or
// `buildTools(...)` that are NOT executable; tests must only see code.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n')

describe('examples/full-stack-agent/server/routes/chat.ts', () => {
  it('imports defineAgentEndpoint + createConversationHistory + streamAgentRun', () => {
    expect(src).toMatch(/defineAgentEndpoint/)
    expect(src).toMatch(/createConversationHistory/)
    expect(src).toMatch(/streamAgentRun/)
    expect(src).toMatch(/from\s+['"]theokit\/server['"]/)
  })

  it('imports buildTools from ../tools/index.js', () => {
    expect(src).toMatch(/import\s+\{\s*buildTools\s*\}\s+from\s+['"]\.\.\/tools/)
  })

  it('probes conversationId BEFORE buildTools', () => {
    const probeIdx = code.indexOf('probedId =')
    const buildIdx = code.indexOf('buildTools(')
    expect(probeIdx).toBeGreaterThan(-1)
    expect(buildIdx).toBeGreaterThan(probeIdx)
  })

  it('passes cookieHeaders to createConversationHistory', () => {
    expect(src).toMatch(/createConversationHistory\([\s\S]*cookieHeaders/m)
  })

  it('passes agentId: probedId override', () => {
    expect(src).toMatch(/agentId:\s*probedId/)
  })

  it('EC-5 — asserts conversationId === probedId', () => {
    expect(src).toMatch(/conversationId\s*!==\s*probedId/)
    expect(src).toMatch(/throw new Error\([^)]*createConversationHistory ignored/)
  })

  it('does NOT call agent.dispose() (continuity by design)', () => {
    expect(code).not.toMatch(/agent\.dispose\(/)
  })

  it('supports both OPENROUTER and ANTHROPIC env keys', () => {
    expect(src).toMatch(/OPENROUTER_API_KEY/)
    expect(src).toMatch(/ANTHROPIC_API_KEY/)
  })
})
