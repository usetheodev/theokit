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
export class MalformedGuardrailResultError extends TheokitAgentError {
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
export class GuardrailViolationError extends TheokitAgentError {
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
export class CostBudgetExceededError extends TheokitAgentError {
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
