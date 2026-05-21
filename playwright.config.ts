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
  workers: 1, // Sequential — 4 dev servers compete for resources in parallel
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
    {
      name: 'template-default',
      use: { baseURL: 'http://localhost:3460' },
      testMatch: 'template-default.spec.ts',
    },
    {
      name: 'devtools',
      use: { baseURL: 'http://localhost:3461' },
      testMatch: 'devtools.spec.ts',
    },
    {
      // T6.1 — WebSocket E2E
      name: 'websocket-echo',
      use: { baseURL: 'http://localhost:3462' },
      testMatch: 'websocket-echo.spec.ts',
    },
  ],
  webServer: [
    {
      command: `npx tsx ${cliPath} dev --port 3456`,
      cwd: fixture('onda1-hello-theo'),
      port: 3456,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `npx tsx ${cliPath} dev --port 3457`,
      cwd: fixture('app-router-nested-layouts'),
      port: 3457,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `npx tsx ${cliPath} dev --port 3458`,
      cwd: fixture('app-router-errors'),
      port: 3458,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `npx tsx ${cliPath} dev --port 3459`,
      cwd: fixture('app-router-not-found'),
      port: 3459,
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: `npx tsx ${cliPath} dev --port 3460`,
      cwd: fixture('template-default'),
      port: 3460,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      // T1.3 — devtools project. Reuses template-default fixture on a
      // separate port so the existing template-default spec is unaffected.
      command: `npx tsx ${cliPath} dev --port 3461`,
      cwd: fixture('template-default'),
      port: 3461,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      // T6.1 — WebSocket echo fixture for the WS E2E spec.
      // EC-8: webServer timeout 180s for scaffold + first-run install.
      command: `npx tsx ${cliPath} dev --port 3462`,
      cwd: fixture('websocket-basic'),
      port: 3462,
      reuseExistingServer: false,
      timeout: 180000,
    },
  ],
})
