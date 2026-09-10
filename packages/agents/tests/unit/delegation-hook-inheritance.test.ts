/**
 * T3.1 — a delegated member inherits its parent's `pre_tool_call` veto.
 *
 * Without this, a squad member runs a tool the parent refused. The failure is silent and passes
 * tests: nothing throws, nothing warns, and the member's own suite is green because the member
 * never declared the gate. The only real consumer of this layer discovered it and closed it with
 * sixteen lines of its own — which means every other consumer has the hole and does not know.
 *
 * This is authority inheritance, not configuration, so the default is ON (plan D6). The escape is an
 * explicit handler map, never a boolean: `hooks: {}` and "no opinion" must not be the same value at
 * a call site that decides whether a shell runs.
 */
import { describe, expect, it, vi } from 'vitest'

import { CHAINED_HOOKS, inheritHooks } from '../../src/bridge/delegation-hooks.js'
import type { HookHandlers } from '../../src/bridge/hook-handlers.js'

/** A `pre_tool_call` context is opaque to this module — it only forwards it. */
const CTX = { toolName: 'run_shell' } as unknown as Parameters<
  NonNullable<HookHandlers['pre_tool_call']>
>[0]

describe('inheritHooks', () => {
  it('member_inherits_parent_veto', async () => {
    const parent: HookHandlers = {
      pre_tool_call: () => ({ block: true, message: 'run_shell is vetoed by the parent' }),
    }

    const effective = inheritHooks(parent, undefined)
    const decision = await effective.pre_tool_call?.(CTX)

    expect(decision?.block, 'the member ran a tool the parent refused').toBe(true)
  })

  it('parent_veto_survives_a_member_that_allows', async () => {
    // The member is not malicious — it simply has its own gate that says yes. Inheritance may only
    // TIGHTEN: a member cannot widen what the parent refused, or the gate is decorative.
    const parent: HookHandlers = { pre_tool_call: () => ({ block: true, message: 'no' }) }
    const own: HookHandlers = { pre_tool_call: () => undefined }

    const decision = await inheritHooks(parent, own).pre_tool_call?.(CTX)

    expect(decision?.block).toBe(true)
  })

  it('member_veto_applies_when_the_parent_allows', async () => {
    const parent: HookHandlers = { pre_tool_call: () => undefined }
    const own: HookHandlers = { pre_tool_call: () => ({ block: true, message: 'member says no' }) }

    const decision = await inheritHooks(parent, own).pre_tool_call?.(CTX)

    expect(decision?.block).toBe(true)
    expect(decision?.message).toContain('member says no')
  })

  it('both_allow_means_allow', async () => {
    const parent: HookHandlers = { pre_tool_call: () => undefined }
    const own: HookHandlers = { pre_tool_call: () => undefined }

    await expect(inheritHooks(parent, own).pre_tool_call?.(CTX)).resolves.toBeUndefined()
  })

  it('parent_without_hooks_does_not_synthesize_a_gate', () => {
    // A gate is never INVENTED. When neither side declared `pre_tool_call`, the member gets none —
    // otherwise every existing caller silently gains a gate it never had. (Identity of the object is
    // deliberately NOT asserted: an existing gate IS wrapped to fail closed, which is hardening.)
    const own: HookHandlers = { post_tool_call: () => undefined }

    const effective = inheritHooks(undefined, own)

    expect(effective.pre_tool_call).toBeUndefined()
    expect(effective.post_tool_call).toBe(own.post_tool_call)
  })

  it('member_without_hooks_receives_the_parents', async () => {
    const parent: HookHandlers = { pre_tool_call: () => ({ block: true, message: 'parent' }) }

    const decision = await inheritHooks(parent, undefined).pre_tool_call?.(CTX)

    expect(decision?.block).toBe(true)
  })

  it('parent_hook_that_throws_fails_closed', async () => {
    // EC-12 — an inherited gate that opens on its own error is worse than no gate: it reads as
    // protection. `error-handling.md § 2` forbids the swallow; refusing is the only safe default.
    const parent: HookHandlers = {
      pre_tool_call: () => {
        throw new Error('policy service unreachable')
      },
    }

    const decision = await inheritHooks(parent, undefined).pre_tool_call?.(CTX)

    expect(decision?.block, 'a throwing gate must refuse, not allow').toBe(true)
    expect(decision?.message).toContain('policy service unreachable')
  })

  it('fire_and_forget_events_run_on_both_sides', async () => {
    const seen: string[] = []
    const parent: HookHandlers = {
      post_tool_call: () => {
        seen.push('parent')
      },
    }
    const own: HookHandlers = {
      post_tool_call: () => {
        seen.push('member')
      },
    }

    await inheritHooks(parent, own).post_tool_call?.(
      {} as unknown as Parameters<NonNullable<HookHandlers['post_tool_call']>>[0],
    )

    expect(seen).toEqual(['parent', 'member'])
  })

  it('a_throwing_observer_does_not_stop_the_other_side', async () => {
    // Observers are fire-and-forget by contract. A broken notifier must never be why the other
    // one did not run — and must never be why the turn fails.
    const own = vi.fn()
    const parent: HookHandlers = {
      post_tool_call: () => {
        throw new Error('notifier down')
      },
    }

    await expect(
      inheritHooks(parent, { post_tool_call: own }).post_tool_call?.(
        {} as unknown as Parameters<NonNullable<HookHandlers['post_tool_call']>>[0],
      ),
    ).resolves.toBeUndefined()
    expect(own).toHaveBeenCalledOnce()
  })

  it('transforms_chain_parent_then_member', async () => {
    const parent: HookHandlers = { transform_llm_output: (out) => `${out}|parent` }
    const own: HookHandlers = { transform_llm_output: (out) => `${out}|member` }

    const folded = await inheritHooks(parent, own).transform_llm_output?.(
      'base',
      {} as unknown as Parameters<NonNullable<HookHandlers['transform_llm_output']>>[1],
    )

    expect(folded).toBe('base|parent|member')
  })

  it('test_every_chained_key_actually_runs_both_handlers', async () => {
    // R3: the COMPOSITION table is a claim until something checks it against behaviour. Marking a key
    // `chained` and never composing it would pass a type check and mean nothing — the shape of
    // defect this whole item exists to remove.
    expect(CHAINED_HOOKS.length, 'the composition table is empty').toBeGreaterThan(0)

    for (const key of CHAINED_HOOKS) {
      const parentRan = vi.fn()
      const ownRan = vi.fn()
      // One shape fits every slot for this purpose: each handler records that it ran and returns a
      // value the slot tolerates. Transforms get their input back; the rest ignore the return.
      const handler = (spy: () => void) => (a: unknown) => {
        spy()
        return a
      }
      const merged = inheritHooks(
        { [key]: handler(parentRan) } as HookHandlers,
        { [key]: handler(ownRan) } as HookHandlers,
      )
      await (merged[key] as (...args: unknown[]) => unknown)?.('base', {})
      expect(
        parentRan,
        `${key} is marked chained and the parent handler never ran`,
      ).toHaveBeenCalled()
      expect(ownRan, `${key} is marked chained and the member handler never ran`).toHaveBeenCalled()
    }
  })

  it('test_transform_tool_result_chains_parent_then_member', async () => {
    // B-007: wired today, so a parent redacting tool output has that redaction silently dropped by
    // any member that also transforms. The module states the opposite as its security property.
    const parent: HookHandlers = { transform_tool_result: (r) => `${String(r)}|parent` }
    const own: HookHandlers = { transform_tool_result: (r) => `${String(r)}|member` }

    const folded = await inheritHooks(parent, own).transform_tool_result?.(
      'base',
      {} as unknown as Parameters<NonNullable<HookHandlers['transform_tool_result']>>[1],
    )

    expect(folded, "the parent's transform was dropped").toBe('base|parent|member')
  })

  it('test_pre_user_send_contributions_are_both_kept', async () => {
    // Additive by the shape's design: PreUserSendResult carries only recalledContext, so composing
    // means both contributions reach the model, parent first. A member cannot suppress the parent.
    const parent: HookHandlers = { pre_user_send: () => ({ recalledContext: 'from-parent' }) }
    const own: HookHandlers = { pre_user_send: () => ({ recalledContext: 'from-member' }) }

    const result = await inheritHooks(parent, own).pre_user_send?.(
      {} as unknown as Parameters<NonNullable<HookHandlers['pre_user_send']>>[0],
    )

    expect(result?.recalledContext, "the parent's contribution was dropped").toBe(
      'from-parent\nfrom-member',
    )
  })

  it('test_a_lone_pre_user_send_is_used_unchanged', async () => {
    // The case a fix must NOT break: with nothing to chain, the single handler stands as it is.
    const own: HookHandlers = { pre_user_send: () => ({ recalledContext: 'alone' }) }
    const result = await inheritHooks(undefined, own).pre_user_send?.(
      {} as unknown as Parameters<NonNullable<HookHandlers['pre_user_send']>>[0],
    )
    expect(result?.recalledContext).toBe('alone')
  })

  it('nested_inheritance_is_transitive', async () => {
    // A member that delegates further must carry the grandparent's veto, or the hole reopens one
    // level down — where nobody is looking.
    const grandparent: HookHandlers = { pre_tool_call: () => ({ block: true, message: 'gp' }) }
    const parent = inheritHooks(grandparent, { pre_tool_call: () => undefined })
    const child = inheritHooks(parent, { pre_tool_call: () => undefined })

    expect((await child.pre_tool_call?.(CTX))?.block).toBe(true)
  })
})
