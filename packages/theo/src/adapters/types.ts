import type { TheoConfig } from '../config/schema.js'

export interface DeployAdapter {
  name: string
  build(config: TheoConfig, cwd: string): Promise<void>
}

export type BuildTarget = 'node' | 'vercel' | 'cloudflare'

export const VALID_TARGETS: BuildTarget[] = ['node', 'vercel', 'cloudflare']
