/**
 * Hook inheritance for a delegated member — the authority a sub-agent runs under.
 *
 * ## Why this exists
 *
 * `delegate()` already merges the parent's TOOLS and clamps the parent's BUDGET into the member's
 * run. It did not carry the parent's HOOKS, so a member could call a tool the parent's
 * `pre_tool_call` gate had refused. The failure is silent and green: nothing throws, nothing warns,
 * and the member's own suite passes because the member never declared the gate.
 *
 * The only real consumer of this layer found it and closed it with sixteen lines of its own. Sixteen
 * lines standing between a squad and the parent's veto is not a consumer's job — it is authority
 * inheritance, and a consumer who does not know the rule exists has the hole and no way to see it.
 *
 * ## The composition rule: inheritance may only TIGHTEN
 *
 * A Chain of Responsibility over the two handler maps, with one asymmetry that carries the whole
 * security property: for `pre_tool_call`, BOTH gates run and the FIRST refusal wins. A member cannot
 * widen what the parent refused — if it could, the parent's gate would be decorative.
 *
 * A free function rather than a class: there is no state to hold and no second implementation to
 * swap. Wrapping a pure fold in a class would be the ceremony parsimony refuses (`parsimony-ladder`
 * rung 5), and this module's whole surface is one composition.
 *
 * ## Failure posture
 *
 * A gate that throws REFUSES. An inherited gate that opens on its own error is worse than no gate,
 * because it reads as protection — `error-handling.md § 2` forbids that swallow. Observers
 * (`post_tool_call`, session lifecycle) are fire-and-forget by contract, so a broken notifier is
 * isolated and never becomes the reason a turn failed.
 */
import type { HookHandlers } from './hook-handlers.js'

/** Both sides declared this event, or no composition is needed. */
function bothOf<T>(parent: T | undefined, own: T | undefined): readonly [T, T] | undefined {
  return parent !== undefined && own !== undefined ? [parent, own] : undefined
}

/** The code-plugin envelope the SDK dispatches hooks through. */
export interface CodePlugin {
  readonly name: string
  readonly version: string
  readonly kind: 'general'
  register(ctx: { on: (hook: string, handler: (c: never) => unknown) => void }): void
}

type PreToolCall = NonNullable<HookHandlers['pre_tool_call']>
type PreToolCallDecision = Awaited<ReturnType<PreToolCall>>

/**
 * Run every gate in order; the first refusal wins.
 *
 * Sequential, not `Promise.all`: the parent's answer is the one that may stop the member, and a
 * refusal should not wait on a slower sibling gate to resolve.
 *
 * Applied even when only ONE side has a gate, because the fail-closed property belongs to the gate
 * reaching the member, not to the fact that two of them met. A single parent gate that throws would
 * otherwise propagate and be caught — or not — by whatever sits above the member's run, which is
 * exactly the "reads as protection, behaves as nothing" state this module exists to remove.
 */
function chainVeto(...gates: readonly PreToolCall[]): PreToolCall {
  return async (ctx) => {
    for (const gate of gates) {
      let decision: PreToolCallDecision
      try {
        decision = await gate(ctx)
      } catch (cause) {
        // Fail CLOSED. The message carries the cause so an operator can tell "refused by policy"
        // from "the policy could not be consulted" — two different problems with the same outcome.
        const reason = cause instanceof Error ? cause.message : String(cause)
        return { block: true, message: `hook gate failed and refused the call: ${reason}` }
      }
      if (decision?.block === true) return decision
    }
    return undefined
  }
}

/** Run both observers; neither may prevent the other, and neither may fail the turn. */
function chainObserver<TCtx>(
  parent: (ctx: TCtx) => Promise<void> | void,
  own: (ctx: TCtx) => Promise<void> | void,
): (ctx: TCtx) => Promise<void> {
  return async (ctx) => {
    for (const observe of [parent, own]) {
      try {
        await observe(ctx)
      } catch (cause) {
        // Not swallowed — CONTAINED. These events are declared fire-and-forget, so a broken notifier
        // must not be why the other one did not run, and must not fail the turn. But silence would
        // make it invisible forever: a notifier that never fires reads exactly like one with nothing
        // to report. That "declared, wired, never runs" shape is the defect this whole slice hunts,
        // so it does not get to hide here. A veto gate never reaches this path.
        const reason = cause instanceof Error ? cause.message : String(cause)
        console.warn(`[@theokit/agents] an inherited observer threw and was contained: ${reason}`)
      }
    }
  }
}

/** Fold through both transforms, parent first — the parent shaped the context the member sees. */
function chainTransform<TValue, TCtx>(
  parent: (value: TValue, ctx: TCtx) => Promise<TValue> | TValue,
  own: (value: TValue, ctx: TCtx) => Promise<TValue> | TValue,
): (value: TValue, ctx: TCtx) => Promise<TValue> {
  return async (value, ctx) => own(await parent(value, ctx), ctx)
}

/**
 * Compose the four fire-and-forget events, in place.
 *
 * Explicit per event rather than an indexed loop: the observers carry DIFFERENT context types, and a
 * generic index would need a cast that erases exactly the distinction the SDK's own types make. Its
 * own function so `inheritHooks` stays readable — four near-identical lines are fine; four of them
 * buried among the veto and transform rules are not.
 */
function composeObservers(
  merged: HookHandlers,
  parent: HookHandlers | undefined,
  own: HookHandlers | undefined,
): void {
  const post = bothOf(parent?.post_tool_call, own?.post_tool_call)
  if (post) merged.post_tool_call = chainObserver(post[0], post[1])
  const start = bothOf(parent?.on_session_start, own?.on_session_start)
  if (start) merged.on_session_start = chainObserver(start[0], start[1])
  const end = bothOf(parent?.on_session_end, own?.on_session_end)
  if (end) merged.on_session_end = chainObserver(end[0], end[1])
  const reply = bothOf(parent?.post_assistant_reply, own?.post_assistant_reply)
  if (reply) merged.post_assistant_reply = chainObserver(reply[0], reply[1])
}

/**
 * Join both contributions, parent first.
 *
 * `PreUserSendResult` carries only `recalledContext`, and the seam is additive by the SDK's design —
 * no raw-prompt mutation is exposed to plugins. So composing means both contributions reach the
 * model in order, never that one silences the other. When only one side returns text, that text is
 * used unchanged: joining it with an empty string would add a stray newline the model then reads.
 */
function chainRecall(
  parent: NonNullable<HookHandlers['pre_user_send']>,
  own: NonNullable<HookHandlers['pre_user_send']>,
): NonNullable<HookHandlers['pre_user_send']> {
  return async (ctx) => {
    const parts = [await parent(ctx), await own(ctx)]
      .map((r) => r?.recalledContext)
      .filter((text): text is string => text !== undefined && text.length > 0)
    return parts.length > 0 ? { recalledContext: parts.join('\n') } : undefined
  }
}

/**
 * How `inheritHooks` treats every hook a member can declare.
 *
 * Total over `keyof HookHandlers`, and that totality IS the guard: adding a key to the interface
 * without deciding its composition is `TS2741`, not a silent inheritance of the spread's
 * replace-the-parent default. That default is what this item exists to remove, and leaving the next
 * key to inherit it would reintroduce the same defect one event later.
 *
 * `exempt` is a real answer, kept available on purpose — but it has to be written down by somebody.
 * The mechanism is B-006's, one commit old, for the same class of defect.
 */
const COMPOSITION: Readonly<Record<keyof HookHandlers, 'chained' | 'exempt'>> = {
  pre_tool_call: 'chained',
  post_tool_call: 'chained',
  on_session_start: 'chained',
  on_session_end: 'chained',
  post_assistant_reply: 'chained',
  transform_llm_output: 'chained',
  transform_tool_result: 'chained',
  pre_user_send: 'chained',
}

/** The keys `inheritHooks` composes — read by the test that proves the table matches behaviour. */
export const CHAINED_HOOKS = Object.entries(COMPOSITION)
  .filter(([, mode]) => mode === 'chained')
  .map(([key]) => key as keyof HookHandlers)

/**
 * Compose the three value-returning hooks, in place.
 *
 * Its own function for the reason `composeObservers` is: `inheritHooks` reads as the composition
 * RULES, and burying six near-identical lines among the veto logic hides both. Extracting it also
 * kept the function under the complexity budget, which is the lint rule noticing the same thing.
 *
 * `transform_tool_result` and `pre_user_send` were absent here until B-007. Both took the spread in
 * `inheritHooks`, so a member's handler REPLACED its parent's — the opposite of the property that
 * function documents. `transform_tool_result` is wired today, so a parent redacting tool output lost
 * that redaction to any member that also transformed.
 */
function composeTransforms(
  merged: HookHandlers,
  parent: HookHandlers | undefined,
  own: HookHandlers | undefined,
): void {
  const llm = bothOf(parent?.transform_llm_output, own?.transform_llm_output)
  if (llm) merged.transform_llm_output = chainTransform(llm[0], llm[1])
  const toolResult = bothOf(parent?.transform_tool_result, own?.transform_tool_result)
  if (toolResult) merged.transform_tool_result = chainTransform(toolResult[0], toolResult[1])
  const recall = bothOf(parent?.pre_user_send, own?.pre_user_send)
  if (recall) merged.pre_user_send = chainRecall(recall[0], recall[1])
}

/**
 * Compose the hooks a delegated member actually runs under.
 *
 * A gate is never SYNTHESIZED: when neither side declared `pre_tool_call`, the member gets none, and
 * every existing caller keeps the behaviour it had. What the composition does add is the fail-closed
 * wrapper around a gate that already exists — hardening, not invention.
 *
 * @param parent the supervisor's handlers, or `undefined` when it declared none
 * @param own    the member's own handlers, or `undefined`
 */
export function inheritHooks(
  parent: HookHandlers | undefined,
  own: HookHandlers | undefined,
): HookHandlers {
  const merged: HookHandlers = { ...(parent ?? {}), ...(own ?? {}) }

  // Order matters and is the security property: the parent's refusal is evaluated first, and a
  // member can only ever ADD a reason to refuse.
  const gates = [parent?.pre_tool_call, own?.pre_tool_call].filter(
    (gate): gate is PreToolCall => gate !== undefined,
  )
  if (gates.length > 0) merged.pre_tool_call = chainVeto(...gates)

  composeObservers(merged, parent, own)

  composeTransforms(merged, parent, own)

  return merged
}

/**
 * Wrap a handler map as the code plugin the SDK dispatches hooks through.
 *
 * Hooks and plugins are different concepts — a hook is a lifecycle interception point, a plugin is
 * an extension unit — but the SDK's transport for hooks IS the plugin seam, so a map that must reach
 * a run needs this envelope. Mirrors `compileHooksAndPlugins` in `define-agent.ts`, including
 * `kind: 'general'`, which is load-bearing: the SDK drops any plugin without it and no hook fires.
 *
 * Returns `undefined` for an empty map, so a caller with nothing to inherit appends nothing.
 */
export function hooksPlugin(handlers: HookHandlers): CodePlugin | undefined {
  const entries = Object.entries(handlers).filter(([, h]) => typeof h === 'function')
  if (entries.length === 0) return undefined
  return {
    name: 'theokit-inherited-hooks',
    version: '1.0.0',
    kind: 'general',
    register(ctx) {
      for (const [hookName, handler] of entries) {
        // The one `as` in this file, and it does NOT narrow from `unknown` — so it is a documented
        // exception to `system-design-guardrails.md` G3, not an oversight. `Object.entries` erases
        // the key↔value correlation that makes the map typed: each handler takes its OWN context
        // type, while `ctx.on` needs one signature. `never` is the honest bottom here — it asserts
        // the callee accepts whatever this entry carries, which the map's own type already proved
        // pairwise. Re-deriving that correlation would need a mapped-type registration API on the
        // SDK's side, which is not ours to add.
        ctx.on(hookName, handler as (c: never) => unknown)
      }
    },
  }
}
