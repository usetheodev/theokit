/**
 * Fixture (T3.2) — TheoKit app demonstrating `useUnstorage` with a mock Redis driver.
 *
 * Note: there is no `storage:` block in this config — `useUnstorage` is a
 * call-site primitive that gets its driver via the userland call. The fixture
 * demonstrates that pattern (vs. T2.2 which uses `theo.config.ts > storage`
 * for PG/Redis with `usePostgres`/`useRedis`).
 */
import { defineConfig } from '../../../packages/theo/src/index.js'

export default defineConfig({})
