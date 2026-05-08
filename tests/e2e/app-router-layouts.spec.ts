import { test, expect } from '@playwright/test'

test.describe('App Router — Nested Layouts', () => {
  test('root layout wraps home page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="root-layout"]')).toBeAttached()
    await expect(page.locator('h1')).toHaveText('Home')
  })

  test('root layout wraps about page', async ({ page }) => {
    await page.goto('/about')
    await expect(page.locator('[data-testid="root-layout"]')).toBeAttached()
    await expect(page.locator('h1')).toHaveText('About')
  })

  test('dashboard has both root and dashboard layout', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('[data-testid="root-layout"]')).toBeAttached()
    await expect(page.locator('[data-testid="dashboard-layout"]')).toBeAttached()
    await expect(page.locator('h1')).toHaveText('Dashboard')
  })

  test('about page does NOT have dashboard layout', async ({ page }) => {
    await page.goto('/about')
    await expect(page.locator('[data-testid="dashboard-layout"]')).not.toBeAttached()
  })
})
