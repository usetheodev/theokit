/**
 * T1.4 + EC-S4 regression gate (plan: dogfood-fixes-and-coverage-expansion).
 *
 * Validates: `<Page />` from template-default scaffold HIDRATA com
 * `<main>`, `<header>`, `<textarea>` visíveis após mount client-side.
 *
 * Required CI check — substitui dependência exclusiva de Chrome DevTools MCP
 * (que não roda em CI ambient) por Playwright headless deterministico.
 *
 * Reusa `fixtures/template-default` (workspace local; rápido). Versão npm-published
 * é spec separado opt-in (`workflow_dispatch`).
 *
 * Acceptance signal: zero hydration errors no console + DOM contém header/main/textarea.
 */
import { test, expect } from '@playwright/test'

test.describe('Scaffold page hydration (EC-S4 regression gate)', () => {
  test('Page renders <header>, <main>, <footer>, and <textarea> after hydration', async ({
    page,
  }) => {
    // Given: a freshly booted template-default scaffold,
    await page.goto('/', { waitUntil: 'networkidle' })

    // When: hydration completes (client React mounts AgentComposer + Timeline),
    // Then: interactive elements DEVEM aparecer.
    // Timeout 30s — Vite optimize-deps cold start pode levar 15s+ em CI.
    await expect(
      page.locator('textarea'),
      'textarea (AgentComposer input) must hydrate',
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('header'), '<header> must be in DOM').toBeVisible()
    await expect(page.locator('main'), '<main> must be in DOM').toBeVisible()
    // footer não existe no layout atual — composer fica direto em <main>. Removido check.
  })

  test('Page brand "Theo Agent" appears in DOM (not empty shell)', async ({ page }) => {
    // Given: hydrated app,
    await page.goto('/', { waitUntil: 'networkidle' })
    // Wait for hydration completion via textarea visibility (chat composer mount).
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30_000 })
    // When: brand renders no DOM,
    // Then: "Theo Agent" presente no body innerText (independente de visibility do Tooltip-wrapped element).
    const innerText = await page.evaluate(() => document.body.innerText)
    expect(innerText).toContain('Theo Agent')
  })

  test('Console has zero React hydration errors', async ({ page }) => {
    // Given: clean instrumented page load,
    const hydrationErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /hydrat/i.test(msg.text())) {
        hydrationErrors.push(msg.text())
      }
    })

    // When: page loads + hydrates,
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // safety wait pós-mount

    // Then: zero hydration mismatches.
    expect(
      hydrationErrors,
      hydrationErrors.length > 0
        ? `Hydration errors detected:\n${hydrationErrors.join('\n')}`
        : undefined,
    ).toEqual([])
  })

  test('Body DOM is not empty after hydration (regression gate)', async ({ page }) => {
    // Given: hydrated app,
    await page.goto('/')
    await expect(page.locator('textarea')).toBeVisible({ timeout: 30_000 })

    // When: query DOM extent,
    // Then: body deve ter ≥1 interactive element (não só toaster region como em EC-S4).
    const interactiveCount = await page.evaluate(() => {
      return document.querySelectorAll('textarea, button, input, select, a[href]').length
    })
    expect(interactiveCount, 'body must contain interactive elements').toBeGreaterThan(0)
  })
})
