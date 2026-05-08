import { defineConfig } from '@playwright/test'
import path from 'path'

const rootDir = path.dirname(new URL(import.meta.url).pathname)
const cliPath = path.resolve(rootDir, 'packages/theo/src/cli/index.ts')

function fixture(name: string) {
  return path.resolve(rootDir, 'fixtures', name)
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  projects: [
    {
      name: 'onda1',
      use: { baseURL: 'http://localhost:3456' },
      testMatch: 'hello-theo.spec.ts',
    },
    {
      name: 'app-router-layouts',
      use: { baseURL: 'http://localhost:3457' },
      testMatch: 'app-router-layouts.spec.ts',
    },
    {
      name: 'app-router-errors',
      use: { baseURL: 'http://localhost:3458' },
      testMatch: 'app-router-errors.spec.ts',
    },
    {
      name: 'app-router-not-found',
      use: { baseURL: 'http://localhost:3459' },
      testMatch: 'app-router-not-found.spec.ts',
    },
  ],
  webServer: [
    {
      command: `npx tsx ${cliPath} dev --port 3456`,
      cwd: fixture('onda1-hello-theo'),
      port: 3456,
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
    {
      command: `npx tsx ${cliPath} dev --port 3457`,
      cwd: fixture('app-router-nested-layouts'),
      port: 3457,
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
    {
      command: `npx tsx ${cliPath} dev --port 3458`,
      cwd: fixture('app-router-errors'),
      port: 3458,
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
    {
      command: `npx tsx ${cliPath} dev --port 3459`,
      cwd: fixture('app-router-not-found'),
      port: 3459,
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
  ],
})
