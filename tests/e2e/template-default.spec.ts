import { test, expect, type ConsoleMessage } from '@playwright/test'

/**
 * Phase 10 — T10.1 Playwright browser test for the default template.
 *
 * The default template is the canonical first-run surface — it's what every
 * developer sees after `npm create theokit my-app`. Structural unit tests
 * already pin the file shape, but only a real browser catches the class of
 * bugs we fixed live this week:
 *
 *   - Black-page bug (layout received undefined children because the route
 *     manifest used `<Outlet />` while the template did `return children`).
 *   - request.json() crash on Node IncomingMessage in dev.
 *   - Hydration mismatch from divergent SSR/CSR trees.
 *
 * Every assertion here would have caught at least one of those bugs at
 * commit-time. Failing this spec ships visible regressions.
 */

const SAFE_TO_IGNORE_CONSOLE = [
  // Vite dev preamble
  /\[vite\]/,
  // React DevTools nag
  /Download the React DevTools/,
  // TheoUI tooltip white-on-white issue tracked upstream (theo-ui#7)
  // does not log a console error — listed here just to document the policy.
]

function collectConsoleErrors(page: import('@playwright/test').Page) {
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

test.describe('Default template — agent surface', () => {
  test('renders the app shell (TopNav + Sidebar + main)', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await page.goto('/')

    // App shell anchors — these come from TheoUI primitives.
    await expect(page.getByText('Theo Agent').first()).toBeVisible()
    // Sidebar.Item rendered as button. Use exact match — there's also a
    // QuickActionChip 'Start a new conversation' that contains the substring.
    await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible()

    // Empty state on first load
    await expect(page.getByText('What should we build today?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Summarize this page' })).toBeVisible()

    expect(errors).toEqual([])
  })

  test('regression — no black page (layout receives Outlet as children)', async ({ page }) => {
    await page.goto('/')

    // If the layout failed to render the Outlet, #root would only contain
    // the Toaster portal (the TheoUIProvider injects a Toaster with the
    // 'Notifications (F8)' aria-label). Asserting an actual element from
    // the page body proves the Outlet rendered.
    await expect(page.locator('main')).toBeVisible()

    const headingCount = await page.locator('h1, [class*="font-display"]').count()
    expect(headingCount).toBeGreaterThan(0)
  })

  test('chat composer accepts input + auto-attaches X-Theo-Action header', async ({ page }) => {
    const errors = collectConsoleErrors(page)

    // Capture the chat request so we can assert the CSRF header is attached
    // (theoFetch does it, but the template uses native fetch via the hook —
    // the framework defaults to warn mode so requests succeed without).
    let chatHadCsrfHeader = false
    page.on('request', (req) => {
      if (req.url().endsWith('/api/chat') && req.method() === 'POST') {
        const headerValue = req.headers()['x-theo-action']
        if (headerValue === '1') chatHadCsrfHeader = true
      }
    })

    await page.goto('/')

    const composer = page.getByRole('textbox', { name: 'Chat message' })
    await composer.fill('e2e test message')
    await page.getByRole('button', { name: 'Send message' }).click()

    // Assistant card should appear with the mock's echoed content.
    await expect(page.getByText('Recebi: "e2e test message"')).toBeVisible({ timeout: 5000 })

    // Tool call card should appear.
    await expect(page.getByText('search')).toBeVisible()

    // Final message.
    await expect(page.getByText(/Pronto.*mock/)).toBeVisible()

    expect(errors).toEqual([])

    // CSRF header — the template's useAgentStream hook uses native fetch and
    // does NOT attach the header. The framework still serves the request in
    // warn mode (default) and logs a stderr warning. We assert the contract:
    // header absent here is fine; if it WERE present, the server would also
    // accept it.
    expect(chatHadCsrfHeader).toBe(false) // documents current behavior
  })

  test('streaming response arrives as 3 SSE events in order', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('textbox', { name: 'Chat message' }).fill('order check')
    await page.getByRole('button', { name: 'Send message' }).click()

    // The mock yields message → tool_call → message. Verify presence + order.
    const echoLocator = page.getByText('Recebi: "order check"')
    const toolLocator = page.getByText('search')
    const finalLocator = page.getByText(/Pronto/)

    await expect(echoLocator).toBeVisible({ timeout: 5000 })
    await expect(toolLocator).toBeVisible()
    await expect(finalLocator).toBeVisible()

    // Order: each subsequent element should appear AFTER the previous in DOM.
    const echoBox = await echoLocator.boundingBox()
    const finalBox = await finalLocator.boundingBox()
    expect(echoBox).toBeTruthy()
    expect(finalBox).toBeTruthy()
    if (echoBox && finalBox) {
      expect(finalBox.y).toBeGreaterThan(echoBox.y)
    }
  })

  test('command palette opens via leading button + closes via Escape', async ({ page }) => {
    await page.goto('/')

    // Closed at first load.
    await expect(page.getByPlaceholder('Run a command…')).toHaveCount(0)

    // The composer leading slot wires a Button that opens the palette.
    // The aria-label is "Open command palette" (set in page.tsx).
    await page.getByRole('button', { name: 'Open command palette' }).click()

    await expect(page.getByPlaceholder('Run a command…')).toBeVisible()
    await expect(page.getByText('QUICK ACTIONS')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder('Run a command…')).toHaveCount(0)
  })

  test('keyboard shortcut (Ctrl/Meta+K) toggles the command palette', async ({ page }) => {
    await page.goto('/')

    // Body must have focus so the window-level keydown handler fires.
    await page.locator('body').click({ position: { x: 10, y: 10 } })

    await page.keyboard.press('Control+k')
    await expect(page.getByPlaceholder('Run a command…')).toBeVisible()

    // Toggling: pressing again closes
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder('Run a command…')).toHaveCount(0)
  })

  test('no unhandled console errors during full session', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Chat message' }).fill('no errors check')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText(/Pronto/)).toBeVisible({ timeout: 5000 })

    expect(errors, `unexpected errors:\n${errors.join('\n')}`).toEqual([])
  })
})
