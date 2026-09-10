/**
 * M9 (theokit-ai-first) — the guardrail pipeline: apply guards in order at a boundary phase.
 *
 * Fail-fast (error-handling.md): a `block` throws {@link GuardrailViolationError} immediately, and a
 * `redact` with no replacement throws {@link MalformedGuardrailResultError} — B-008, where that case
 * used to pass the original text through in silence. A well-formed `redact` threads its replacement
 * into the next guard. Independent of the SDK runtime — this runs at the framework boundary.
 */
import { type Guardrail, GuardrailViolationError, MalformedGuardrailResultError } from './types.js'
import type { GuardrailPhase } from './types.js'

/**
 * The whole pipeline, once. Both exported functions are this with a different phase.
 *
 * They used to be two near-identical bodies, and B-008's brief asked for a test proving they behave
 * identically. One function is stronger than that test: there is no second body to drift. It is also
 * why the defect existed in two places — the same three lines, fixed twice or not at all.
 */
async function runGuards(
  text: string,
  guards: readonly Guardrail[],
  phase: GuardrailPhase,
): Promise<string> {
  const check = phase === 'input' ? 'checkInput' : 'checkOutput'
  let current = text
  for (const g of guards) {
    const fn = g[check]
    if (!fn) continue
    // `.call(g, …)`, not `fn(…)`. Extracting the method from the object loses `this`, and the
    // interface INVITES the style that needs it: `checkInput?(text: string)` is declared in method
    // syntax, so keeping a regex or a PII list on the instance is the natural way to write a guard.
    // Under a bare call those became `TypeError: Cannot read properties of undefined` — an error
    // outside the TheokitAgentError hierarchy, invisible to isTransientError, presenting as a
    // framework bug rather than the guard's. Found by review; the suite could not see it because no
    // test in the repository writes a guard that uses `this`.
    const r = await fn.call(g, current)
    if (r.action === 'block') {
      throw new GuardrailViolationError(g.name, phase, r.reason ?? 'blocked')
    }
    if (r.action === 'redact') {
      // `undefined`, not falsiness: `''` is a guard erasing everything, which is a real redaction.
      if (r.text === undefined) throw new MalformedGuardrailResultError(g.name, phase)
      current = r.text
    }
  }
  return current
}

/**
 * Run every guard's `checkInput` in order against `text`. Returns the (possibly redacted) text.
 * Throws on the first `block`, or on a `redact` that supplies no replacement. Guards without
 * `checkInput` are skipped.
 */
export async function runInputGuards(text: string, guards: readonly Guardrail[]): Promise<string> {
  return runGuards(text, guards, 'input')
}

/**
 * Run every guard's `checkOutput` in order against `text`. Returns the (possibly redacted) text.
 * Throws on the first `block`, or on a `redact` that supplies no replacement. Guards without
 * `checkOutput` are skipped.
 */
export async function runOutputGuards(text: string, guards: readonly Guardrail[]): Promise<string> {
  return runGuards(text, guards, 'output')
}
