import { describe, it, expect } from 'vitest'
import { generateEntryClient } from '../../packages/theo/src/router/entry.js'
import { generateEntryServer } from '../../packages/theo/src/router/entry-server.js'

/**
 * Regression for nextjs-maturity T1.4.
 *
 * Original bug (previous session): entry-server emitted
 *   `React.createElement(StaticRouterProvider, { router, context })`
 * directly, while entry-client wrapped its RouterProvider in
 *   `TheoUIProvider > Suspense > RouterProvider`.
 *
 * Trees diverged → React detected hydration mismatch → silently fell back
 * to client-only render → every onClick handler attached during hydration
 * was lost.
 *
 * These tests pin the wrap sequence so the trees stay structurally
 * identical (only the leaf component — Static vs Browser router — may
 * differ, which is correct).
 */

/**
 * Walk a generated entry-{server|client} string and extract the sequence
 * of React.createElement(NAME) wrappers from outermost to innermost.
 * Stops at the router leaf.
 */
function extractWrapSequence(generatedJs: string): string[] {
  // Match patterns like `React.createElement(Name, { … }`
  const calls = [...generatedJs.matchAll(/React\.createElement\(\s*([A-Za-z]+)/g)]
  return calls.map((m) => m[1]!)
}

describe('T1.4 — SSR and CSR React trees mirror each other', () => {
  it('with theoUi enabled: server tree wraps StaticRouterProvider in TheoUIProvider + Suspense', () => {
    const server = generateEntryServer({ theoUi: { theme: 'violet-forge' } })
    const seq = extractWrapSequence(server)
    expect(seq[0]).toBe('TheoUIProvider')
    expect(seq[1]).toBe('Suspense')
    expect(seq[2]).toBe('StaticRouterProvider')
  })

  it('with theoUi enabled: client tree wraps RouterProvider in TheoUIProvider + Suspense', () => {
    const client = generateEntryClient(true, { theoUi: { theme: 'violet-forge' } })
    const seq = extractWrapSequence(client)
    expect(seq[0]).toBe('TheoUIProvider')
    expect(seq[1]).toBe('Suspense')
    expect(seq[2]).toBe('RouterProvider')
  })

  it('with theoUi enabled: only the leaf component differs (StaticRouterProvider vs RouterProvider)', () => {
    const server = extractWrapSequence(
      generateEntryServer({ theoUi: { theme: 'noir' } }),
    )
    const client = extractWrapSequence(
      generateEntryClient(true, { theoUi: { theme: 'noir' } }),
    )
    // Strip the leaf, compare wrappers
    expect(server.slice(0, -1)).toEqual(client.slice(0, -1))
    expect(server[server.length - 1]).toBe('StaticRouterProvider')
    expect(client[client.length - 1]).toBe('RouterProvider')
  })

  it('theme value is consistent between server and client outputs', () => {
    const server = generateEntryServer({ theoUi: { theme: 'paper' } })
    const client = generateEntryClient(true, { theoUi: { theme: 'paper' } })
    expect(server).toContain("'paper'")
    expect(client).toContain("'paper'")
  })

  it('with theoUi disabled: both trees start with Suspense (no TheoUIProvider)', () => {
    const server = extractWrapSequence(generateEntryServer())
    const client = extractWrapSequence(generateEntryClient(true))
    expect(server).not.toContain('TheoUIProvider')
    expect(client).not.toContain('TheoUIProvider')
    expect(server[0]).toBe('Suspense')
    expect(client[0]).toBe('Suspense')
  })
})
