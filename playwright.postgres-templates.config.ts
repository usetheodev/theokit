/**
 * Dedicated Playwright config for the `e2e-postgres-templates` CI job
 * (Wave 2 prereq R0.5.2). Includes ONLY the `template-postgres` and
 * `template-saas` projects + their webServers, isolating the job from the
 * other fixtures' (pre-existing) workspace gaps that break the main
 * `playwright.config.ts` on CI.
 *
 * Local devs run `npx playwright test` (default config) which exercises
 * all 16+ projects. CI's e2e-postgres-templates job uses
 * `--config playwright.postgres-templates.config.ts` to scope down.
 */
import path from 'node:path'

import { defineConfig } from '@playwright/test'

const rootDir = path.dirname(new URL(import.meta.url).pathname)
const cliPath = path.resolve(rootDir, 'packages/theo/src/cli/index.ts')

function fixture(name: string) {
  return path.resolve(rootDir, 'fixtures', name)
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: 1,
  projects: [
    {
      name: 'template-postgres',
      use: { baseURL: 'http://localhost:3465' },
      testMatch: 'template-postgres.spec.ts',
    },
    {
      name: 'template-saas',
      use: { baseURL: 'http://localhost:3466' },
      testMatch: 'template-saas.spec.ts',
    },
  ],
  webServer: [
    {
      command: `npx tsx ${cliPath} dev --port 3465`,
      cwd: fixture('template-postgres'),
      port: 3465,
      reuseExistingServer: false,
      timeout: 180000,
    },
    {
      command: `npx tsx ${cliPath} dev --port 3466`,
      cwd: fixture('template-saas'),
      port: 3466,
      reuseExistingServer: false,
      timeout: 180000,
    },
  ],
})
