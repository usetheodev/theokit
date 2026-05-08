import { test, expect } from '@playwright/test'

test.describe('Hello Theo E2E', () => {
  test('should render Hello Theo heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Hello Theo')
  })

  test('should have Theo App as page title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Theo App')
  })

  test('should have a #root element', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeAttached()
  })

  test('should not have console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  })
})
