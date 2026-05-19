import { defineConfig } from 'theokit'

/**
 * T2.2 fixture — per-route + per-user rate limit.
 *
 * /api/login → strict (5 attempts per minute) — brute-force defense
 * everything else → loose (default 100/min) — preserve UX
 *
 * keyBy='session' buckets by session cookie (hashed) when present,
 * falling back to IP for anonymous traffic.
 */
export default defineConfig({
  rateLimit: {
    default: { windowMs: 60_000, max: 100 },
    routes: {
      '/api/login': { windowMs: 60_000, max: 5 },
    },
    keyBy: 'session',
  },
})
