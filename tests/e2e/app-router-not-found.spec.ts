import { test, expect, type Page } from '@playwright/test'

async function gotoWithRetry(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' })
  // Vite dep optimization may cause a reload on first visit — retry if page is blank
  const hasContent = await page
    .locator('#root *')
    .first()
    .isVisible()
    .catch(() => false)
  if (!hasContent) {
    await page.waitForTimeout(2000)
    await page.reload({ waitUntil: 'networkidle' })
  }
}

test.describe('App Router — Not Found', () => {
  test('home page renders normally', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await expect(page.locator('h1')).toHaveText('Home')
  })

  test('unknown route renders not-found.tsx', async ({ page }) => {
    await gotoWithRetry(page, '/xyz')
    await expect(page.locator('h1')).toHaveText('Page not found')
  })

  test('another unknown route also renders not-found', async ({ page }) => {
    await gotoWithRetry(page, '/does-not-exist/at-all')
    await expect(page.locator('h1')).toHaveText('Page not found')
  })
})
