/**
 * B-008 — a guard that declares `redact` and supplies no replacement.
 *
 * `GuardrailResult.text` is optional, so this compiles and reads like a working guard. Until this
 * item it redacted nothing and said nothing: the operator believed a guard was in place when none
 * was, which this package's own hook docblock calls "worse than no hook at all".
 */
import { describe, expect, it } from 'vitest'

import { runInputGuards, runOutputGuards } from '../../src/guardrails/index.js'
import { MalformedGuardrailResultError, type Guardrail } from '../../src/guardrails/index.js'

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
    await runOutputGuards('x', [sloppy('checkOutput')]).catch((e: unknown) => {
      expect((e as { isRetryable?: boolean }).isRetryable).toBe(false)
    })
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
