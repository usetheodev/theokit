/**
 * B-001 — the reason each declared event stays unwired is data, and the data is true.
 *
 * ## Why these tests exist
 *
 * `buildHookHandlers` warns that an unwired event's handler "does not exist yet". Measured
 * 2026-09-10 against `@theokit/sdk` 4.52.1, "yet" is wrong for two of the three: they are served
 * today by purpose-built seams. The reason record says so, and this file is what makes the record's
 * claims facts rather than assertions — the repository refuses a mechanism nobody proved.
 *
 * ## Why the drift guard reads BEHAVIOUR, not the constant
 *
 * `WIRED_EVENTS` is module-private (`hook-spec.ts:197`) and NFR-004 forbids touching it. Exporting
 * it to satisfy a test would move a boundary to observe it. So the guard asks the builder what it
 * DOES — an event with a reason must produce no handler and must warn — which is the stronger
 * assertion anyway (`rules/testing.md § 6`: test behaviour, not internal structure).
 */
import { describe, expect, it, vi } from 'vitest'

import { HOOK_EVENTS, buildHookHandlers, hookFingerprint } from '../../src/hooks/index.js'
import { UNWIRED_EVENT_REASONS, unmappedEvents } from '../../src/hooks/unwired-events.js'
import { runOutputGuards } from '../../src/guardrails/index.js'
import { createToolHooksPlugin } from '../../src/bridge/tool-hooks-plugin.js'
import type { Guardrail } from '../../src/guardrails/index.js'

/** Build one approved spec and capture what the builder produces and says. */
function build(event: string) {
  const spec = { command: 'true', event, timeout_ms: 500 } as never
  const warnings: string[] = []
  const handlers = buildHookHandlers([spec], {
    cwd: process.cwd(),
    trusted: true,
    approved: new Set([hookFingerprint({ command: 'true', event, timeoutMs: 500 })]),
    onWarn: (m: string) => warnings.push(m),
  })
  return { handlers, warnings: warnings.join('\n') }
}

describe('B-001 — every unwired event carries a reason, and no wired one does', () => {
  it('test_an_event_with_a_reason_produces_no_handler_and_warns', () => {
    for (const event of Object.keys(UNWIRED_EVENT_REASONS)) {
      const { handlers, warnings } = build(event)
      expect(Object.keys(handlers), `${event} has a reason but produced a handler`).toEqual([])
      expect(warnings, `${event} has a reason but did not warn`).toMatch(new RegExp(event))
    }
  })

  it('test_an_event_without_a_reason_produces_a_handler', () => {
    const wired = HOOK_EVENTS.filter((e) => !(e in UNWIRED_EVENT_REASONS))
    expect(
      wired.length,
      'no wired event left — the record claims the whole schema is unwired',
    ).toBeGreaterThan(0)
    for (const event of wired) {
      const { handlers } = build(event)
      expect(
        Object.keys(handlers).length,
        `${event} carries no reason, so it must produce a handler — either wire it or give it a reason`,
      ).toBeGreaterThan(0)
    }
  })

  it('test_on_session_end_declares_that_no_seam_covers_it', () => {
    // The one genuine gap. `seam: null` is not "we have not got to it" — it is "nothing delivers
    // this", because the handler returns void and cannot refuse an ending.
    expect(UNWIRED_EVENT_REASONS.on_session_end?.seam).toBeNull()
    expect(UNWIRED_EVENT_REASONS.on_session_end?.reason).toMatch(/void|refuse/i)
  })
})

describe('unmappedEvents — drift is reported in both directions', () => {
  const reason = { seam: 'X', reason: 'y' } as const

  it('test_a_declared_unwired_event_with_no_reason_is_reported', () => {
    // Synthetic sets, never the module constants: mutating those would leak into every other test
    // in the run (`rules/testing.md § 3` — no shared mutable state, no order dependency).
    const gaps = unmappedEvents(['a', 'b'] as never, new Set(['a']) as never, { b: reason })
    expect(gaps).toEqual([])
    const missing = unmappedEvents(['a', 'b', 'c'] as never, new Set(['a']) as never, { b: reason })
    expect(missing).toEqual(['c'])
  })

  it('test_a_reason_naming_a_wired_event_is_reported', () => {
    const stale = unmappedEvents(['a', 'b'] as never, new Set(['a', 'b']) as never, { b: reason })
    expect(stale).toEqual(['b'])
  })

  it('test_the_real_constants_have_no_drift', () => {
    // The production sets, passed through the same function rather than mutated.
    const wired = new Set(HOOK_EVENTS.filter((e) => !(e in UNWIRED_EVENT_REASONS)))
    expect(unmappedEvents(HOOK_EVENTS, wired as never, UNWIRED_EVENT_REASONS)).toEqual([])
  })
})

describe('the reasons are true — each covering seam is exercised, not asserted', () => {
  it('test_checkOutput_actually_transforms', async () => {
    const redactor: Guardrail = {
      name: 'r',
      checkOutput: () => ({ action: 'redact', text: 'REPLACED', reason: 'test' }),
    }
    await expect(runOutputGuards('original', [redactor])).resolves.toBe('REPLACED')
  })

  it('test_redact_without_replacement_text_silently_passes_the_original_TODAY', async () => {
    // EC-5 predicted this and the run confirmed it. `pipeline.ts:44` reads
    // `if (r.action === 'redact' && r.text !== undefined)` — so a guard that declares `redact` and
    // supplies no `text` redacts NOTHING, and nothing is said. The operator believes a guard is in
    // place when none is, which this package's own hook docblock calls "worse than no hook at all".
    //
    // Pinned rather than fixed: correcting it is a behaviour change to the guardrail pipeline,
    // outside B-001's scope, and registered as its own item. This assertion FAILS the day someone
    // fixes it — which is the notification a future implementer wants, not a nuisance.
    const sloppy: Guardrail = {
      name: 's',
      checkOutput: () => ({ action: 'redact', reason: 'no text' }),
    }
    await expect(runOutputGuards('original', [sloppy])).resolves.toBe('original')
  })

  it('test_processInput_contributes_before_the_model', async () => {
    const registered = new Map<string, (c: never) => unknown>()
    const plugin = createToolHooksPlugin({
      processInput: ({ prompt }) => `LADDER\n${prompt}`,
    }) as { register?: (ctx: never) => void }
    plugin.register?.({
      on: (name: string, handler: (c: never) => unknown) => registered.set(name, handler),
    } as never)

    const handler = registered.get('pre_user_send')
    expect(handler, 'processInput registered nothing on pre_user_send').toBeDefined()
    await expect(handler?.({ prompt: 'hi', agentId: 'a', runId: 'r' } as never)).resolves.toEqual({
      recalledContext: 'LADDER\nhi',
    })
  })

  it('test_an_empty_processInput_contributes_nothing', async () => {
    const registered = new Map<string, (c: never) => unknown>()
    const plugin = createToolHooksPlugin({ processInput: () => '' }) as {
      register?: (ctx: never) => void
    }
    plugin.register?.({
      on: (name: string, handler: (c: never) => unknown) => registered.set(name, handler),
    } as never)
    // A seam firing on empty input would inject noise into every turn.
    await expect(
      registered.get('pre_user_send')?.({ prompt: 'hi', agentId: 'a', runId: 'r' } as never),
    ).resolves.toBeUndefined()
  })

  it('test_a_throwing_processInput_surfaces_rather_than_corrupting_the_turn', async () => {
    // EC-6: the handler is async, so a rejection reaches the SDK's dispatch. The reason record
    // sends people to this seam; what happens when their code throws is part of the contract.
    const registered = new Map<string, (c: never) => unknown>()
    const boom = new Error('processInput exploded')
    const plugin = createToolHooksPlugin({
      processInput: () => {
        throw boom
      },
    }) as { register?: (ctx: never) => void }
    plugin.register?.({
      on: (name: string, handler: (c: never) => unknown) => registered.set(name, handler),
    } as never)
    await expect(
      registered.get('pre_user_send')?.({ prompt: 'hi', agentId: 'a', runId: 'r' } as never),
    ).rejects.toThrow('processInput exploded')
  })
})

describe('the warning names the seam instead of promising work', () => {
  it('test_the_warning_names_the_covering_seam', () => {
    expect(build('transform_llm_output').warnings).toMatch(/checkOutput/)
  })

  it('test_the_warning_says_why_on_session_end_cannot_be_covered', () => {
    expect(build('on_session_end').warnings).toMatch(/void|cannot refuse/i)
  })

  it('test_the_warning_stays_one_readable_line', () => {
    // EC-7: NFR-003 caps at one line per spec, but nothing bounds the reason's length, and a
    // paragraph satisfies "one line" while being unreadable in a terminal.
    for (const event of Object.keys(UNWIRED_EVENT_REASONS)) {
      const { warnings } = build(event)
      expect(
        warnings.length,
        `the ${event} warning is too long to read in a terminal`,
      ).toBeLessThan(300)
      expect(warnings.split('\n').length, `the ${event} warning spans multiple lines`).toBe(1)
    }
  })

  it('test_a_WIRED_event_still_does_not_warn', () => {
    // Counter-proof, mirroring hook-engine.test.ts: warning unconditionally would bury the signal.
    expect(build('pre_tool_call').warnings).toBe('')
  })

  it('test_an_unmapped_event_degrades_instead_of_throwing', () => {
    // EC-2: the lookup runs inside the code path whose job is to warn. An event with no entry must
    // fall back to the generic message, never crash — an unknown event is recoverable
    // (`rules/error-handling.md § 2`).
    const spy = vi.fn()
    expect(() =>
      buildHookHandlers(
        [{ command: 'true', event: 'transform_tool_result', timeout_ms: 500 } as never],
        {
          cwd: process.cwd(),
          trusted: true,
          approved: new Set([
            hookFingerprint({ command: 'true', event: 'transform_tool_result', timeoutMs: 500 }),
          ]),
          onWarn: spy,
        },
      ),
    ).not.toThrow()
  })
})
