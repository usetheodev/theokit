/**
 * T10.1 — `docs/concepts/conversation-history.md` integrity tests.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(__dirname, '../..')
const DOC = resolve(REPO, 'docs/concepts/conversation-history.md')

describe('docs/concepts/conversation-history.md (T10.1)', () => {
  it('test_docs_concepts_conversation_history_exists', () => {
    expect(existsSync(DOC)).toBe(true)
    const content = readFileSync(DOC, 'utf8')
    // min 100 lines (real concept doc; not a stub)
    expect(content.split('\n').length).toBeGreaterThanOrEqual(100)
  })

  it('test_docs_mentions_three_adapters_at_minimum', () => {
    const content = readFileSync(DOC, 'utf8')
    expect(content).toMatch(/FileSystemConversationStorage/)
    expect(content).toMatch(/InMemoryConversationStorage/)
    expect(content).toMatch(/PostgresConversationStorage/)
    expect(content).toMatch(/RedisConversationStorage/)
  })

  it('test_docs_links_to_fixtures', () => {
    const content = readFileSync(DOC, 'utf8')
    expect(content).toMatch(/tests\/fixtures\/conversation-postgres/)
    expect(content).toMatch(/tests\/fixtures\/conversation-redis/)
  })

  it('test_docs_has_deploy_target_matrix', () => {
    const content = readFileSync(DOC, 'utf8')
    expect(content).toMatch(/Deploy.target/i)
    expect(content).toMatch(/TheoCloud/i)
    expect(content).toMatch(/Vercel/i)
    expect(content).toMatch(/Cloudflare/i)
  })

  it('test_docs_references_ec_2_ec_11_ec_12', () => {
    const content = readFileSync(DOC, 'utf8')
    expect(content).toMatch(/EC-2/)
    expect(content).toMatch(/EC-11/)
    expect(content).toMatch(/EC-12/)
  })

  it('test_docs_cross_links_resolve', () => {
    const content = readFileSync(DOC, 'utf8')
    // Each linked file must exist
    const planPath = resolve(REPO, 'docs/plans/sdk-1-1-0-consumption-plan.md')
    expect(existsSync(planPath)).toBe(true)
    const pgRecipe = resolve(REPO, 'tests/fixtures/conversation-postgres/storage.ts')
    expect(existsSync(pgRecipe)).toBe(true)
    const redisRecipe = resolve(REPO, 'tests/fixtures/conversation-redis/storage.ts')
    expect(existsSync(redisRecipe)).toBe(true)
    expect(content).toMatch(/docs\/plans\/sdk-1-1-0-consumption-plan\.md/)
  })
})
