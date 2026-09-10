/**
 * B-001 — why three declared hook events produce no handler, as data rather than prose.
 *
 * ## The defect this closes
 *
 * `buildHookHandlers` warns that an unwired event's handler "does not exist **yet**". Measured
 * 2026-09-10 against `@theokit/sdk` 4.52.1, "yet" is wrong for two of the three and misleading for
 * the third:
 *
 * - `transform_llm_output` — `Guardrail.checkOutput` returning `action: 'redact'` already replaces
 *   model output and continues (`../guardrails/types.ts`). Wiring the hook would be a second door
 *   to one room.
 * - `pre_user_send` — `createToolHooksPlugin({ processInput })` already registers on this event
 *   (`../bridge/tool-hooks-plugin.ts`) and contributes text before the model. It is additive by
 *   design: the SDK exposes no raw-prompt mutation to plugins.
 * - `on_session_end` — nothing covers it, and wiring it would not help. The handler's own type
 *   returns `void` (`../bridge/hook-handlers.ts`), so it cannot refuse an ending. A consumer needing
 *   to BLOCK a session is not waiting for work; the capability is absent.
 *
 * So the message sent people to wait for work that will not come, and never named where the
 * capability already lived.
 *
 * ## Why a module and not a docblock
 *
 * `hook-spec.ts` is over the 500-line budget. More importantly, prose cannot be asserted: every
 * claim above is pinned by `tests/unit/unwired-events.test.ts`, which exercises each seam rather
 * than trusting this comment. A claim about a seam that nobody ran is the asserted mechanism this
 * repository refuses everywhere else.
 */
import type { HookEvent, WiredEvent } from './hook-spec.js'

/**
 * The events that reach the warning path: everything the schema declares minus everything the
 * builder wires. Derived, never listed — a second hand-maintained list is the drift this module
 * exists to prevent.
 */
export type UnwiredEvent = Exclude<HookEvent, WiredEvent>

/** An event the schema accepts and this engine does not wire, and what to reach for instead. */
export interface UnwiredEventReason {
  /**
   * The identifier a consumer types to get the capability, or `null` when nothing delivers it.
   *
   * Nullable rather than optional on purpose: `null` is a measured claim ("no seam covers this"),
   * while an absent field would be indistinguishable from an entry somebody forgot to finish.
   */
  readonly seam: string | null
  /** Why — what the seam does, or why nothing can. One sentence; it ends up in a terminal. */
  readonly reason: string
}

/**
 * TOTAL over `UnwiredEvent`, and that totality is the whole mechanism.
 *
 * The first version of this module typed it `Partial<Record<HookEvent, …>>` and paid for it twice:
 * an entry could exist for a wired event, so a runtime function had to detect that, so a test had to
 * cover the detector — and the test turned out to be a tautology that could not fail. Review proved
 * it by corrupting the record and watching the suite stay green.
 *
 * `Record<UnwiredEvent, …>` deletes all three layers. Wiring an event without removing its reason is
 * `TS2353`; un-wiring one without adding a reason is `TS2741`. Both directions are compile errors,
 * caught before anything runs, by the compiler rather than by a guard somebody has to trust.
 */
export const UNWIRED_EVENT_REASONS: Readonly<Record<UnwiredEvent, UnwiredEventReason>> =
  Object.freeze({
    transform_llm_output: Object.freeze({
      seam: 'Guardrail.checkOutput',
      reason: "returning action 'redact' replaces the model's text and continues",
    }),
    pre_user_send: Object.freeze({
      seam: 'createToolHooksPlugin({ processInput })',
      reason: 'contributes text before the model, additively',
    }),
    on_session_end: Object.freeze({
      seam: null,
      reason: 'no seam delivers this: the handler returns void and cannot refuse an ending',
    }),
  })

/**
 * The tail of the "will NOT fire" warning for one event.
 *
 * Still guards the missing entry, and the reason is worth stating because the type now says it
 * cannot happen: `buildHookHandlers` reaches this with a `HookEvent`, and narrowing it to
 * `UnwiredEvent` at the call site would need a runtime check anyway. This runs inside the code path
 * whose job is to WARN, so degrading to the generic tail beats crashing while reporting a non-fatal
 * condition (`rules/error-handling.md § 2` — an unknown event is recoverable).
 *
 * `reasons` is a parameter so a test can drive the fallback with synthetic data. The first version
 * read the module global, and the branch went untested for exactly that reason.
 */
export function unwiredEventAdvice(
  event: HookEvent,
  reasons: Readonly<Partial<Record<HookEvent, UnwiredEventReason>>> = UNWIRED_EVENT_REASONS,
): string {
  const entry = reasons[event]
  if (entry === undefined) return 'the handler does not exist yet.'
  return entry.seam === null ? `${entry.reason}.` : `use ${entry.seam} instead: ${entry.reason}.`
}
