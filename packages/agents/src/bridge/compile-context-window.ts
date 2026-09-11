/**
 * M8-1 — compile `@ContextWindow` metadata into the SDK's `ContextSettings`.
 *
 * Per sdk-runtime.md, the SDK owns session/transcript storage + compaction.
 * The bridge therefore maps the one knob the SDK natively exposes as a budget —
 * `maxTokens` → `ContextSettings.maxTokens` — and reports the strategy knobs that
 * have NO native `AgentOptions` equivalent (`compactionStrategy`, `preserveLastN`,
 * `preserveToolResults`, `preserveSystemPrompt`). Those are surfaced as
 * `metadataOnlyKnobs` so the walk can emit an honest `metadata-only` warning
 * (ADR D2) instead of silently dropping them (G10 — honest enforcement).
 */
import type { ContextSettings } from '@theokit/sdk'

// `ContextCompactionStrategy` used to live here, enumerating exactly the four strategy knobs
// (`truncate-oldest` | `summarize-oldest` | `sliding-window` | `priority-based`). M74 REMOVED those
// knobs rather than implementing them, and the type outlived them: a published name for four values
// no code could ever produce. Deleted in M76 when knip named it — leftover vocabulary from a deletion
// is worse than none, because a reader finds it and believes the capability exists.

/**
 * M53 — declared here, with its conversion, instead of on the decorator being deleted.
 */
export interface ContextWindowOptions {
  /** Maximum tokens before compaction triggers. */
  maxTokens?: number
  /**
   * Per-file truncation cap in CHARACTERS (SDK default 40 000, ~10k tokens). Larger files are
   * truncated head/tail with a marker.
   *
   * Reachable here because the surface that turns instruction discovery on is the same surface that
   * decides when an instruction file gets cut: a 60 000-character `CLAUDE.md` was silently
   * truncated to 40 000, and the only knob on offer was named after tokens.
   */
  maxBytesPerFile?: number
  /**
   * Aggregate cap across all context files in CHARACTERS (SDK default 120 000). Past it,
   * lower-priority sources are DROPPED — not truncated.
   */
  maxBytesTotal?: number
}

/**
 * ## Declaring this is ALSO what turns instruction discovery on
 *
 * The name says compaction and the doc comment above says compaction, and both are true — but they
 * are not the whole effect. The SDK builds its `FileContextManager` only under
 * `if (options.context !== undefined)`, and `ContextWindowCapability` is the only place this layer
 * sets that field. So:
 *
 * - declare `@ContextWindow(...)` → `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules` and
 *   `.theokit/rules` are discovered;
 * - omit it → every one of those files is inert, with no warning.
 *
 * A consumer debugging "why is my CLAUDE.md ignored" has no path from that symptom back to a
 * decorator named after a token budget, which is why this is written here rather than only in a
 * backlog item. Pinned by `tests/unit/the-context-knob-is-also-the-discovery-switch.test.ts`; if
 * discovery ever gains its own switch, that test goes red and this section should go with it.
 *
 * `ContextSettings.maxBytesPerFile` and `maxBytesTotal` ARE reachable from this surface. They were
 * not, and the gap mattered here more than anywhere else: the option that enables `CLAUDE.md`
 * discovery is the same option that decides at which size a `CLAUDE.md` gets truncated (40 000
 * characters by default) or dropped (120 000 aggregate). Pinned by
 * `tests/unit/the-byte-caps-are-reachable.test.ts`.
 */

/**
 * M74 — the four strategy knobs were REMOVED, not implemented.
 *
 * `compactionStrategy`, `preserveSystemPrompt`, `preserveLastN` and `preserveToolResults` had no
 * native SDK mapping and were reported as `metadata-only` — honest, and still surface that teaches
 * the wrong thing: a knob a caller can set and that never does anything reads as a feature.
 *
 * Implementing them was considered and rejected on measurement, not on principle.
 * `resolveCompactionStrategy` DOES exist in this package (`loop/compaction-strategy.ts`, delegating
 * to the SDK's `compactTranscript`) — but it speaks a different vocabulary: one named strategy
 * (`token-budget`) parameterised by `keepTokens`. Mapping four invented strategy names onto it would
 * not be implementing the knobs; it would be inventing semantics and shipping them under names that
 * promise something else. That is worse than the honest warning it replaces.
 *
 * The working surface for compaction is `AgentRunner.compaction` / `resolveCompactionStrategy`,
 * where the app supplies its own summarizer and decides WHEN to compact — per ADR D1, because the
 * SDK owns per-turn context.
 *
 * Nothing passed these knobs: measured across `packages`, `tests`, `fixtures` and `examples`, zero
 * call sites.
 */

/** `@ContextWindow` knobs with no native SDK `AgentOptions` mapping. */
const STRATEGY_KNOBS = [
  'compactionStrategy',
  'preserveLastN',
  'preserveToolResults',
  'preserveSystemPrompt',
] as const

export interface CompiledContextWindow {
  /** SDK-shaped context budget passed to `Agent.create({ context })`. */
  context: ContextSettings
  /** Declared knobs the SDK does not expose — reported, never silently dropped. */
  metadataOnlyKnobs: string[]
}

export function compileContextWindow(options: ContextWindowOptions): CompiledContextWindow {
  const context: ContextSettings = {}
  if (typeof options.maxTokens === 'number') {
    context.maxTokens = options.maxTokens
  }
  // Only what was declared. Writing all three keys unconditionally would override the SDK's own
  // defaults for every agent that never asked about bytes.
  if (typeof options.maxBytesPerFile === 'number') {
    context.maxBytesPerFile = options.maxBytesPerFile
  }
  if (typeof options.maxBytesTotal === 'number') {
    context.maxBytesTotal = options.maxBytesTotal
  }

  const opts = options as Record<string, unknown>
  const metadataOnlyKnobs = STRATEGY_KNOBS.filter((knob) => opts[knob] !== undefined)

  return { context, metadataOnlyKnobs }
}
