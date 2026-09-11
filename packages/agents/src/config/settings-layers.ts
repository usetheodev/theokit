/**
 * B-067 — the settings precedence stack, NAMED.
 *
 * `@theokit/sdk` ships the mechanism and deliberately not the vocabulary: `foldLayers` folds an
 * array of `{ layer, precedence?, values }`, `verifyLayerOrdering` refuses a chain that contradicts
 * itself, and `DeclaredLayer.layer` is a free-form `string` whose `precedence` is optional. That is
 * the right shape for a library — it cannot know what layers a consumer has — and it leaves one
 * thing undecided that two consumers must agree on: WHICH layers exist, and in what order.
 *
 * Until this file, they did not agree, and nothing could tell. Two products could each invent their
 * own names and numbers, fold in opposite orders, and both pass `verifyLayerOrdering`, because a
 * chain is only checked against itself. B-026 named three levels — managed settings above the
 * project file above `defineAgent()` — for the four keys the operator policy carries; a consumer
 * implementing a fifth key had nothing to consult and invented an order that type-checked.
 *
 * ## The order, and where it comes from
 *
 * The five file levels and their order are the format's, measured against
 * <https://code.claude.com/docs/en/settings> on 2026-09-11 (highest first there, lowest first here):
 * managed settings, command line, project local, shared project, user. `code` is added below all of
 * them and is ours: a value passed to `defineAgent()` is the weakest thing in the system, because
 * every file above it is editable by a human who did not write the code and is answerable for what
 * the agent does on their machine.
 *
 * That ordering is the whole operator tier in one line. Reversing any pair of it — letting a project
 * file outrank managed settings, or code outrank a file — turns the tier into a suggestion.
 *
 * ## Why this is here and not in the SDK
 *
 * Same reason as `operator-policy.ts` beside it: this package depends on a PUBLISHED
 * `@theokit/sdk`, so a symbol added to that package's source is not importable here until somebody
 * cuts a release. The names and the order are the contract, and they are stated where the consumer
 * that needs them can reach them today. What must not drift is the ORDER, which is the format's and
 * not ours to change.
 */
import type { DeclaredLayer, LayerValues } from '@theokit/sdk'

/**
 * Every layer that can supply a setting, named.
 *
 * A union rather than a string, so adding one is a compile-time event everywhere a layer is handled
 * — the property `DeclaredLayer.layer: string` cannot give, and the reason this file exists.
 */
export type SettingsLayer =
  /** Values passed to `defineAgent()` / the builder. The weakest: code loses to every file. */
  | 'code'
  /** `~/.claude/settings.json` — you, in every project. */
  | 'user'
  /** `.claude/settings.json` — everyone in the project. */
  | 'project-shared'
  /** `.claude/settings.local.json` — you, in this project. */
  | 'project-local'
  /** `claude --settings` — you, in this session. */
  | 'command-line'
  /** `managed-settings.json`, MDM, or the console. Your organisation. A project cannot widen it. */
  | 'managed'

/**
 * The FILE layers, lowest precedence first — the array `foldLayers` is given.
 *
 * `code` is deliberately absent: it is not a settings file, it is the value the caller passed, and a
 * chain that folded it as a peer would invite somebody to place it above one. {@link settingsLayerChain}
 * puts it at the bottom, which is the only position it has.
 *
 * The numbers are spaced by ten so a level can be inserted between two without renumbering the
 * stack — a renumber is exactly the kind of edit that silently reorders a fold somewhere else.
 */
export const SETTINGS_LAYERS = [
  { layer: 'user', precedence: 10 },
  { layer: 'project-shared', precedence: 20 },
  { layer: 'project-local', precedence: 30 },
  { layer: 'command-line', precedence: 40 },
  { layer: 'managed', precedence: 50 },
] as const satisfies readonly (DeclaredLayer & { layer: SettingsLayer })[]

/** `code` sits below every file, and is not a member of {@link SETTINGS_LAYERS}. */
const CODE_PRECEDENCE = 0

/**
 * Compile-time exhaustiveness: a layer added to {@link SettingsLayer} without a position here makes
 * this line fail to compile.
 *
 * The same gate `capability-zero-behavior.test.ts` puts on the compiled-options waist, for the same
 * reason — a new member that nobody placed is a member somebody will place at random, once, in the
 * file where they happened to need it.
 */
type Positioned = (typeof SETTINGS_LAYERS)[number]['layer'] | 'code'
type _Exhaustive =
  Exclude<SettingsLayer, Positioned> extends never ? true : ['unpositioned settings layer']
export const LAYERS_ARE_POSITIONED: _Exhaustive = true

/** The precedence of a layer. Higher wins. */
export function layerPrecedence(layer: SettingsLayer): number {
  if (layer === 'code') return CODE_PRECEDENCE
  const found = SETTINGS_LAYERS.find((l) => l.layer === layer)
  // Unreachable while `_Exhaustive` compiles; thrown rather than defaulted because a layer with no
  // declared position must not silently fold as zero and quietly outrank nothing.
  if (!found) throw new Error(`settings layer has no declared precedence: ${layer}`)
  return found.precedence
}

/**
 * Build the `foldLayers` input from values keyed by layer name.
 *
 * Sorted by declared precedence rather than by the object's key order, because an object literal's
 * order is the author's typing order and folding by it would make precedence depend on where
 * somebody happened to add a line. Layers with no values are omitted: a layer that supplies nothing
 * and a layer that does not exist fold identically, and inventing an empty entry for the first would
 * make the chain longer without making it truer.
 */
export function settingsLayerChain(
  values: Partial<Record<SettingsLayer, Readonly<Record<string, unknown>>>>,
): LayerValues[] {
  // The entries are typed as POSSIBLY undefined, which is what `Partial` means and what the caller
  // can actually pass. An earlier draft cast the undefined away and then had to keep a filter the
  // types said was dead — `no-unnecessary-condition` was right about the code and wrong about the
  // world, because the cast was the lie. Typed honestly, the filter is necessary and the lint agrees.
  const entries = Object.entries(values) as [SettingsLayer, Record<string, unknown> | undefined][]
  return entries
    .filter((e): e is [SettingsLayer, Record<string, unknown>] => e[1] !== undefined)
    .map(([layer, v]) => ({ layer, precedence: layerPrecedence(layer), values: v }))
    .sort((a, b) => a.precedence - b.precedence)
}
