import cac from 'cac'

const cli = cac('theo')

cli
  .command('dev', 'Start development server')
  .option('--port <port>', 'Port number')
  .action(async (options) => {
    const { devCommand } = await import('./commands/dev.js')
    await devCommand({ port: options.port ? Number(options.port) : undefined })
  })

cli
  .command('build', 'Build for production')
  .option('--target <target>', 'Deploy target (node, vercel, cloudflare)')
  .action(async (options) => {
    try {
      const { buildCommand } = await import('./commands/build.js')
      await buildCommand({ target: options.target })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n  ✗ ${msg}\n`)
      process.exit(1)
    }
  })

cli
  .command('start', 'Start production server')
  .option('--port <port>', 'Port number')
  .action(async (options) => {
    try {
      const { startCommand } = await import('./commands/start.js')
      await startCommand({ port: options.port ? Number(options.port) : undefined })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n  ✗ ${msg}\n`)
      process.exit(1)
    }
  })

cli
  .command('docker', 'Generate Dockerfile for production')
  .option('--force', 'Overwrite existing Dockerfile')
  .action(async (options) => {
    try {
      const { dockerCommand } = await import('./commands/docker.js')
      await dockerCommand({ force: options.force })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n  ✗ ${msg}\n`)
      process.exit(1)
    }
  })

cli.help()
cli.version('0.0.1')

export function main(): void {
  cli.parse()
}

// Auto-execute when run as script
main()
