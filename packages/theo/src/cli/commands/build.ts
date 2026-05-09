import { loadConfig } from '../../config/load-config.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { VALID_TARGETS, type BuildTarget } from '../../adapters/types.js'
import { nodeAdapter } from '../../adapters/node.js'

export async function buildCommand(options?: { target?: string }): Promise<void> {
  const cwd = process.cwd()
  const config = await loadConfig(cwd)
  validateProjectStructure(cwd)

  const target = (options?.target ?? 'node') as BuildTarget

  if (!VALID_TARGETS.includes(target)) {
    throw new Error(
      `Invalid build target "${target}". Available targets: ${VALID_TARGETS.join(', ')}`,
    )
  }

  console.log(`\n  Building for ${target}...\n`)

  if (target === 'node') {
    await nodeAdapter.build(config, cwd)
  } else if (target === 'vercel') {
    const { vercelAdapter } = await import('../../adapters/vercel.js')
    await vercelAdapter.build(config, cwd)
  } else if (target === 'cloudflare') {
    const { cloudflareAdapter } = await import('../../adapters/cloudflare.js')
    await cloudflareAdapter.build(config, cwd)
  }

  const ssrNote = config.ssr ? ' (SSR)' : ''
  console.log(`\n  ✓ Build complete → ${target}${ssrNote}\n`)
}
