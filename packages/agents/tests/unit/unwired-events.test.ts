/**
 * B-001 — the reason each declared event stays unwired is data, and the data is true.
 *
 * ## What review changed here, and why it is worth reading
 *
 * The first version shipped a drift guard that could not fail. It derived the "wired" set FROM the
 * reason record and then asserted the two agreed — true by algebra, and blind to the one constant
 * that can actually drift. Two independent reviewers proved it by mutation: removing
 * `post_assistant_reply` from `WIRED_EVENTS` produced a working handler AND a warning saying it
 * would not fire, and all sixteen tests passed.
 *
 * The replacement is `test_an_event_warns_if_and_only_if_it_produces_no_handler`. It never reads
 * `WIRED_EVENTS` — it asks the builder what it DID, for every declared event, and requires the
 * warning and the handler to disagree in exactly one direction. Both mutations fail it.
 *
 * The lesson generalises past this file: a guard whose inputs are derived from the thing it guards
 * is a tautology wearing a test's clothes.
 */
import { describe, expect, it } from 'vitest'

import { createToolHooksPlugin } from '../../src/bridge/tool-hooks-plugin.js'
import { runInputGuards, runOutputGuards } from '../../src/guardrails/index.js'
import type { Guardrail } from '../../src/guardrails/index.js'
import type { HookEvent } from '../../src/hooks/hook-spec.js'
import { HOOK_EVENTS, buildHookHandlers, hookFingerprint } from '../../src/hooks/index.js'
import { UNWIRED_EVENT_REASONS, unwiredEventAdvice } from '../../src/hooks/unwired-events.js'

/** Build one approved spec and capture what the builder produced and every line it said. */
function build(event: HookEvent) {
  const spec = { command: 'true', event, timeout_ms: 500 }
  const warnings: string[] = []
  const handlers = buildHookHandlers([spec], {
    cwd: process.cwd(),
    trusted: true,
    approved: new Set([hookFingerprint({ command: 'true', event, timeoutMs: 500 })]),
    onWarn: (m: string) => warnings.push(m),
  })
  return { handlers, warnings }
}

/** Typed once, so every loop below is guarded against going green over zero iterations. */
const REASON_ENTRIES = Object.entries(UNWIRED_EVENT_REASONS) as [
  HookEvent,
  { seam: string | null; reason: string },
][]

describe('the warning and the handler can never disagree', () => {
  it('test_an_event_warns_if_and_only_if_it_produces_no_handler', () => {
    // The guard that replaced the tautology. It reads only HOOK_EVENTS and the builder's OUTPUT, so
    // it catches drift in `WIRED_EVENTS`, in `OBSERVATIONAL_EVENTS`, and in the reason record —
    // including the case that produces a warning contradicting a handler that exists.
    for (const event of HOOK_EVENTS) {
      const { handlers, warnings } = build(event)
      const warned = warnings.length > 0
      const noHandler = Object.keys(handlers).length === 0
      expect(
        warned,
        `${event}: warned=${warned} but handler-absent=${noHandler} — must agree`,
      ).toBe(noHandler)
    }
  })

  it('test_every_warned_event_has_a_reason_and_every_reason_is_warned', () => {
    const warned = HOOK_EVENTS.filter((event) => build(event).warnings.length > 0)
    expect(
      warned.length,
      'no event warns — the builder wires everything, so the record is stale',
    ).toBeGreaterThan(0)
    const byName = (a: string, b: string) => a.localeCompare(b)
    expect([...warned].sort(byName)).toEqual(REASON_ENTRIES.map(([event]) => event).sort(byName))
  })
})

describe('the advice a consumer is told to act on', () => {
  it('test_every_reason_reaches_the_warning_verbatim', () => {
    // Driven from the record, so a new entry cannot be added without being asserted. The first
    // version checked two of three events by hand and left `pre_user_send` unpinned — review
    // replaced its seam with a fabricated name and all sixteen tests still passed.
    expect(
      REASON_ENTRIES.length,
      'the reason record is empty — this test asserted nothing',
    ).toBeGreaterThan(0)
    for (const [event, entry] of REASON_ENTRIES) {
      const { warnings } = build(event)
      expect(warnings).toHaveLength(1)
      expect(warnings[0], `${event}: the event name is missing from its own warning`).toContain(
        `"${event}"`,
      )
      expect(warnings[0], `${event}: the reason never reached the operator`).toContain(entry.reason)
      if (entry.seam !== null) {
        expect(warnings[0], `${event}: the covering seam is not named`).toContain(entry.seam)
      }
    }
  })

  it('test_an_uncovered_event_recommends_nothing_to_use_instead', () => {
    // The structural meaning of `seam: null`, asserted instead of its wording. The previous version
    // matched /void|cannot refuse/ and would have broken on a harmless reword of a user-facing
    // sentence — which `rules/testing.md § 6` names as the textbook bad test.
    expect(build('on_session_end').warnings[0]).not.toMatch(/use .* instead/)
  })

  it('test_every_reason_entry_is_usable_in_a_terminal', () => {
    for (const [event, entry] of REASON_ENTRIES) {
      expect(
        entry.reason.trim(),
        `${event}: an empty reason ends the warning in a bare full stop`,
      ).not.toBe('')
      if (entry.seam !== null) {
        expect(entry.seam.trim(), `${event}: an empty seam emits "use  instead:"`).not.toBe('')
      }
    }
  })

  it('test_the_warning_stays_one_readable_line', () => {
    expect(REASON_ENTRIES.length).toBeGreaterThan(0)
    for (const [event] of REASON_ENTRIES) {
      // Per MESSAGE, not over the joined output: a spec that also trips the not-approved warning
      // would otherwise silently turn this into a budget spanning two lines.
      for (const message of build(event).warnings) {
        expect(message.length, `${event}: too long to read in a terminal`).toBeLessThan(300)
        expect(message.split('\n')).toHaveLength(1)
      }
    }
  })

  it('test_an_unmapped_event_degrades_to_the_generic_tail_instead_of_throwing', () => {
    // Reaches the fallback branch directly, by passing an empty record. The previous version built a
    // spec on `transform_tool_result` — a WIRED event — so the warning branch never ran and the
    // function under test was never called. Coverage showed the branch as the module's one
    // uncovered line, which is how review found it.
    expect(unwiredEventAdvice('on_session_end', {})).toBe('the handler does not exist yet.')
  })

  it('test_a_WIRED_event_still_does_not_warn', () => {
    expect(build('pre_tool_call').warnings).toEqual([])
  })
})

/**
 * Every seam a reason NAMES must have a proof in this table, and the proof must resolve to a real
 * symbol. This is the link review found missing: the tests below prove the seams work, and nothing
 * connected those proofs to the string a consumer is told to type. Review replaced
 * `pre_user_send`'s seam with `WRONG_SEAM_THAT_DOES_NOT_EXIST` and every test still passed, because
 * the warning is generated FROM the record — so asserting the record reaches the warning is
 * self-referential.
 *
 * Keying the proof by the exact seam string breaks the circle: a fabricated name has no entry here.
 */
const SEAM_PROOFS: Readonly<Record<string, () => unknown>> = {
  'Guardrail.checkOutput': () => runOutputGuards,
  'createToolHooksPlugin({ processInput })': () => createToolHooksPlugin,
}

describe('the reasons are true — each covering seam is exercised, not asserted', () => {
  it('test_every_named_seam_resolves_to_a_real_symbol', () => {
    const named = REASON_ENTRIES.filter(([, entry]) => entry.seam !== null)
    expect(named.length, 'no reason names a seam — nothing to verify').toBeGreaterThan(0)
    for (const [event, entry] of named) {
      const proof = SEAM_PROOFS[entry.seam!]
      expect(
        proof,
        `${event} recommends "${entry.seam}" and no proof is registered for it — either the seam is ` +
          'fabricated, or it is real and untested. Both are defects.',
      ).toBeDefined()
      expect(
        proof?.(),
        `${event}: the symbol behind "${entry.seam}" does not resolve`,
      ).toBeDefined()
    }
  })

  it('test_checkOutput_actually_transforms', async () => {
    const redactor: Guardrail = {
      name: 'r',
      checkOutput: () => ({ action: 'redact', text: 'REPLACED', reason: 'test' }),
    }
    await expect(runOutputGuards('original', [redactor])).resolves.toBe('REPLACED')
  })

  it('test_redact_without_replacement_text_silently_passes_the_original_TODAY', async () => {
    // A live defect, pinned rather than fixed: `pipeline.ts:39` (output) and `:22` (input) both read
    // `r.action === 'redact' && r.text !== undefined`, so a guard declaring `redact` with no
    // replacement redacts NOTHING and says nothing. The operator believes a guard is in place when
    // none is — what this package's own hook docblock calls "worse than no hook at all".
    //
    // Fixing it is a behaviour change to the guardrail pipeline, outside B-001. These assertions
    // FAIL the day someone corrects either path, which is the notification a future implementer
    // wants. BOTH paths are pinned: the first version covered only the output one, so a fix to
    // `runInputGuards` would have passed in silence and the two paths would have drifted.
    const sloppy: Guardrail = {
      name: 's',
      checkInput: () => ({ action: 'redact', reason: 'no text' }),
      checkOutput: () => ({ action: 'redact', reason: 'no text' }),
    }
    await expect(runOutputGuards('original', [sloppy])).resolves.toBe('original')
    await expect(runInputGuards('original', [sloppy])).resolves.toBe('original')
  })

  it('test_processInput_registers_a_pre_user_send_handler_that_contributes_text', async () => {
    // Named for what it proves. It drives the real `createToolHooksPlugin.register`, but the plugin
    // context is a stub, so it does NOT exercise the SDK's plugin-acceptance path — and that path
    // has bitten this package before: `tool-hooks-plugin.ts` records that without `kind: 'general'`
    // the SDK's isCodePlugin() drops the plugin and no hook fires (M10/M19, found in a real run).
    // The next test covers that half; the residual gap is stated rather than hidden.
    const registered = new Map<string, (c: never) => unknown>()
    const plugin = createToolHooksPlugin({ processInput: ({ prompt }) => `LADDER\n${prompt}` }) as {
      register?: (ctx: never) => void
    }
    plugin.register?.({
      on: (name: string, handler: (c: never) => unknown) => registered.set(name, handler),
    } as never)

    const handler = registered.get('pre_user_send')
    expect(handler, 'processInput registered nothing on pre_user_send').toBeDefined()
    await expect(handler?.({ prompt: 'hi', agentId: 'a', runId: 'r' } as never)).resolves.toEqual({
      recalledContext: 'LADDER\nhi',
    })
  })

  it('test_the_plugin_declares_the_kind_the_SDK_requires', () => {
    // The half the stub above cannot see, asserted directly instead of left to a comment.
    expect((createToolHooksPlugin({ processInput: () => 'x' }) as { kind?: string }).kind).toBe(
      'general',
    )
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
    const registered = new Map<string, (c: never) => unknown>()
    const plugin = createToolHooksPlugin({
      processInput: () => {
        throw new Error('processInput exploded')
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
