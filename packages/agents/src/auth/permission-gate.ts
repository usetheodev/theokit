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
 * Minimal shape mirrored from `@theokit/sdk`.
 *
 * The reason used to read "type-only, no runtime import, so the SDK peer stays optional", and that
 * does not justify mirroring anything: `bridge/hook-handlers.ts` imports these very two SDK types
 * (`PreToolCallContext`, `PreToolCallDecision`) with `import type` and costs the optional peer
 * nothing. A type-only import IS type-only.
 *
 * The real reason is the NAME, and it is written out three paragraphs down: `@theokit/sdk` already
 * exports `PermissionGateContext` with a different shape, so a consumer importing both would get a
 * duplicate identifier or silently the wrong one. What is mirrored here is also a deliberate
 * SUBSET — the fields this gate reads — rather than a copy kept in step with the SDK's.
 *
 * A mirror can drift into a consumer-side compile error that no gate here would see first, so the
 * assignment this docblock instructs a consumer to make is pinned by
 * `tests/type/the-grant-gate-fits-the-hook-it-is-for.test-d.ts`.
 *
 * NOT named `PermissionGateContext`: `@theokit/sdk` already exports a type by that name, with a
 * different shape (`{ toolName, mode }`), alongside `PermissionGate`, `PermissionGateDecision`,
 * `PermissionEngine` and `PermissionPlugin`. A consumer importing both would get a duplicate
 * identifier, or silently the wrong shape.
 *
 * The rename says something true rather than merely avoiding a clash. This gates on a STANDING
 * GRANT the operator made; the SDK's permission engine is a separate system with its own rules, and
 * the two do not consult each other — an engine `allow` does not satisfy a missing grant, and a
 * grant does not satisfy the engine.
 */
export interface GrantGateContext {
  readonly name: string
  readonly args: Record<string, unknown>
  readonly agentId: string
  readonly runId: string
  /**
   * The run's resolved permission mode, carried by the real context. Mirrored so the shapes match
   * and so its absence from the gate's logic is a decision rather than an oversight: `bypass` does
   * NOT disable this gate, because a standing grant is the operator's, not the run's.
   */
  readonly permissionMode?: string
}

/** This tool is deliberately outside the gate's remit — distinct from "I forgot to map it". */
export interface NotGoverned {
  readonly governed: false
}

/** This tool IS governed, by the grant key inside. */
export interface Governed {
  readonly governed: true
  readonly query: PermissionQuery
}

/**
 * BOTH arms carry `governed`, and that is the whole point.
 *
 * The first version was `PermissionQuery | NotGoverned` — discriminated by whether the `governed`
 * KEY was present. It failed open, measured against the built artifact: a consumer who writes a
 * policy record `{ governed: true, scope }` and spreads it into the query — the most natural
 * reading of "yes, govern this" — got `undefined` back, and an ungranted destructive command ran.
 * `governed: undefined` did the same. TypeScript does not stop it: a fresh literal with an excess
 * property errors, the same object through a variable or a spread does not.
 *
 * The presence check arrived by obeying a linter. `'governed' in c && c.governed === false` was
 * flagged as "always true given the type", which was true of the DECLARED type and false of every
 * value that reaches it. A type-based lint rule cannot see excess properties, and the safety of a
 * gate is not a type-level fact.
 *
 * With the discriminant on both arms there is no key to be accidentally present: `governed` is
 * declared either way, the check is on its VALUE, and `governed: true` without a `query` is a
 * compile error rather than a silent pass.
 */
export type Classification = Governed | NotGoverned

/**
 * A veto, in the shape `pre_tool_call` returns.
 *
 * Exported because it appears in {@link grantGate}'s public signature — an unexported type there
 * leaves a consumer unable to name the return value. `hooks/secure-store.ts` documents the same
 * case.
 */
export interface Veto {
  readonly block: true
  readonly message: string
}

/**
 * @param store the grants to consult; re-read per call, so a grant made mid-run is seen
 * @param classify maps a tool call to the grant key it needs, or declares it ungoverned
 */
export function grantGate(
  store: PermissionStore,
  classify: (ctx: GrantGateContext) => Classification,
): (ctx: GrantGateContext) => Promise<Veto | undefined> {
  return (ctx: GrantGateContext): Promise<Veto | undefined> => {
    try {
      const classification: Classification = classify(ctx)

      // A JS consumer, or any `as` cast, can hand back `null` or a number. Reading `.governed` off
      // it must not escape as a TypeError: `runPreToolCallHooks` has no catch, so a throw here ends
      // the turn — the outcome this whole block exists to prevent, triggered by the exact value the
      // design calls forbidden. The narrow-then-deny is inside the `try` for the same reason the
      // `classify` call is.
      // `=== false`, never `!classification.governed`, and the lint suppression below is the point
      // rather than an annoyance. `!undefined` is `true`, so a JS consumer returning
      // `{ governed: undefined }` would be waved through; `=== false` treats it as governed, `query`
      // is then undefined, `isGranted` throws, and the catch denies. Fail-closed by construction —
      // measured across `true` / `undefined` / `false` / `null`, and only `false` passes.
      //
      // This rule already caused the original defect once: it flagged `c.governed === false` as
      // "always true given the type". The type was right; every value that reaches it need not be.
      // A type-based lint cannot see what a caller actually passes, and the safety of a gate is not
      // a type-level fact.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
      if (classification.governed === false) return Promise.resolve(undefined)
      if (store.isGranted(classification.query)) return Promise.resolve(undefined)

      // The read error, when there is one, is the difference between "you have no grant" and "your
      // grants stopped applying". An operator staring at an unexpected prompt is looking here.
      const because =
        store.lastReadError === undefined
          ? 'no standing grant matches'
          : 'the permission store could not be read, so no grant applies'
      return Promise.resolve({
        block: true,
        message: `"${ctx.name}" is not permitted in ${classification.query.scope}: ${because}`,
      })
    } catch (cause) {
      // A classifier that cannot decide must not pass. Throwing would end the turn over a decision
      // the consumer's own code failed to make; denying leaves the run alive and the reason visible.
      const why = cause instanceof Error ? cause.message : String(cause)
      return Promise.resolve({
        block: true,
        message: `permission gate could not classify "${ctx.name}": ${why}`,
      })
    }
  }
}
