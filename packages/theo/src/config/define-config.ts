import type { TheoConfig } from './schema.js'

/**
 * Define Theo framework configuration.
 * Identity function — provides type inference for theo.config.ts.
 * Runtime validation happens in loadConfig(), not here.
 */
export function defineConfig(config: Partial<TheoConfig>): Partial<TheoConfig> {
  return config
}
