import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Config } from 'drizzle-kit'

// Resolve schema/out paths relative to THIS config file, not CWD. Required so
// invocations from the repo root (`pnpm exec drizzle-kit push --config
// fixtures/template-saas/drizzle.config.ts`) work the same as running
// from the fixture dir.
const here = dirname(fileURLToPath(import.meta.url))

export default {
  schema: resolve(here, 'db/schema.ts'),
  out: resolve(here, 'drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies Config
