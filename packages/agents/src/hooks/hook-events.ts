/**
 * What a hook event IS, and how a declared spec parses.
 *
 * Split out of `hook-spec.ts` when that file reached 616 lines against the 600 its alignment brief
 * caps it at (B-002 AC-007). The cut follows a boundary the file already had: this half references
 * nothing below it, and the handler half uses exactly four names from here — a one-directional
 * dependency, which is what made the cut safe rather than merely convenient.
 *
 * The other candidate was the observational half. It references `matches`, which is private — only
 * `__matchesForTests` is exported — so extracting it would have forced that symbol public to satisfy
 * a line count. Trading an invariant for a number is the wrong direction.
 */
import { TheokitAgentError } from '@theokit/sdk/errors'
import { z } from 'zod'

/**
 * The events the seam exposes. Declared here so an unknown one fails loudly at parse.
 *
 * ## What this list cannot cover, and why (B-002 FR-004)
 *
 * There is no event that fires BEFORE the transcript is compacted, and none can be added from this
 * package. Measured 2026-09-12 against `@theokit/sdk@5.5.0`: `HookName` is a closed union —
 * `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`, `on_session_start`,
 * `on_session_end`, `transform_tool_result`, `transform_llm_output`, `pre_user_send`,
 * `post_assistant_reply` — with no compaction member, and `PluginContext.on` keys its callback by
 * that union. A name this package invented would not type-check there, and a name it smuggled past
 * the types would bind to a dispatch that never fires it.
 *
 * The SDK's own auto-compaction path is further out of reach: it is bundle-internal, absent from
 * every emitted `.d.ts` and all 33 export subpaths, and builds its own summarizer at the call site.
 * Even once a hook NAME exists, that path is not a dispatch a consumer can reach.
 *
 * So a consumer who needs to persist state before compaction cannot do it through this list today.
 * `usetheokit/theokit-sdk#653` is the issue that unblocks it — it carries the nine candidate seams
 * that were enumerated and ruled out, so a reader arrives at the reasoning rather than repeating it.
 *
 * `config/context-pressure.ts` MEASURES how close a run is to its window and is the composition
 * point the seam should use when it lands — it must not re-derive the ratio.
 */
export const HOOK_EVENTS = [
  'pre_tool_call',
  'post_tool_call',
  'transform_tool_result',
  'transform_llm_output',
  'on_session_start',
  'on_session_end',
  'pre_user_send',
  'post_assistant_reply',
] as const

export type HookEvent = (typeof HOOK_EVENTS)[number]

/** Default per-hook wall clock, measured from the consumer this was ported from. */
export const DEFAULT_HOOK_TIMEOUT_MS = 30_000

/**
 * How many times a hook may feed its own output back into the turn.
 *
 * Without a ceiling a hook that reacts to its own effect loops forever, burning tokens on every
 * pass. Three is the consumer's measured default.
 */
export const DEFAULT_CONTINUATION_BUDGET = 3

/**
 * One declared hook.
 *
 * `.strict()` on purpose: an unknown KEY is a typo in a security-relevant file, and silently
 * ignoring it means the operator believes they configured something they did not.
 */
export const hookSpecSchema = z
  .object({
    event: z.enum(HOOK_EVENTS),
    command: z
      .string()
      .min(1)
      // Control characters cannot appear in a command: they are invisible in an approval prompt,
      // so a command that LOOKS like `npm test` could carry anything after a carriage return. This
      // is also what makes the fingerprint's record separator unambiguous.
      //
      // The rule below is right that control characters in a pattern are usually a typo. Here they
      // are the subject: matching them IS the check.
      // eslint-disable-next-line no-control-regex -- see above
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
        message: 'command contains control characters that would be hidden in the approval dialog',
      }),
    /** Selector for which tools/messages this fires on. Absent means all. */
    matcher: z.string().optional(),
    timeout_ms: z.number().int().positive().default(DEFAULT_HOOK_TIMEOUT_MS),
  })
  .strict()

export type HookSpec = z.infer<typeof hookSpecSchema>

/** Raised when a spec cannot be parsed. Typed so a caller distinguishes it from an IO failure. */
/**
 * M80 — extends {@link TheokitAgentError}, not plain `Error`.
 *
 * This one is mine, from M75, and it was in the offending list: `isTransientError` is defined over
 * `TheokitAgentError`, so a class outside that hierarchy is invisible to it.
 */
export class HookSpecError extends TheokitAgentError {
  override readonly name = 'HookSpecError'
  constructor(message: string) {
    super(message, {
      code: 'HOOK_SPEC_INVALID',
      // A typo in a config file is not a transient condition.
      isRetryable: false,
    })
  }
}

/**
 * Parse declared hooks, failing high on an unknown event.
 *
 * Failing rather than skipping: a hook whose event name is misspelled never fires, and a silent skip
 * means the operator believes a guard is in place when nothing is. That belief is worse than no
 * hook at all — it is the failure mode `G10` (honest enforcement) exists to forbid.
 */
export function parseHookSpecs(input: unknown): HookSpec[] {
  const parsed = z.array(hookSpecSchema).safeParse(input)
  if (!parsed.success) {
    throw new HookSpecError(
      `invalid hook configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    )
  }
  return parsed.data
}
