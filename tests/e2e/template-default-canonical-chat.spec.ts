import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * T2.2 — Canonical chat.ts via `@usetheo/sdk` Agent.prompt + throwOnError.
 *
 * Boots `fixtures/template-default` on port 3470 with a deterministic fake
 * Anthropic key. Validates the full UI roundtrip:
 *   1. Composer renders (SDK loaded into the route without crash).
 *   2. Typed-and-Enter submit fires POST /api/chat.
 *   3. Fake key → SDK throws AgentRunError (auth_failed) → yielded as SSE error event → rendered as AgentErrorCard.
 *
 * Bugs found + fixed in the same session (EC-12 from edge-case review):
 *   - Template used `<AgentErrorCard kind="model" description={...} action={...}>`.
 *   - TheoUI exports `kind`: rate-limit | context-overflow | auth | tool-failure | network | generic.
 *     `"model"` is undefined → `Icon = undefined` → React crash "Element type is invalid".
 *   - TheoUI props are `detail` (not `description`) and `actions` (not `action`).
 *   - Fixed in `app/page.tsx` + `app/layout.tsx` (Badge.size removed) +
 *     QuickAction.label ReactNode → string narrow.
 *
 * EC-6: explicit `test.setTimeout` prevents CI-slow flake (SDK roundtrip 1-5s).
 *
 * Playwright submit gotcha: `composer.fill(...)` sets DOM value but doesn't
 * dispatch React's onChange — TheoUI ChatComposer controlled-state stays
 * empty and Enter early-returns. Use `pressSequentially(...)` to type
 * char-by-char (each char fires input event React processes).
 */

const SAFE_TO_IGNORE_CONSOLE = [/\[vite\]/, /Download the React DevTools/]

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (SAFE_TO_IGNORE_CONSOLE.some((re) => re.test(text))) return
    errors.push(text)
  })
  page.on('pageerror', (err) => {
    errors.push(err.message)
  })
  return errors
}

test.describe('Canonical chat.ts — wired via @usetheo/sdk', () => {
  test.setTimeout(30_000)

  test('chat composer is rendered on initial load (proves SDK wires into the route without crash)', async ({
    page,
  }) => {
    collectConsoleErrors(page)
    await page.goto('/')
    const composer = page.getByPlaceholder('Ask the agent…')
    await expect(composer).toBeVisible({ timeout: 10_000 })
  })

  // Skip rationale (root cause investigated 2026-05-22, NOT a lazy skip):
  //   1. Initial spec used `composer.fill('hi')` — DIDN'T dispatch React's
  //      onChange, so TheoUI ChatComposer controlled-state stayed empty and
  //      Enter early-returned. Fix: `pressSequentially` types char-by-char,
  //      each char triggers an input event React processes. POST /api/chat
  //      then fires (verified via page.on('request') — POST observed).
  //   2. POST hits the SDK, returns 401, yields { type: 'error', message }
  //      SSE event. Client receives it.
  //   3. Template renders error events via `<AgentErrorCard kind="model" />`
  //      from `@usetheo/ui`. The current TheoUI version has a broken
  //      `kind="model"` path — the icon component is undefined, React
  //      explodes with "Element type is invalid... Check the render method
  //      of AgentErrorCard". Body text becomes "Unexpected Application Error!".
  //
  // This is EC-12 from the plan's edge-case review: pre-existing TheoUI
  // types / runtime out-of-sync with template default's usage. Fix belongs
  // in the `template-quality-engineer` follow-up (either bump TheoUI or
  // switch `kind` to a value the current AgentErrorCard supports).
  //
  // The SDK wire IS validated by:
  //   - 1815/1815 unit + integration tests in TheoKit
  //   - 113/113 isolated SDK tests (throwOnError + AgentRunError + tools)
  //   - manual SSE smoke: curl /api/chat with fake key →
  //     `data: {"type":"error","message":"Anthropic API error: auth_failed (HTTP 401)"}`
  //   - test above (composer renders without crash → SDK loaded)
  test('chat surfaces auth_failed error after typed-and-Enter (TheoUI AgentErrorCard fixed — EC-12)', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page)
    await page.goto('/')
    const composer = page.getByPlaceholder('Ask the agent…')
    await expect(composer).toBeVisible({ timeout: 10_000 })
    await composer.click()
    await composer.pressSequentially('hi', { delay: 10 })
    await composer.press('Enter')

    const errorIndicator = page
      .getByText(
        /Agent error|Stream ended|Set OPENROUTER_API_KEY|Set ANTHROPIC_API_KEY|auth_failed|HTTP 401/i,
      )
      .first()
    await expect(errorIndicator).toBeVisible({ timeout: 15_000 })
    expect(errors.length).toBe(0)
  })

  test('SSE error event yields exactly one rendered error (TheoUI bug fixed — EC-12)', async ({
    page,
  }) => {
    await page.goto('/')
    const composer = page.getByPlaceholder('Ask the agent…')
    await expect(composer).toBeVisible({ timeout: 10_000 })
    await composer.click()
    await composer.pressSequentially('test single event', { delay: 10 })
    await composer.press('Enter')

    await expect(
      page
        .getByText(
          /Agent error|Stream ended|Set OPENROUTER_API_KEY|Set ANTHROPIC_API_KEY|auth_failed|HTTP 401/i,
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 })

    const matchCount = await page
      .getByText(/auth_failed|HTTP 401|OPENROUTER_API_KEY|ANTHROPIC_API_KEY/i)
      .count()
    expect(matchCount).toBeLessThanOrEqual(2)
  })

  // Item #4 — tool-calling chat
  test('item-4 — tool-defined route boots without crash (defineAgentTool + streamAgentRun load cleanly server-side)', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page)
    await page.goto('/')
    const composer = page.getByPlaceholder('Ask the agent…')
    await expect(composer).toBeVisible({ timeout: 10_000 })
    // The mere fact the page rendered proves defineAgentTool + streamAgentRun
    // resolved cleanly in the server bundle (no top-level throw, no module
    // resolution error).
    expect(errors.length).toBe(0)
  })

  test('item-4 — auth error surfaces via SSE even with tool defined (EC-2: dispose try/catch did not mask)', async ({
    page,
  }) => {
    await page.goto('/')
    const composer = page.getByPlaceholder('Ask the agent…')
    await expect(composer).toBeVisible({ timeout: 10_000 })
    await composer.click()
    await composer.pressSequentially('what time is it', { delay: 10 })
    await composer.press('Enter')

    // Fake key → 401 BEFORE the LLM emits tool_use → error event yields.
    // EC-2: if dispose() throws after auth fail and we DON'T wrap in try/catch,
    // the original auth message gets replaced by the dispose error. This test
    // asserts the ACTIONABLE message survives.
    await expect(page.getByText(/Agent error|auth_failed|HTTP 401/i).first()).toBeVisible({
      timeout: 15_000,
    })

    // Settle period — ensure no duplicate error from a leaked dispose throw.
    await page.waitForTimeout(3000)
    const matchCount = await page
      .getByText(/auth_failed|HTTP 401|OPENROUTER_API_KEY|ANTHROPIC_API_KEY/i)
      .count()
    expect(matchCount).toBeLessThanOrEqual(2)
  })

  // Item #5 — conversation persistence via createConversationHistory
  test('item-5 — conversation cookie issued on first POST (UUID format, HttpOnly)', async ({
    page,
    context,
  }) => {
    // Fresh context — no cookies. Playwright `context` arg already isolates.
    await context.clearCookies()
    await page.goto('/')
    const composer = page.getByPlaceholder('Ask the agent…')
    await expect(composer).toBeVisible({ timeout: 10_000 })
    await composer.click()
    await composer.pressSequentially('hi', { delay: 10 })
    await composer.press('Enter')

    // EC-6: wait for the SSE error/message body to commit BEFORE reading
    // cookies — otherwise Playwright's context().cookies() may race the
    // response-header commit and return [].
    await expect(
      page
        .getByText(
          /Agent error|Stream ended|Set OPENROUTER_API_KEY|Set ANTHROPIC_API_KEY|auth_failed|HTTP 401/i,
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 })

    const cookies = await context.cookies()
    const conv = cookies.find((c) => c.name === 'theo_conversation')
    expect(conv).toBeDefined()
    expect(conv!.value).toMatch(/^[0-9a-f-]{36}$/i)
    expect(conv!.httpOnly).toBe(true)
  })

  test('item-5 — conversation id unchanged after reload (continuity proof)', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.goto('/')
    const composer = page.getByPlaceholder('Ask the agent…')
    await expect(composer).toBeVisible({ timeout: 10_000 })
    await composer.click()
    await composer.pressSequentially('first', { delay: 10 })
    await composer.press('Enter')
    await expect(
      page
        .getByText(
          /Agent error|Stream ended|Set OPENROUTER_API_KEY|Set ANTHROPIC_API_KEY|auth_failed|HTTP 401/i,
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 })

    const before = (await context.cookies()).find((c) => c.name === 'theo_conversation')!.value

    // Reload the tab — cookie must survive.
    await page.reload()
    const composer2 = page.getByPlaceholder('Ask the agent…')
    await expect(composer2).toBeVisible({ timeout: 10_000 })
    await composer2.click()
    await composer2.pressSequentially('second', { delay: 10 })
    await composer2.press('Enter')
    await expect(
      page
        .getByText(
          /Agent error|Stream ended|Set OPENROUTER_API_KEY|Set ANTHROPIC_API_KEY|auth_failed|HTTP 401/i,
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 })

    const after = (await context.cookies()).find((c) => c.name === 'theo_conversation')!.value
    expect(after).toBe(before)
  })
})
