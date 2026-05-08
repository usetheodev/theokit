import { resolve } from 'node:path'
import { scaffold } from './index.js'
import { detectPkgManager } from './pkg-manager.js'
import { runInstall } from './install.js'

export function main(): void {
  const args = process.argv.slice(2)
  const projectName = args[0]

  if (!projectName) {
    console.error('Usage: create-theo <project-name>')
    console.error('')
    console.error('Example:')
    console.error('  npx create-theo my-app')
    process.exit(1)
  }

  const targetDir = resolve(process.cwd(), projectName)

  try {
    console.log(`\nCreating Theo project "${projectName}"...\n`)

    scaffold(targetDir, projectName)

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
