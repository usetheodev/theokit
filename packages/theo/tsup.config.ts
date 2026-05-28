import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'server/index': 'src/server/index.ts',
      // T4.4 (architecture-cleanup) — subpath entrypoints per ADR-0001 v3.
      // Consumers should migrate to these; `theokit/server` keeps re-exporting
      // them for backwards compat until 1.0.
      'server/auth/index': 'src/server/auth/index.ts',
      'server/cost/index': 'src/server/cost/index.ts',
      'server/cron/index': 'src/server/cron/index.ts',
      'server/jobs/index': 'src/server/jobs/index.ts',
      'vite-plugin/index': 'src/vite-plugin/index.ts',
      'client/index': 'src/client/index.ts',
      'react-query/index': 'src/react-query/index.ts',
      'adapters/web-shim': 'src/adapters/web-shim.ts',
      'adapters/ws-shim': 'src/adapters/ws-shim.ts',
      // Devtools client entry — loaded dynamically in dev mode by the
      // Vite plugin's `theokit/devtools/entry` alias. MUST ship in dist
      // because consumers resolve `theokit` via package.json#exports → dist/,
      // not src/. Without this entry the alias resolves to a missing file
      // and `pnpm dev` in any consumer crashes with a vite:import-analysis
      // error (regression from 2026-05-22; see tests/unit/devtools-entry-dist.test.ts).
      'devtools/entry': 'src/devtools/entry.tsx',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node20',
    external: [
      'vite',
      'react',
      'react-dom',
      'react-router',
      'zod',
      '@vitejs/plugin-react',
      'cac',
      'busboy',
      'superjson',
    ],
  },
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node20',
    banner: {
      js: '#!/usr/bin/env node\nimport "tsx/esm";',
    },
    external: [
      'vite',
      'react',
      'react-dom',
      'react-router',
      'zod',
      '@vitejs/plugin-react',
      'cac',
      'busboy',
      'superjson',
    ],
  },
])
