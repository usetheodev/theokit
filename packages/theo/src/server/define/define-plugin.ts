import type { TheoPlugin } from '../plugin-types.js'

/**
 * Identity function for defining a Theo plugin.
 *
 * **Note:** Prefer `definePlugin` (shorter, canonical name per ADR-0008 D6).
 * Both functions are identical — `defineTheoPlugin` is kept as an alias for
 * existing in-tree consumers without forcing a migration sweep.
 */
export function defineTheoPlugin(plugin: TheoPlugin): TheoPlugin {
  return plugin
}
