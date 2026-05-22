import { resolve } from 'node:path'

import { runInstall } from './install.js'
import { detectPkgManager } from './pkg-manager.js'
import { assertNodeVersion } from './preflight-node.js'

import { scaffold } from './index.js'

export function main(): void {
  // Preflight FIRST — refuses to write any files if Node is below the SDK floor.
  // SDK requires Node ≥ 22.12; cryptic node:sqlite ABI errors otherwise.
  try {
    assertNodeVersion(process.version)
  } catch (err) {
    console.error('')
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const positionalArgs = args.filter((a) => !a.startsWith('--'))
  const projectName = positionalArgs[0]

  if (!projectName) {
    console.error('Usage: create-theokit <project-name> [--template=name] [--bare]')
    console.error('')
    console.error('Example:')
    console.error('  npx create-theokit my-app')
    console.error('  npx create-theokit my-app --template=dashboard')
    console.error('  npx create-theokit my-app --bare    (skip @usetheo/ui defaults)')
    process.exit(1)
  }

  // Parse --template flag
  const templateFlag = args.find((a) => a.startsWith('--template='))
  const templateName = templateFlag ? templateFlag.split('=')[1] : 'default'

  // Parse --bare flag (only applies to default template)
  const bare = args.includes('--bare')

  const targetDir = resolve(process.cwd(), projectName)

  try {
    const suffix = bare ? ' [--bare: skipping TheoUI defaults]' : ''
    console.log(
      `\nCreating TheoKit project "${projectName}" (template: ${templateName})${suffix}...\n`,
    )

    scaffold(targetDir, projectName, templateName, { bare })

    const pkgManager = detectPkgManager()
    console.log(`Installing dependencies with ${pkgManager}...\n`)
    runInstall(targetDir, pkgManager)

    console.log(`\n  ✓ Project created at ${targetDir}\n`)
    console.log(`  Next steps:\n`)
    console.log(`    cd ${projectName}`)
    console.log(`    ${pkgManager === 'npm' ? 'npx' : pkgManager} theokit dev\n`)
  } catch (err) {
    console.error(`\n  ✗ ${(err as Error).message}\n`)
    process.exit(1)
  }
}

// Auto-execute when run as script
main()
