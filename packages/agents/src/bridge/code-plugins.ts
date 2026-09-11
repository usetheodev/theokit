/**
 * `plugins` here are CODE objects, and the Claude Code format's are filesystem BUNDLES.
 *
 * The word is the same in both vocabularies and the shapes are not. A consumer who read the other
 * product's documentation passed `[{ type: 'local', path: './p' }]`, the compiler accepted it
 * because the parameter was `readonly unknown[]`, and the agent ran with the plugin absent — the
 * typecheck that was supposed to catch it was the thing that let it through.
 *
 * ## What a bundle actually contributes today, measured
 *
 * A bundle DIRECTORY is discovered: `pluginBundleDirs` in `@theokit/sdk` reads `.claude/plugins/*`
 * and `.theokit/plugins/*`, and the `skills/` and `agents/` subdirectories of each are loaded. What
 * is absent is the MANIFEST (`.claude-plugin/plugin.json`), marketplaces, and the format's other
 * contributions — hooks, MCP servers, output styles, LSP servers.
 *
 * So a path-shaped entry is NOT refused because bundles are unsupported. It is refused because this
 * PARAMETER is not how a bundle is declared — dropping one in the directory is — and the refusal
 * says so, because a refusal that does not name where the capability lives sends the reader to a
 * changelog.
 *
 * @internal
 */
import { ConfigurationError } from '../errors.js'

/**
 * The shape this layer registers with the SDK's lifecycle-hook seam.
 *
 * Deliberately structural and minimal: the SDK owns the full `Plugin` contract, and restating it
 * here would be a second declaration to drift from. What this needs to know is the one thing that
 * tells a code plugin from a bundle reference.
 */
/**
 * A code plugin, in any of the three kinds `@theokit/sdk`'s `Plugin` union defines.
 *
 *   `general`         `register(ctx)`     registers tools, commands, hooks
 *   `model-provider`  `profile`           supplies a model provider
 *   `memory`          `createProvider`    supplies a memory adapter
 *
 * The first version of this type required `register`, which accepted the first kind and refused the
 * other two — while the docblock on `AgentBuilder.plugins`, written in the same commit, already
 * described all three. A real consumer found it: on `@theokit/agents@13.0.0` a `model-provider`
 * plugin failed to compile with "Property 'register' is missing". A guard written to refuse the
 * FILESYSTEM-bundle form was refusing two thirds of the CODE form instead.
 *
 * Modelled here as name-plus-one-capability rather than by importing the SDK union, for the reason
 * the module header gives: this layer must not depend on the SDK's value side, and the published
 * floor is `^4.52.1` where the union's shape is not guaranteed identical. The capability keys ARE
 * the discriminator, so the refusal below stays exact.
 */
export type CodePlugin = { readonly name: string } & (
  | { readonly register: (...args: never[]) => unknown }
  | { readonly profile: unknown }
  | { readonly createProvider: (...args: never[]) => unknown }
)

/** The one field each `Plugin` kind carries. Having a name and none of these is not a code plugin. */
const CAPABILITY_KEYS = ['register', 'profile', 'createProvider'] as const

/** Keys that mark an entry as the FILESYSTEM-bundle form rather than a code plugin. */
const BUNDLE_KEYS = ['path', 'type', 'source', 'marketplace'] as const

/**
 * Refuse anything that is not a code plugin, naming what it looks like and where it belongs.
 *
 * @throws ConfigurationError with code `plugins_expects_code_objects`.
 */
export function assertCodePlugins(list: readonly unknown[]): asserts list is readonly CodePlugin[] {
  for (const entry of list) {
    if (isCodePlugin(entry)) continue
    const looksLikeBundle =
      typeof entry === 'object' &&
      entry !== null &&
      BUNDLE_KEYS.some((k) => k in (entry as Record<string, unknown>))
    throw new ConfigurationError(
      looksLikeBundle
        ? "plugins() takes CODE plugins — { name, register } objects registered with the runtime's " +
            'lifecycle seam. The entry given describes a filesystem bundle, which is not declared ' +
            'here: put the bundle in a `plugins/` directory under `.theokit/` or `.claude/`, where ' +
            'its `skills/` and `agents/` are discovered. Note that the manifest ' +
            '(`.claude-plugin/plugin.json`), marketplaces, hooks, MCP servers, output styles and LSP ' +
            'servers are NOT read from a bundle by this runtime.'
        : `plugins() takes { name, register } objects; received ${describe(entry)}.`,
      { code: 'plugins_expects_code_objects' },
    )
  }
}

/** `typeof null` is `"object"`, which is the one case that reads as a plausible plugin. */
function describe(entry: unknown): string {
  return entry === null ? 'null' : typeof entry
}

function isCodePlugin(entry: unknown): entry is CodePlugin {
  if (typeof entry !== 'object' || entry === null) return false
  const candidate = entry as Record<string, unknown>
  if (typeof candidate.name !== 'string') return false
  // `profile` is a plain object, the other two are functions — so this asks whether the key is
  // PRESENT and not undefined, rather than whether it is callable. A narrower check would refuse a
  // model-provider for having the wrong JavaScript type, which is not what makes it a plugin.
  return CAPABILITY_KEYS.some((key) => candidate[key] !== undefined)
}
