/**
 * B-008 — a guard that declares `redact` and supplies no replacement.
 *
 * `GuardrailResult.text` is optional, so this compiles and reads like a working guard. Until this
 * item it redacted nothing and said nothing: the operator believed a guard was in place when none
 * was, which this package's own hook docblock calls "worse than no hook at all".
 */
import { describe, expect, it } from 'vitest'

import {
  MalformedGuardrailResultError,
  runInputGuards,
  runOutputGuards,
  type Guardrail,
} from '../../src/guardrails/index.js'

const sloppy = (phase: 'checkInput' | 'checkOutput'): Guardrail => ({
  name: 'sloppy',
  [phase]: () => ({ action: 'redact' as const, reason: 'PII' }),
})

describe('a redact with no replacement text is reported, not silently ignored', () => {
  it('test_output_redact_without_text_throws_a_typed_error', async () => {
    await expect(
      runOutputGuards('the token is sk-abc', [sloppy('checkOutput')]),
    ).rejects.toBeInstanceOf(MalformedGuardrailResultError)
  })

  it('test_input_redact_without_text_throws_the_same_typed_error', async () => {
    // FR-002: the two paths cannot diverge. They are the same function now, so this is a guard
    // against someone splitting them again rather than against them drifting.
    await expect(
      runInputGuards('the token is sk-abc', [sloppy('checkInput')]),
    ).rejects.toBeInstanceOf(MalformedGuardrailResultError)
  })

  it('test_the_error_names_the_guard_and_the_phase', async () => {
    // A message that does not say WHICH guard leaves the operator grepping their own config.
    await expect(runOutputGuards('x', [sloppy('checkOutput')])).rejects.toThrow(/sloppy/)
    await expect(runOutputGuards('x', [sloppy('checkOutput')])).rejects.toThrow(/output/)
  })

  it('test_the_error_is_not_retryable', async () => {
    // A malformed guard does not become well-formed on a second attempt.
    //
    // `.rejects.toMatchObject`, not `.catch(cb)`. The first version used the callback form, which
    // runs no assertion at all when the promise RESOLVES — review proved it by removing the throw
    // and watching this test survive while its three neighbours died.
    await expect(runOutputGuards('x', [sloppy('checkOutput')])).rejects.toMatchObject({
      isRetryable: false,
      code: 'GUARDRAIL_RESULT_MALFORMED',
    })
  })
})

describe('a guard written as a method keeps its receiver', () => {
  it('test_a_method_style_guard_can_use_this', async () => {
    // The interface declares `checkInput?(text: string)` in METHOD syntax, so keeping a regex or a
    // PII list on the instance is the natural way to write a guard. Extracting the method from the
    // object to call it loses `this` — and no test in this repository wrote a guard that way, so the
    // whole suite was blind to it until review probed for it.
    const guard = {
      name: 'method-style',
      pattern: /sk-\w+/,
      checkOutput(this: { pattern: RegExp }, text: string) {
        return { action: 'redact' as const, text: text.replace(this.pattern, '[REDACTED]') }
      },
    }
    await expect(runOutputGuards('the token is sk-abc', [guard as never])).resolves.toBe(
      'the token is [REDACTED]',
    )
  })

  it('test_a_class_style_guard_can_use_a_private_field', async () => {
    class PiiGuard {
      readonly name = 'class-style'
      readonly #pattern = /sk-\w+/
      checkInput(text: string) {
        return { action: 'redact' as const, text: text.replace(this.#pattern, '[REDACTED]') }
      }
    }
    await expect(runInputGuards('the token is sk-abc', [new PiiGuard()])).resolves.toBe(
      'the token is [REDACTED]',
    )
  })
})

describe('what must not change', () => {
  it('test_a_redact_WITH_text_still_replaces', async () => {
    const good: Guardrail = {
      name: 'g',
      checkOutput: () => ({ action: 'redact', text: 'REPLACED' }),
    }
    await expect(runOutputGuards('original', [good])).resolves.toBe('REPLACED')
  })

  it('test_an_empty_string_replacement_is_a_real_redaction', async () => {
    // '' is falsy but PRESENT — the guard chose to remove everything. Treating it as "no text" would
    // turn the strongest redaction into a silent no-op, which is this item's defect inverted.
    const erase: Guardrail = { name: 'e', checkOutput: () => ({ action: 'redact', text: '' }) }
    await expect(runOutputGuards('secret', [erase])).resolves.toBe('')
  })

  it('test_allow_passes_through', async () => {
    const allow: Guardrail = { name: 'a', checkOutput: () => ({ action: 'allow' }) }
    await expect(runOutputGuards('original', [allow])).resolves.toBe('original')
  })

  it('test_block_still_throws_a_violation_not_a_malformed_error', async () => {
    const blocker: Guardrail = {
      name: 'b',
      checkOutput: () => ({ action: 'block', reason: 'PII' }),
    }
    await expect(runOutputGuards('x', [blocker])).rejects.toThrow(/blocked output/)
  })
})
