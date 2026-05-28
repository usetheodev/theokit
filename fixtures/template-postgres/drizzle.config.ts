import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'drizzle-kit'

// Resolve schema/out paths relative to THIS config file, not CWD. Required so
// invocations from the repo root (`pnpm exec drizzle-kit push --config
// fixtures/template-postgres/drizzle.config.ts`) work the same as running
// from the fixture dir.
const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  out: resolve(here, 'drizzle'),
  dialect: 'postgresql',
  schema: resolve(here, 'db/schema.ts'),
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
