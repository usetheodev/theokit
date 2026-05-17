import { resolve } from 'node:path'
import { loadConfig } from '../../config/load-config.js'
import { validateProjectStructure } from '../../core/validate-structure.js'
import { VALID_TARGETS, type BuildTarget } from '../../adapters/types.js'
import { nodeAdapter } from '../../adapters/node.js'
import { generateManifest, writeManifest } from '../../server/manifest.js'

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
  } else if (target === 'static') {
    const { staticAdapter } = await import('../../adapters/static.js')
    await staticAdapter.build(config, cwd)
  } else if (target === 'bun') {
    const { bunAdapter } = await import('../../adapters/bun.js')
    await bunAdapter.build(config, cwd)
  } else if (target === 'deno-deploy') {
    const { denoDeployAdapter } = await import('../../adapters/deno-deploy.js')
    await denoDeployAdapter.build(config, cwd)
  } else if (target === 'netlify') {
    const { netlifyAdapter } = await import('../../adapters/netlify.js')
    await netlifyAdapter.build(config, cwd)
  } else if (target === 'aws-lambda') {
    const { awsLambdaAdapter } = await import('../../adapters/aws-lambda.js')
    await awsLambdaAdapter.build(config, cwd)
  }

  // Generate route manifest
  const serverDir = resolve(cwd, config.serverDir)
  const distDir = resolve(cwd, '.theo')
  const manifest = generateManifest(serverDir)
  writeManifest(manifest, distDir)

  const totalEndpoints = manifest.routes.length + manifest.actions.length + manifest.websockets.length
  console.log(`  ✓ Manifest: ${manifest.routes.length} routes, ${manifest.actions.length} actions, ${manifest.websockets.length} ws (${totalEndpoints} total)`)

  const ssrNote = config.ssr ? ' (SSR)' : ''
  console.log(`\n  ✓ Build complete → ${target}${ssrNote}\n`)
}
