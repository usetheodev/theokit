import cac from 'cac'

const cli = cac('theokit')

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
  .command('generate <type> <name>', 'Generate a route, action, page, or ws endpoint')
  .action(async (type: string, name: string) => {
    try {
      const { generateCommand } = await import('./commands/generate.js')
      await generateCommand(type, name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n  ✗ ${msg}\n`)
      process.exit(1)
    }
  })

cli
  .command('routes', 'List all routes, actions, and WebSocket endpoints')
  .action(async () => {
    try {
      const { routesCommand } = await import('./commands/routes.js')
      await routesCommand()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n  ✗ ${msg}\n`)
      process.exit(1)
    }
  })

cli
  .command('check', 'Run typecheck + scan + (optional) eslint')
  .action(async () => {
    const { checkCommand } = await import('./commands/check.js')
    await checkCommand()
  })

cli
  .command('add <package>', 'Install a known TheoKit adapter or plugin (whitelist-only)')
  .action(async (pkg: string) => {
    const { addCommand } = await import('./commands/add.js')
    await addCommand(pkg)
  })

cli
  .command('info', 'Print environment info (runtime, config, routes)')
  .action(async () => {
    const { infoCommand } = await import('./commands/info.js')
    await infoCommand()
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
cli.version('0.1.0-alpha.0')

export function main(): void {
  cli.parse()
}

// Auto-execute when run as script
main()
