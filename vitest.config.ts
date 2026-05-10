import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test-d.ts'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
  resolve: {
    alias: {
      'theokit/client': path.resolve(__dirname, 'packages/theo/src/client/index.ts'),
      'theokit/server': path.resolve(__dirname, 'packages/theo/src/server/index.ts'),
      'theokit': path.resolve(__dirname, 'packages/theo/src/index.ts'),
    },
  },
})
