import { build as viteBuild } from 'vite'
import react from '@vitejs/plugin-react'
import { theoPlugin } from '../vite-plugin/index.js'
import type { DeployAdapter } from './types.js'
import type { TheoConfig } from '../config/schema.js'

export const nodeAdapter: DeployAdapter = {
  name: 'node',

  async build(config: TheoConfig, cwd: string): Promise<void> {
    // Client build
    await viteBuild({
      root: cwd,
      plugins: [react(), theoPlugin({ root: cwd, ssr: config.ssr })],
      build: {
        outDir: '.theo/client',
        emptyOutDir: true,
      },
      logLevel: 'info',
    })

    // SSR build (only when ssr: true)
    if (config.ssr) {
      console.log('\n  Building SSR...\n')
      await viteBuild({
        root: cwd,
        plugins: [react(), theoPlugin({ root: cwd, ssr: true })],
        build: {
          ssr: true,
          outDir: '.theo/server',
          emptyOutDir: true,
          rollupOptions: {
            input: '/@theo/entry-server',
          },
        },
        logLevel: 'info',
      })
    }
  },
}
