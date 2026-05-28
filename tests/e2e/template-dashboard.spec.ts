import { test, expect, type Page } from '@playwright/test'

/**
 * T5.1 — `dashboard` template Playwright spec.
 *
 * Validates the dashboard template scaffold:
 *   - Home page renders (happy path)
 *   - /dashboard subroute renders (nested layout works)
 *   - /api/health returns 200 + JSON (server route works)
 *   - 404 on unknown route shows expected fallback (error scenario)
 */

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle' })
  const hasContent = await page
    .locator('body *')
    .first()
    .isVisible()
    .catch(() => false)
  if (!hasContent) {
    await page.waitForTimeout(2000)
    await page.reload({ waitUntil: 'networkidle' })
  }
}

test.describe('Template dashboard — happy path', () => {
  test('home page renders with welcome heading', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await expect(page.locator('h1')).toContainText('Welcome to Theo')
  })

  test('/dashboard subroute renders nested layout', async ({ page }) => {
    await gotoWithRetry(page, '/dashboard')
    await expect(page.locator('h1')).toContainText('Dashboard')
  })

  test('/about renders the about page', async ({ page }) => {
    await gotoWithRetry(page, '/about')
    // The about page renders SOME content — the template ships a minimal
    // <h1> heading; we assert any heading is visible.
    await expect(page.locator('h1').first()).toBeVisible()
  })
})

test.describe('Template dashboard — server route', () => {
  test('/api/health returns 200 + JSON', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})

test.describe('Template dashboard — error scenario', () => {
  test('unknown /api route returns 404 with NOT_FOUND code', async ({ request }) => {
    const res = await request.get('/api/this-does-not-exist')
    expect(res.status()).toBe(404)
    const body = (await res.json()) as { error?: { code?: string } }
    expect(body.error?.code).toBe('NOT_FOUND')
  })
})
