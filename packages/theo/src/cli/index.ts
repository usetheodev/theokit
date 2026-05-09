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
  .action(async () => {
    try {
      const { buildCommand } = await import('./commands/build.js')
      await buildCommand()
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

cli.help()
cli.version('0.0.1')

export function main(): void {
  cli.parse()
}

// Auto-execute when run as script
main()
