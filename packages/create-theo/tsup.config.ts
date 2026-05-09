import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'cli': 'src/cli.ts',
  },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [
    'cross-spawn',
  ],
})
