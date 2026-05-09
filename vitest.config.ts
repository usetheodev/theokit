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
      'theo/client': path.resolve(__dirname, 'packages/theo/src/client/index.ts'),
      'theo/server': path.resolve(__dirname, 'packages/theo/src/server/index.ts'),
      'theo': path.resolve(__dirname, 'packages/theo/src/index.ts'),
    },
  },
})
