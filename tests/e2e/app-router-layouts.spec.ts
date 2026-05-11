import { test, expect } from '@playwright/test'

async function gotoWithRetry(page: import('@playwright/test').Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' })
  // Vite dep optimization may cause a reload on first visit — retry if page is blank
  const hasContent = await page.locator('#root *').first().isVisible().catch(() => false)
  if (!hasContent) {
    await page.waitForTimeout(2000)
    await page.reload({ waitUntil: 'networkidle' })
  }
}

test.describe('App Router — Nested Layouts', () => {
  test('root layout wraps home page', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await expect(page.locator('[data-testid="root-layout"]')).toBeAttached()
    await expect(page.locator('h1')).toHaveText('Home')
  })

  test('root layout wraps about page', async ({ page }) => {
    await gotoWithRetry(page, '/about')
    await expect(page.locator('[data-testid="root-layout"]')).toBeAttached()
    await expect(page.locator('h1')).toHaveText('About')
  })

  test('dashboard has both root and dashboard layout', async ({ page }) => {
    await gotoWithRetry(page, '/dashboard')
    await expect(page.locator('[data-testid="root-layout"]')).toBeAttached()
    await expect(page.locator('[data-testid="dashboard-layout"]')).toBeAttached()
    await expect(page.locator('h1')).toHaveText('Dashboard')
  })

  test('about page does NOT have dashboard layout', async ({ page }) => {
    await gotoWithRetry(page, '/about')
    await expect(page.locator('[data-testid="dashboard-layout"]')).not.toBeAttached()
  })
})
