import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve(__dirname, '../../packages/theo/src')

/**
 * T6.5 — Dead code audit decisions.
 *
 * The architecture-review report flagged 5 candidates for deletion:
 *   PV-14 — asSsrRenderResult YAGNI
 *   PV-15 — inline OCP predicates
 *   PV-16 — AuthRequiredError DIP (type-only import suggestion)
 *   PF-11 — define-route identity helpers
 *   PF-17 — serialization.ts (likely dead post-transformer)
 *
 * After investigation, ALL 5 are kept with documented rationale.
 * This test pins the rationale in code so future audits don't re-flag.
 */
describe('dead-code audit decisions (T6.5)', () => {
  it('PV-14: asSsrRenderResult is referenced in start.ts (active type helper, not dead)', () => {
    const start = readFileSync(resolve(SRC, 'cli/commands/start.ts'), 'utf8')
    expect(start).toMatch(/function asSsrRenderResult/)
    // Must have at least 1 caller (otherwise it WOULD be dead)
    const callerMatches = start.match(/asSsrRenderResult\(/g) ?? []
    expect(callerMatches.length).toBeGreaterThanOrEqual(2) // declaration + ≥1 call
  })

  it('PV-16: AuthRequiredError import is runtime (instanceof requires class identity)', () => {
    const exec = readFileSync(resolve(SRC, 'server/http/execute.ts'), 'utf8')
    // Must NOT be `import type { AuthRequiredError }` — runtime class needed
    expect(exec).toMatch(/^import\s+{\s*AuthRequiredError\s*}/m)
    expect(exec).not.toMatch(/^import\s+type\s+{\s*AuthRequiredError\s*}/m)
    // Confirm instanceof check still exists
    expect(exec).toMatch(/err instanceof AuthRequiredError/)
  })

  it('PF-11: define-route identity helpers are 4-line minimal (preserved per Phase 4)', () => {
    const def = readFileSync(resolve(SRC, 'server/define/define-route.ts'), 'utf8')
    expect(def).toMatch(/export function defineRoute/)
    // Should be a simple identity-style helper, no factory pattern
    expect(def).not.toMatch(/class.*Factory|new.*Builder/)
  })

  it('PF-17: serialization.ts is part of public API (exported from theokit/server)', () => {
    expect(existsSync(resolve(SRC, 'server/serialization.ts'))).toBe(true)
    const serverIndex = readFileSync(resolve(SRC, 'server/index.ts'), 'utf8')
    expect(serverIndex).toMatch(/serializeResponse/)
    expect(serverIndex).toMatch(/deserializeResponse/)
  })

  it('PV-15: cache route predicates are documented in docs/concepts/caching.md', () => {
    const docs = readFileSync(resolve(__dirname, '../../docs/concepts/caching.md'), 'utf8')
    // Document mentions the cacheability checks (Set-Cookie, errors, SSE, etc.)
    expect(docs).toMatch(/Set-Cookie/)
    expect(docs).toMatch(/cacheErrors/)
  })
})
