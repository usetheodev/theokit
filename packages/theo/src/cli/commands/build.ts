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

  await viteBuild({
    root: cwd,
    plugins: [react(), theoPlugin({ root: cwd })],
    build: {
      outDir: '.theo/client',
      emptyOutDir: true,
    },
    logLevel: 'info',
  })

  console.log('\n  ✓ Build complete → .theo/client/\n')
}
