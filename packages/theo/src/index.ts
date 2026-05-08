// Config
export { defineConfig } from './config/define-config.js'
export { loadConfig } from './config/load-config.js'
export { theoConfigSchema } from './config/schema.js'
export type { TheoConfig } from './config/schema.js'
export { TheoConfigError } from './config/errors.js'
export type { ConfigIssue } from './config/errors.js'

// Core
export { validateProjectStructure } from './core/validate-structure.js'
export { TheoProjectError } from './core/errors.js'
