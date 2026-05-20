import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'server/index': 'src/server/index.ts',
      'vite-plugin/index': 'src/vite-plugin/index.ts',
      'client/index': 'src/client/index.ts',
      'react-query/index': 'src/react-query/index.ts',
      'adapters/web-shim': 'src/adapters/web-shim.ts',
      'adapters/ws-shim': 'src/adapters/ws-shim.ts',
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
