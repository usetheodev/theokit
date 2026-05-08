import { test, expect } from '@playwright/test'

test.describe('App Router — Not Found', () => {
  test('home page renders normally', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Home')
  })

  test('unknown route renders not-found.tsx', async ({ page }) => {
    await page.goto('/xyz')
    await expect(page.locator('h1')).toHaveText('Page not found')
  })

  test('another unknown route also renders not-found', async ({ page }) => {
    await page.goto('/does-not-exist/at-all')
    await expect(page.locator('h1')).toHaveText('Page not found')
  })
})
