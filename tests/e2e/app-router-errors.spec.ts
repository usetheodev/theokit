import { test, expect } from '@playwright/test'

test.describe('App Router — Error Boundaries', () => {
  test('home page renders normally', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Home')
  })

  test('broken page renders error.tsx', async ({ page }) => {
    await page.goto('/broken')
    await expect(page.locator('h1')).toHaveText('Something went wrong')
  })
})
