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
import type { HookEvent } from './hook-spec.js'

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
 * Keyed by `HookEvent`, never by `string`: `Record<string, …>` would let a misspelled
 * `on_sesion_end` compile and sit here looking correct while the real event fell through. This
 * package refuses that class of mistake at compile time everywhere else — `.build()` without
 * `.model()` is a compile error — and a lookup table is no place to start making exceptions.
 *
 * `Partial` because the wired events legitimately have no entry; `unmappedEvents` is what keeps
 * the two sets honest.
 */
export const UNWIRED_EVENT_REASONS: Readonly<Partial<Record<HookEvent, UnwiredEventReason>>> =
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
 * The events whose wiring and reason disagree — in either direction.
 *
 * Pure, and taking its three inputs as arguments, so a test can drive it with synthetic sets. The
 * alternative was mutating the module-level `WIRED_EVENTS`, which leaks into every other test in
 * the run (`rules/testing.md § 3` — no shared mutable state, no order dependency).
 *
 * Two directions matter and only one is obvious:
 * - declared, unwired, and carrying no reason — a consumer gets the old vague message;
 * - carrying a reason while actually wired — the reason is stale and tells a consumer to go
 *   somewhere they no longer need to go.
 */
export function unmappedEvents(
  declared: readonly HookEvent[],
  wired: ReadonlySet<HookEvent>,
  reasons: Readonly<Partial<Record<HookEvent, UnwiredEventReason>>>,
): readonly HookEvent[] {
  const missingReason = declared.filter((event) => !wired.has(event) && !(event in reasons))
  const staleReason = declared.filter((event) => wired.has(event) && event in reasons)
  return [...missingReason, ...staleReason]
}

/**
 * The tail of the "will NOT fire" warning for one event.
 *
 * Returns the generic tail when the event has no entry. That fallback is the whole point: this runs
 * inside the code path whose job is to warn, and an unmapped event is recoverable
 * (`rules/error-handling.md § 2`). Dereferencing `undefined` here would crash while reporting a
 * non-fatal condition — strictly worse than the vague message being replaced.
 */
export function unwiredEventAdvice(event: HookEvent): string {
  const entry = UNWIRED_EVENT_REASONS[event]
  if (entry === undefined) return 'the handler does not exist yet.'
  return entry.seam === null ? `${entry.reason}.` : `use ${entry.seam} instead: ${entry.reason}.`
}
