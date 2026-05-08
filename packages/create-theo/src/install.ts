import spawn from 'cross-spawn'
import type { PkgManager } from './pkg-manager.js'

export function runInstall(cwd: string, pkgManager: PkgManager): void {
  const result = spawn.sync(pkgManager, ['install'], {
    cwd,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error(`Failed to install dependencies with ${pkgManager}`)
  }
}
