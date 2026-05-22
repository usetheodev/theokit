import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TEMPLATE_ROOT = resolve(__dirname, '../../packages/create-theo/templates/default')

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

  it('app/page.tsx uses ChatThread + ChatMessage + ChatComposer (conversation surface)', () => {
    // Post-2026-05-18 redesign: scaffold uses a proper chat surface with
    // ChatThread/ChatMessage/ChatComposer rather than the lower-level
    // AgentComposer + AgentTimeline pair, so a fresh `create-theokit my-app`
    // looks like a real product on first load.
    const page = read('app/page.tsx')
    expect(page).toContain('ChatThread')
    expect(page).toContain('ChatMessage')
    expect(page).toContain('ChatComposer')
  })

  it('app/page.tsx uses ToolCallCard for tool invocations', () => {
    const page = read('app/page.tsx')
    expect(page).toContain('ToolCallCard')
  })

  it('app/page.tsx uses AgentStreaming as the streaming indicator', () => {
    const page = read('app/page.tsx')
    expect(page).toContain('AgentStreaming')
  })

  it('app/page.tsx uses EmptyState for first-load (no messages yet)', () => {
    const page = read('app/page.tsx')
    expect(page).toContain('EmptyState')
  })

  it('app/page.tsx wires the full TheoUI agent product set (Avatar, ContextWindowBar, CommandPalette, Tooltip)', () => {
    // The default scaffold should look like an agent product on first load,
    // not a minimal chat box. These six components are the "agent shell"
    // signal — together they say: this is the home for your agent, not a
    // starting point you'll have to decorate yourself.
    const page = read('app/page.tsx')
    expect(page).toContain('Avatar')
    expect(page).toContain('ContextWindowBar')
    expect(page).toContain('CommandPalette')
    expect(page).toContain('Tooltip')
  })

  it('app/page.tsx wires ⌘K keyboard shortcut for CommandPalette', () => {
    const page = read('app/page.tsx')
    // Regression: keep the cmd/ctrl+K opener so the palette is discoverable.
    expect(page).toMatch(/metaKey|ctrlKey/)
    expect(page).toMatch(/'k'/)
  })

  it('app/layout.tsx wires CostMeter + Badge + Tooltip from TheoUI', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toContain('CostMeter')
    expect(layout).toContain('Badge')
    expect(layout).toContain('Tooltip')
  })

  it('app/layout.tsx declares an AgentProfile descriptor with badge + tone', () => {
    // The scaffold should ship an example descriptor so the AgentProfile
    // dropdown is non-empty out of the box — otherwise it just renders a
    // placeholder face.
    const layout = read('app/layout.tsx')
    expect(layout).toMatch(/AgentProfileDescriptor/)
    expect(layout).toMatch(/badge:\s*['"`]/)
    expect(layout).toMatch(/tone:\s*['"`]/)
  })

  it('app/page.tsx imports from @usetheo/ui (not local stub)', () => {
    const page = read('app/page.tsx')
    expect(page).toMatch(/from ['"]@usetheo\/ui['"]/)
  })

  it('app/page.tsx is a Client Component ("use client" directive)', () => {
    const page = read('app/page.tsx')
    expect(page.trim().startsWith("'use client'") || page.trim().startsWith('"use client"')).toBe(
      true,
    )
  })

  it('T1.2: page.tsx uses useAgentStream hook', () => {
    const page = read('app/page.tsx')
    expect(page).toMatch(/useAgentStream/)
    expect(page).toMatch(/from ['"]theokit\/client['"]/)
  })

  it('T1.2: page.tsx does NOT manually parse SSE (no getReader / TextDecoder)', () => {
    const page = read('app/page.tsx')
    expect(page).not.toMatch(/getReader\(\)/)
    expect(page).not.toMatch(/new TextDecoder/)
  })

  it('T1.2: page.tsx maps runtime AgentEvent to chat items', () => {
    const page = read('app/page.tsx')
    // The page must transform runtime events into visual items
    expect(page).toMatch(/events\.map|events\s*\.\s*map/)
  })

  it('server/routes/chat.ts exists and exports POST handler', () => {
    const chat = read('server/routes/chat.ts')
    expect(chat).toContain("from 'theokit/server'")
    expect(chat).toMatch(/export const POST/)
  })

  it('server/routes/chat.ts has clear documentation as the canonical agent endpoint (EC-11, updated for item #3)', () => {
    // Updated 2026-05-22 (item #3): chat.ts is no longer a mock with
    // "replace with X" comments — it's the canonical SDK wiring. Comment now
    // explains the SDK-shaped contract (Agent.prompt, throwOnError, providers).
    const chat = read('server/routes/chat.ts')
    expect(chat).toMatch(/agent|@usetheo\/sdk|Agent\.prompt|throwOnError/i)
  })

  it('T1.1: chat.ts uses defineAgentEndpoint helper (not manual SSE)', () => {
    const chat = read('server/routes/chat.ts')
    expect(chat).toMatch(/defineAgentEndpoint/)
  })

  it('T1.1: chat.ts does NOT manually build a Response with text/event-stream', () => {
    const chat = read('server/routes/chat.ts')
    // Helper handles the response shape now — no manual construction
    expect(chat).not.toMatch(/new Response\([^)]*text\/event-stream/s)
    expect(chat).not.toMatch(/'Content-Type':\s*'text\/event-stream'/)
  })

  it('T1.1: chat.ts handler is an async generator yielding AgentEvent', () => {
    const chat = read('server/routes/chat.ts')
    expect(chat).toMatch(/async\s*\*\s*handler/)
    expect(chat).toMatch(/yield\s*\{\s*type:/)
  })

  it('regression — chat.ts does NOT call request.json() (smoke 2026-05-18)', () => {
    // Live demo failure 2026-05-18: handler called `await request.json()` but
    // `request` is the underlying Node IncomingMessage (no `.json` method).
    // The framework already parses the body via `parseRequestBody` and passes
    // it as `body` — handlers must use the `body` parameter, not request.json().
    //
    // Match call sites only (skip doc-comment lines starting with ` *`) so the
    // educational "use body instead of request.json()" note in the template
    // header is not flagged as a regression.
    const chat = read('server/routes/chat.ts')
    const callSiteLines = chat
      .split('\n')
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join('\n')
    expect(callSiteLines).not.toMatch(/request\.json\s*\(/)
  })

  it('regression — chat.ts uses the framework-parsed body parameter', () => {
    const chat = read('server/routes/chat.ts')
    // Handler destructures or uses body from the context object
    expect(chat).toMatch(/handler\s*\(\s*\{[^}]*\bbody\b/)
  })

  it('layout.tsx does not manually wrap ThemeProvider (auto-injected via entry-client)', () => {
    const layout = read('app/layout.tsx')
    expect(layout).not.toContain('TheoUIProvider')
    // ThemeProvider is fine to mention only if not as a JSX wrapper — exclude
    // the JSX-call form `<ThemeProvider`.
    expect(layout).not.toMatch(/<ThemeProvider/)
  })

  it('layout.tsx uses TopNav + Sidebar app shell from TheoUI', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toContain('TopNav')
    expect(layout).toContain('Sidebar')
  })

  it('layout.tsx calls <Outlet /> from react-router (regression — black page bug)', () => {
    // Live demo failure 2026-05-18: layout returned `{children}` (Next.js
    // convention) but the router-generated manifest passes children via
    // <Outlet />. The generator now wraps with `children: <Outlet />`, but
    // the canonical layout in the template should still import Outlet
    // directly so it works regardless of router-side wiring.
    const layout = read('app/layout.tsx')
    expect(layout).toMatch(/import\s*\{[^}]*\bOutlet\b/)
    expect(layout).toMatch(/<Outlet/)
  })

  it('zero-config: template DOES NOT ship tailwind.config.ts or postcss.config.js (Phase 3 / @usetheo/ui ^0.5)', () => {
    expect(() => read('tailwind.config.ts')).toThrow()
    expect(() => read('postcss.config.js')).toThrow()
  })

  it('layout imports @usetheo/ui/styles.css (Tailwind v4 entry — pre-bundled by @usetheo/ui)', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toMatch(/import\s+['"]@usetheo\/ui\/styles\.css['"]/)
  })

  it('package.json.tmpl declares tailwindcss@^4 + @tailwindcss/vite (v4 zero-config) + lucide-react', () => {
    const pkg = read('package.json.tmpl')
    expect(pkg).toMatch(/"tailwindcss":\s*"\^4/)
    expect(pkg).toMatch(/"@tailwindcss\/vite":\s*"\^4/)
    expect(pkg).toMatch(/"lucide-react"/)
    // v3 toolchain removed — TheoKit's vite-plugin auto-chains v4 + UI plugin
    expect(pkg).not.toMatch(/"postcss":/)
    expect(pkg).not.toMatch(/"autoprefixer":/)
    expect(pkg).not.toMatch(/"tailwindcss-animate":/)
  })
})
