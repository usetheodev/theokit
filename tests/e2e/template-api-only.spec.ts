import { test, expect } from '@playwright/test'

/**
 * T5.1 — `api-only` template Playwright spec.
 *
 * Validates the API-focused template:
 *   - /api/health returns 200 + JSON (happy path)
 *   - /api/users returns the seed data (happy path)
 *   - /api/users?search=alice filters by name (happy path)
 *   - POST /api/users with invalid body returns 422 (validation error)
 *   - POST /api/users with valid body returns 201 (happy path)
 *   - GET /api/missing returns 404 (error scenario)
 */

test.describe('Template api-only — health + read', () => {
  test('/api/health returns 200 + { ok: true }', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  test('/api/users returns the seed array', async ({ request }) => {
    const res = await request.get('/api/users')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as Array<{ name: string }>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(2)
  })

  test('/api/users?search=alice filters by name', async ({ request }) => {
    const res = await request.get('/api/users?search=alice')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as Array<{ name: string }>
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('Alice')
  })
})

test.describe('Template api-only — validation', () => {
  test('POST /api/users with invalid email returns 4xx (validation)', async ({ request }) => {
    const res = await request.post('/api/users', {
      headers: { 'X-Theo-Action': '1', 'content-type': 'application/json' },
      data: { name: 'X', email: 'not-an-email' },
    })
    // 400 or 422 depending on framework convention — both are validation rejects.
    expect([400, 422]).toContain(res.status())
  })

  test('POST /api/users with valid body returns 201', async ({ request }) => {
    const res = await request.post('/api/users', {
      headers: { 'X-Theo-Action': '1', 'content-type': 'application/json' },
      data: { name: 'Carol', email: 'carol@example.com' },
    })
    expect(res.status()).toBe(201)
    const body = (await res.json()) as { name: string }
    expect(body.name).toBe('Carol')
  })
})

test.describe('Template api-only — error scenario', () => {
  test('/api/missing returns 404 NOT_FOUND', async ({ request }) => {
    const res = await request.get('/api/missing')
    expect(res.status()).toBe(404)
  })
})
