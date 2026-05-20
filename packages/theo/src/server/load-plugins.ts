import { PluginRunner } from './plugin-runner.js'
import type { TheoPlugin } from './plugin-types.js'

export class InvalidPluginShapeError extends Error {
  constructor(index: number, reason: string) {
    super(`plugins[${index}] is not a valid TheoPlugin: ${reason}`)
    this.name = 'InvalidPluginShapeError'
  }
}

function isPlugin(value: unknown, index: number): value is TheoPlugin {
  if (value == null || typeof value !== 'object') {
    throw new InvalidPluginShapeError(index, 'expected an object')
  }
  const v = value as Record<string, unknown>
  if (typeof v.name !== 'string' || v.name.length === 0) {
    throw new InvalidPluginShapeError(index, 'missing "name" string')
  }
  if (typeof v.register !== 'function') {
    throw new InvalidPluginShapeError(index, 'missing "register" function')
  }
  return true
}

/**
 * Build a PluginRunner from a list of plugins typically declared in
 * `theo.config.ts` under the `plugins` field. Returns `undefined` when no
 * plugins are configured so callers can pass `undefined` to `executeRoute`
 * and preserve the zero-overhead path.
 */
export async function createPluginRunnerFromConfig(
  plugins: unknown,
): Promise<PluginRunner | undefined> {
  if (plugins == null) return undefined
  if (!Array.isArray(plugins)) return undefined
  if (plugins.length === 0) return undefined

  const runner = new PluginRunner()
  const pluginsArray: unknown[] = plugins
  for (let i = 0; i < pluginsArray.length; i++) {
    const candidate: unknown = pluginsArray[i]
    if (!isPlugin(candidate, i)) {
      // Unreachable in practice — `isPlugin` throws on invalid input.
      // The branch exists to narrow `candidate` to TheoPlugin below.
      continue
    }
    await runner.register(candidate)
  }
  return runner
}
