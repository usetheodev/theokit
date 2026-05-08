import { defineConfig } from '@playwright/test'
import path from 'path'

const rootDir = path.dirname(new URL(import.meta.url).pathname)
const cliPath = path.resolve(rootDir, 'packages/theo/src/cli/index.ts')
const fixturePath = path.resolve(rootDir, 'fixtures/onda1-hello-theo')

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3456',
  },
  webServer: {
    command: `npx tsx ${cliPath} dev --port 3456`,
    cwd: fixturePath,
    port: 3456,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
})
