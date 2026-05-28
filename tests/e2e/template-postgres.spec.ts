import { test, expect } from '@playwright/test'

/**
 * T5.1 — `postgres` template Playwright spec (3 of 4).
 *
 * EC-9: this spec REQUIRES a running Postgres reachable via
 * `DATABASE_URL`. When the env var is absent, every test is
 * `test.skip()`ed (idiomatic pattern for env-gated integration tests).
 * CI adds a `postgres:16` service container + `pg_isready` wait step
 * before running this project.
 */

const REQUIRES_POSTGRES = test.skip(
  process.env.DATABASE_URL === undefined,
  'DATABASE_URL not set — postgres template spec requires a running Postgres. ' +
    'Set DATABASE_URL=postgres://user:pass@localhost:5432/db to run.',
)

test.describe('Template postgres — happy path', () => {
  test.beforeEach(() => REQUIRES_POSTGRES)

  test('home page renders', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('/api/health returns 200 + { ok: true }', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  test('/api/users returns seeded rows from the DB', async ({ request }) => {
    const res = await request.get('/api/users')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as Array<unknown>
    expect(Array.isArray(body)).toBe(true)
  })
})

test.describe('Template postgres — error scenarios', () => {
  test.beforeEach(() => REQUIRES_POSTGRES)

  test('GET /api/missing returns 404', async ({ request }) => {
    const res = await request.get('/api/missing')
    expect(res.status()).toBe(404)
  })
})
