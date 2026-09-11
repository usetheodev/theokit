import { TheokitAgentError } from '@theokit/sdk/errors'

/**
 * M9 (theokit-ai-first) — guardrail contract + typed errors.
 *
 * ADR-0040 § D2: guardrails are a HOME/BOUNDARY concern (filter user input before the SDK,
 * filter model output before the client). They REUSE the SDK runtime — this module makes zero
 * LLM calls. A guard reports one of three actions; the pipeline (`pipeline.ts`) enforces them.
 */

/** What a guard decided for a piece of text. */
export type GuardrailAction = 'allow' | 'block' | 'redact'

/**
 * The result of a single guard check.
 * - `allow`  — text passes untouched.
 * - `block`  — the pipeline throws {@link GuardrailViolationError}; the run stops fail-fast.
 * - `redact` — the pipeline replaces the text with {@link GuardrailResult.text} and continues.
 */
export interface GuardrailResult {
  action: GuardrailAction
  /** Human-readable reason — required in spirit for `block`, surfaced in the thrown error. */
  reason?: string
  /** The transformed text — present (and used) only when `action === 'redact'`. */
  text?: string
}

/**
 * A guardrail. A guard MAY inspect input (before the model), output (after the model), or both.
 * A guard that omits a phase hook is skipped for that phase.
 */
export interface Guardrail {
  readonly name: string
  checkInput?(text: string): GuardrailResult | Promise<GuardrailResult>
  checkOutput?(text: string): GuardrailResult | Promise<GuardrailResult>
}

/** Which boundary phase a violation happened in. */
export type GuardrailPhase = 'input' | 'output'

/**
 * A guard declared `redact` and supplied no replacement text.
 *
 * Distinct from {@link GuardrailViolationError} on purpose: that one says the guard REFUSED
 * something, which is a decision working as designed. This says the guard is MALFORMED — it asked
 * for a redaction and gave nothing to redact with, so nothing was redacted.
 *
 * Until B-008 this condition was silent: `pipeline.ts` tested `r.text !== undefined` and moved on, so
 * the caller received the original text and believed a guard had run on it. That is the shape this
 * package's hook engine calls "worse than no hook at all" — a belief in a protection that is not
 * there. Throwing is fail-fast per `rules/error-handling.md § 2`, and the alternative was leaving
 * unredacted output to reach a model because a guard was written wrong.
 *
 * `''` is NOT this case. An empty replacement is a guard choosing to erase everything, which is the
 * strongest redaction available, and treating it as absent would invert the defect.
 */
/**
 * The base every guardrail error shares, so the seams that must treat them alike can do so BY
 * CONSTRUCTION rather than by remembering a list.
 *
 * The list is how B-020 happened. `run-reflective-loop.ts` let `GuardrailViolationError` pass
 * through unwrapped, and its sibling in this same file was not added — so a malformed result was
 * wrapped in a `DelegationError`, whose message interpolates its cause and whose code is on the
 * delegate tool's message allowlist. The guard's name crossed to the model, and a guard DEFECT was
 * reported as a delegation failure.
 *
 * A base is not airtight on its own: a new class can still extend `TheokitAgentError` directly.
 * `tests/unit/a-guardrail-defect-does-not-name-its-guard.test.ts` walks this module's barrel and
 * fails on any exported error class that skipped it. The two together are the construction; either
 * alone is a convention.
 *
 * Abstract because there is nothing to throw at this level — every guardrail failure is one of the
 * specific kinds below, and a bare `GuardrailError` would say only that something guard-shaped
 * happened.
 */
export abstract class GuardrailError extends TheokitAgentError {}

export class MalformedGuardrailResultError extends GuardrailError {
  override readonly name = 'MalformedGuardrailResultError'
  constructor(
    public readonly guardName: string,
    public readonly phase: GuardrailPhase,
  ) {
    super(
      `Guardrail "${guardName}" returned action 'redact' for ${phase} with no replacement text. ` +
        `Nothing was redacted. Supply \`text\` (\`''\` erases), or return 'allow' or 'block'.`,
      {
        code: 'GUARDRAIL_RESULT_MALFORMED',
        // A guard written wrong is not written right on the next attempt.
        isRetryable: false,
      },
    )
  }
}

/**
 * Thrown (fail-fast) when a guard returns `action: 'block'`. Typed per error-handling.md.
 *
 * M80 — extends {@link TheokitAgentError}, not plain `Error`. `isTransientError` is defined over
 * `TheokitAgentError`, so a class outside that hierarchy is INVISIBLE to it and the only recourse
 * left to a consumer is matching on message text — a regex over an eight-level `cause` chain, which
 * is what one actually wrote. `code` is stable across a rename of the class; `isRetryable` is
 * DECLARED rather than defaulted, because a default would be a retry policy nobody chose.
 */
export class GuardrailViolationError extends GuardrailError {
  override readonly name = 'GuardrailViolationError'
  constructor(
    public readonly guardName: string,
    public readonly phase: GuardrailPhase,
    public readonly reason: string,
  ) {
    super(`Guardrail "${guardName}" blocked ${phase}: ${reason}`, {
      code: 'GUARDRAIL_VIOLATION',
      // A blocked prompt is a REFUSAL, not a hiccup. Retrying re-submits the very input a
      // prompt-injection or PII guard just rejected.
      isRetryable: false,
    })
  }
}

/**
 * A text-carrying event arrived with a `content` that is not text.
 *
 * Distinct from the two above on purpose: they say a guard REFUSED something or was WRITTEN WRONG.
 * This says the STREAM is malformed — the event announces itself as text and carries something a
 * guard cannot read.
 *
 * Until B-021 this was silent. Both extractors tested `typeof e.content === 'string'` and returned
 * `undefined` otherwise, which `moderateOutputStream` reads as "this event carries no text" — so the
 * payload was never accumulated, never shown to a guard, and yielded VERBATIM. The failure direction
 * is DELIVER: a guard declared to stop that payload never saw it, and the run reported green.
 *
 * Refused rather than coerced. Coercing would moderate `"[object Object]"` — a guard consulted about
 * a string the model never produced, returning a verdict about nothing, while the real payload rides
 * along underneath. That is the redaction-computed-and-discarded shape with an extra step.
 */
export class UnreadableTextPayloadError extends GuardrailError {
  override readonly name = 'UnreadableTextPayloadError'
  constructor(
    public readonly eventType: string,
    public readonly received: unknown,
  ) {
    super(
      `A "${eventType}" event carried a non-string content (${typeof received}), which no guard ` +
        `can read. It was previously delivered unexamined. Fix the producer, or stop declaring the ` +
        `event as text-carrying.`,
      { code: 'GUARDRAIL_UNREADABLE_PAYLOAD', isRetryable: false },
    )
  }
}

/** Thrown when {@link costGuard}'s cumulative token budget is exceeded. */
/**
 * M80 — extends {@link TheokitAgentError}, not plain `Error`.
 *
 * `isTransientError` is defined over `TheokitAgentError`, so a class outside that hierarchy is
 * INVISIBLE to it and the only recourse left to a consumer is matching on message text — a regex
 * over an eight-level `cause` chain, which is what one actually wrote. `code` is stable across a
 * rename of the class; `isRetryable` is DECLARED rather than defaulted, because a default would be a
 * retry policy nobody chose.
 */
export class CostBudgetExceededError extends GuardrailError {
  override readonly name = 'CostBudgetExceededError'
  constructor(
    public readonly usedTokens: number,
    public readonly maxTokens: number,
  ) {
    super(`Cost budget exceeded: ${usedTokens} > ${maxTokens} tokens`, {
      code: 'COST_BUDGET_EXCEEDED',
      // The budget does not refill on retry; retrying spends the next request against the same
      // exhausted ceiling.
      isRetryable: false,
    })
  }
}
