import { resolve } from 'node:path'
import { scaffold } from './index.js'
import { detectPkgManager } from './pkg-manager.js'
import { runInstall } from './install.js'

export function main(): void {
  const args = process.argv.slice(2)
  const positionalArgs = args.filter((a) => !a.startsWith('--'))
  const projectName = positionalArgs[0]

  if (!projectName) {
    console.error('Usage: create-theo <project-name> [--template=name]')
    console.error('')
    console.error('Example:')
    console.error('  npx create-theo my-app')
    console.error('  npx create-theo my-app --template=dashboard')
    process.exit(1)
  }

  // Parse --template flag
  const templateFlag = args.find((a) => a.startsWith('--template='))
  const templateName = templateFlag ? templateFlag.split('=')[1] : 'default'

  const targetDir = resolve(process.cwd(), projectName)

  try {
    console.log(`\nCreating Theo project "${projectName}" (template: ${templateName})...\n`)

    scaffold(targetDir, projectName, templateName)

    const pkgManager = detectPkgManager()
    console.log(`Installing dependencies with ${pkgManager}...\n`)
    runInstall(targetDir, pkgManager)

    console.log(`\n  ✓ Project created at ${targetDir}\n`)
    console.log(`  Next steps:\n`)
    console.log(`    cd ${projectName}`)
    console.log(`    ${pkgManager === 'npm' ? 'npx' : pkgManager} theo dev\n`)
  } catch (err) {
    console.error(`\n  ✗ ${(err as Error).message}\n`)
    process.exit(1)
  }
}

// Auto-execute when run as script
main()
