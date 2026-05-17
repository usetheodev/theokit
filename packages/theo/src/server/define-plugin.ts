import type { TheoPlugin } from './plugin-types.js'

/**
 * Identity function for defining a Theo plugin.
 * Provides type-checking against the TheoPlugin interface without runtime cost.
 */
export function defineTheoPlugin(plugin: TheoPlugin): TheoPlugin {
  return plugin
}
