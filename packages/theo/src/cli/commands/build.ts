import { build as viteBuild } from 'vite'
import react from '@vitejs/plugin-react'
import { loadConfig } from '../../config/load-config.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { theoPlugin } from '../../vite-plugin/index.js'

export async function buildCommand(): Promise<void> {
  const cwd = process.cwd()
  const config = await loadConfig(cwd)
  validateProjectStructure(cwd)

  console.log('\n  Building...\n')

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

  const ssrNote = config.ssr ? ' (SSR)' : ''
  console.log(`\n  ✓ Build complete → .theo/client/${ssrNote}\n`)
}
