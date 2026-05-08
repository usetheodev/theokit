export type PkgManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function detectPkgManager(): PkgManager {
  const ua = process.env.npm_config_user_agent ?? ''
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('bun')) return 'bun'
  return 'npm'
}
