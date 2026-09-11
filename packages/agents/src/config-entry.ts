/**
 * The `@theokit/agents/config` subpath — agent configuration, trust, and the instruction tree.
 *
 * ## Why these modules live here and not in `theokit`
 *
 * They used to be reachable only through `theokit/server`, a barrel that announces its own removal
 * on first import. That is worse than an absent capability: a builder finds it, reads that it is
 * going away, and writes their own anyway. And the package holding it is the WEB framework — an
 * agent builder installs `@theokit/agents` and may never install `theokit` at all. The only real
 * consumer of this layer has four packages and none of them depends on `theokit`.
 *
 * The cost of that was measured, not hypothesised. Because `loadInstructionTree` was unreachable,
 * a downstream product rewrote 533 lines of instruction-tree loading — and in rewriting it
 * reintroduced the symlink-containment hole that `assertNoSymlinkEscape` exists to close: with
 * `rootDir='/'`, any file on the machine became readable into the system prompt.
 *
 * Absorbing a consumer's module means absorbing its scar tissue, not just its interface. Keeping
 * these behind a deprecated door in the wrong package meant nobody inherited either.
 *
 * ## Direction
 *
 * `theokit` depends on `@theokit/agents`, never the reverse (G1). Moving the modules DOWN preserves
 * that: `theokit/server` now re-exports from here, so its consumers keep working for the one minor
 * cycle it promised, and new consumers import from the package they already have.
 */
export {
  LayeredConfig,
  LayerOutOfOrderError,
  type ConfigLayer,
  type LayeredConfigInput,
  type LayeredConfigResult,
  type PrecedenceReport,
  type ProvenancePerKey,
} from './config/layered-config.js'

export { TrustStore, TrustStorePermissionsError, type TrustRecord } from './config/trust-store.js'

/**
 * The `@file.md` expansion, reachable on its own.
 *
 * `loadInstructionTree` uses it, but the WALK and the EXPANSION are separate capabilities and only
 * one of them is universal. A product whose convention is to climb from the working directory to the
 * git root — the ancestor chain, not the subtree — needs its own walk and the same expansion. Ours
 * shipped fused to the descent, so that product kept a hand-written copy of the expansion.
 *
 * Exported after measuring exactly that: the first version of this feature landed inside the loader
 * and reachable only through it, which is the defect this whole cycle is about, committed while
 * fixing it.
 */
export { expandInstructionImports, type ExpandImportsInput } from './config/instruction-imports.js'

export {
  blockAppliesTo,
  loadInstructionTree,
  type InstructionBlock,
  type InstructionTree,
  type InstructionTreeBudget,
  type LoadInstructionTreeInput,
} from './config/instruction-tree.js'

export {
  composeInstructions,
  type ComposeInstructionsOptions,
  type ComposedInstructions,
  type InstructionSource,
} from './config/compose-instructions.js'

export {
  loadCustomCommands,
  type CustomCommand,
  type CustomCommandsResult,
  type LoadCustomCommandsInput,
} from './config/custom-commands.js'

// T3.3 — the other half of a custom command. `loadCustomCommands` above reads the file and its
// frontmatter; this interprets the body it returns. Exported next to it because a consumer that has
// one and not the other has to write the missing half, which is precisely what happened.
export {
  expandCommandTemplate,
  templateHints,
  FILE_INLINE_CAP,
  type ShellResult,
  type TemplateDeps,
} from './config/command-template.js'

/**
 * B-067 — the settings precedence stack, named.
 *
 * Exported because the defect it fixes is DISAGREEMENT BETWEEN CONSUMERS, and a vocabulary nobody
 * can import cannot be agreed on. The SDK's `foldLayers` takes any string with any number; these are
 * the names and the order this ecosystem folds by, so two products reach the same answer instead of
 * two internally-consistent different ones.
 *
 * A test importing it is not a consumer — the same rule the dead-code auditor applies to a declared
 * public surface. The door is the export.
 */
export {
  LAYERS_ARE_POSITIONED,
  SETTINGS_LAYERS,
  layerPrecedence,
  settingsLayerChain,
  type SettingsLayer,
} from './config/settings-layers.js'

export { frontmatterValue, splitFrontmatter, type ParsedFrontmatter } from './config/frontmatter.js'

export {
  DEFAULT_CONTEXT_PRESSURE_THRESHOLDS,
  ContextPressureThresholdError,
  contextPressure,
  effectiveContextWindow,
  type ContextPressure,
  type ContextPressureThresholds,
} from './config/context-pressure.js'

/**
 * `loadEnv` deliberately did NOT move, and the reason is worth stating rather than leaving as an
 * absence someone re-derives later.
 *
 * It needs `dotenv` + `dotenv-expand`, which are dependencies of the web package. Moving it would
 * add two runtime dependencies to EVERY `@theokit/agents` install, for a capability an agent builder
 * mostly does not want — `.env` loading is a web-app concern, and it has five consumers inside
 * `theokit` and none here. The measured damage that motivated this subpath (a consumer rewriting
 * 533 lines of instruction-tree loading and reintroducing a symlink-containment hole) was in the
 * instruction tree, not in env parsing.
 *
 * It stays reachable from `theokit/server` for the consumers that actually have it.
 */
