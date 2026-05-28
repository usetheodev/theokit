/**
 * Fixture (T2.2) — TheoKit app demonstrating `theo.config.ts > storage`.
 *
 * Shows the canonical shape for TheoCloud / managed-PG / self-host deploys:
 *   - One Postgres server with multiple databases sharing the same credentials
 *   - One Redis server for cache + rate-limit + session store
 *
 * Credentials come from env vars in production. Tests inject literals.
 */
import { defineConfig } from '../../../packages/theo/src/index.js'

export default defineConfig({
  storage: {
    servers: {
      primary: {
        host: process.env.PG_HOST ?? 'pg.example.local',
        port: 5432,
        user: process.env.PG_USER ?? 'theo',
        password: process.env.PG_PASSWORD ?? '',
      },
    },
    databases: {
      conversations: {
        server: 'primary',
        database: 'theo_conversations',
        pool: { min: 1, max: 10, connectionTimeoutMillis: 5000 },
      },
      jobs: {
        server: 'primary',
        database: 'theo_jobs',
        pool: { min: 1, max: 10, connectionTimeoutMillis: 5000 },
      },
    },
    redis: {
      cache: {
        host: process.env.REDIS_HOST ?? 'redis.example.local',
        port: 6379,
        user: 'default',
        password: process.env.REDIS_PASSWORD ?? '',
      },
    },
  },
})
