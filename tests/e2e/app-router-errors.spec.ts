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

test.describe('App Router — Error Boundaries', () => {
  test('home page renders normally', async ({ page }) => {
    await gotoWithRetry(page, '/')
    await expect(page.locator('h1')).toHaveText('Home')
  })

  test('broken page renders error.tsx', async ({ page }) => {
    await gotoWithRetry(page, '/broken')
    await expect(page.locator('h1')).toHaveText('Something went wrong')
  })
})
