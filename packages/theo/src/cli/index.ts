import cac from 'cac'

const cli = cac('theo')

cli
  .command('dev', 'Start development server')
  .option('--port <port>', 'Port number')
  .action(async (options) => {
    const { devCommand } = await import('./commands/dev.js')
    await devCommand({ port: options.port ? Number(options.port) : undefined })
  })

cli.help()
cli.version('0.0.1')

export function main(): void {
  cli.parse()
}

// Auto-execute when run as script
main()
