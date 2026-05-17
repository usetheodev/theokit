import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TEMPLATE_ROOT = resolve(
  __dirname,
  '../../packages/create-theo/templates/default',
)

function read(rel: string): string {
  return readFileSync(resolve(TEMPLATE_ROOT, rel), 'utf-8')
}

describe('create-theokit default template — agent surface (T3.1)', () => {
  it('package.json.tmpl includes @usetheo/ui in dependencies', () => {
    const pkg = read('package.json.tmpl')
    expect(pkg).toMatch(/"@usetheo\/ui"/)
  })

  it('package.json.tmpl declares theokit peer dependencies (regression — smoke real)', () => {
    // Bug found by `pnpm dlx create-theokit@0.1.0-alpha.3 my-real-test` smoke:
    // theokit declares react-router and zod as peer deps, but the template
    // forgot to declare them, breaking dev server on first start.
    const pkg = read('package.json.tmpl')
    expect(pkg).toMatch(/"react-router"/)
    expect(pkg).toMatch(/"zod"/)
  })

  it('package.json.tmpl includes react + react-dom (UI runtime)', () => {
    const pkg = read('package.json.tmpl')
    expect(pkg).toMatch(/"react"/)
    expect(pkg).toMatch(/"react-dom"/)
  })

  it('app/page.tsx uses AgentComposer + AgentTimeline', () => {
    const page = read('app/page.tsx')
    expect(page).toContain('AgentComposer')
    expect(page).toContain('AgentTimeline')
  })

  it('app/page.tsx imports from @usetheo/ui (not local stub)', () => {
    const page = read('app/page.tsx')
    expect(page).toMatch(/from ['"]@usetheo\/ui['"]/)
  })

  it('app/page.tsx is a Client Component ("use client" directive)', () => {
    const page = read('app/page.tsx')
    expect(page.trim().startsWith("'use client'") || page.trim().startsWith('"use client"')).toBe(true)
  })

  it('server/routes/chat.ts exists and exports POST handler', () => {
    const chat = read('server/routes/chat.ts')
    expect(chat).toContain("from 'theokit/server'")
    expect(chat).toMatch(/export const POST/)
  })

  it('server/routes/chat.ts has clear "replace with real LLM" comment (EC-11)', () => {
    const chat = read('server/routes/chat.ts')
    expect(chat).toMatch(/replace|substitua|TODO|LLM/i)
  })

  it('chat endpoint produces SSE-formatted response', () => {
    const chat = read('server/routes/chat.ts')
    // Expect mock to emit text/event-stream
    expect(chat).toMatch(/text\/event-stream|data: /)
  })

  it('layout.tsx remains minimal (ThemeProvider comes from entry-client)', () => {
    const layout = read('app/layout.tsx')
    // Layout should NOT manually wrap ThemeProvider — that comes from the
    // entry-client auto-wire.
    expect(layout).not.toContain('ThemeProvider')
    expect(layout).not.toContain('TheoUIProvider')
  })
})
