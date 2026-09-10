/**
 * Turns a {@link PermissionStore} into a `pre_tool_call` handler — the seam that can actually refuse
 * a tool.
 *
 * ## Why an adapter, and not a gate of its own
 *
 * The store shipped with a careful key, a deny-by-default posture and no reader: measured
 * 2026-09-10, `isGranted` had zero callers outside its own unit test, and `PermissionStore` appeared
 * in zero files across six sibling repositories. It described a control that was not in force.
 *
 * What was missing was never a mechanism. `pre_tool_call` is documented in `bridge/hook-handlers.ts`
 * as the ONLY hook with veto power, and it runs before the tool by construction — so a refusal here
 * is a refusal before the side effect. This file is the two lines that connect the two, plus the one
 * decision neither of them could make alone.
 *
 * The alternative — a required `granted` argument mirroring `BuildHookHandlersOptions.approved` —
 * was rejected because it breaks every consumer's compile for a store none of them uses. The hook
 * path could afford a required argument because it shipped WITH one; retrofitting is a different
 * proposition.
 *
 * ## The decision only the consumer can make
 *
 * A `PermissionQuery` is keyed by `(tool, scope, command)`. A `PreToolCallContext` carries
 * `{ name, args }` — no scope, and no notion of which argument IS the command, which differs per
 * tool. So the mapping is the consumer's, and it is passed in.
 *
 * `classify` returns a query OR an explicit `{ governed: false }`, never a bare `undefined`. A
 * mapper returning `undefined` would say "this tool needs no permission" and "I forgot this tool" in
 * the same word, and the second one would silently pass — on a security gate. The discriminated
 * result makes forgetting a compile error while keeping "not governed" expressible, which a
 * deny-everything default would not: a gate that refuses ordinary work is a gate somebody disables.
 *
 * ## Composing with a `pre_tool_call` you already have
 *
 * `HookHandlers.pre_tool_call` is a SINGLE field, so assigning this gate over an existing handler
 * loses one of the two, silently — the failure `bridge/delegation-hooks.ts` records for delegated
 * hooks, *"nothing throws, nothing warns"*, and worse here because the handler that loses may be the
 * one that refuses. Compose them explicitly:
 *
 * ```ts
 * pre_tool_call: async (ctx) => (await gate(ctx)) ?? (await mine(ctx))
 * ```
 *
 * First veto wins; `undefined` falls through. No helper ships for this: it is one line, and a
 * `composePreToolCall` would be a second way to do what `??` already does.
 */
import type { PermissionQuery, PermissionStore } from './permission-store.js'

/**
 * Minimal shape mirrored from `@theokit/sdk` — type-only, no runtime import, so the SDK peer stays
 * optional. Same precedent as `bridge/hitl-plugin.ts`.
 */
export interface PermissionGateContext {
  readonly name: string
  readonly args: Record<string, unknown>
  readonly agentId: string
  readonly runId: string
}

/** This tool is deliberately outside the gate's remit — distinct from "I forgot to map it". */
export interface NotGoverned {
  readonly governed: false
}

export type Classification = PermissionQuery | NotGoverned

/** A veto, in the shape `pre_tool_call` returns. */
interface Veto {
  readonly block: true
  readonly message: string
}

function isNotGoverned(c: Classification): c is NotGoverned {
  return 'governed' in c
}

/**
 * @param store the grants to consult; re-read per call, so a grant made mid-run is seen
 * @param classify maps a tool call to the grant key it needs, or declares it ungoverned
 */
export function permissionGate(
  store: PermissionStore,
  classify: (ctx: PermissionGateContext) => Classification,
): (ctx: PermissionGateContext) => Promise<Veto | undefined> {
  return (ctx: PermissionGateContext): Promise<Veto | undefined> => {
    let classification: Classification
    try {
      classification = classify(ctx)
    } catch (cause) {
      // A classifier that cannot decide must not pass. Throwing would end the turn over a decision
      // the consumer's own code failed to make; denying leaves the run alive and the reason visible.
      const why = cause instanceof Error ? cause.message : String(cause)
      return Promise.resolve({
        block: true,
        message: `permission gate could not classify "${ctx.name}": ${why}`,
      })
    }

    if (isNotGoverned(classification)) return Promise.resolve(undefined)
    if (store.isGranted(classification)) return Promise.resolve(undefined)

    // The read error, when there is one, is the difference between "you have no grant" and "your
    // grants stopped applying". An operator staring at an unexpected prompt is looking here.
    const readError = store.lastReadError
    const because =
      readError === undefined
        ? 'no standing grant matches'
        : `the permission store could not be read (${readError.message}), so no grant applies`
    return Promise.resolve({
      block: true,
      message: `"${ctx.name}" is not permitted in ${classification.scope}: ${because}`,
    })
  }
}
