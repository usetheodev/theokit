// `createDelegateTool` — the one agent-facing capability the framework was missing.
//
// Measured (`discoveries/blueprints/theocode-baseline-gaps-blueprint.md`): `@theokit/agents/tools`
// ships 23 factories the agent can call mid-run, and `@theokit/agents` ships `delegate()`,
// `delegateWithScoring()`, `delegateBackground()` and `Squad` for the APP to call. Local sub-agent
// delegation was the single capability present on one side and absent on the other — the framework
// could delegate, and the agent had no way to ask it to. `createA2ATool` is not the counterpart:
// its target is a REMOTE peer over a network transport, with none of the parent's tools, budget or
// authority carried across.
//
// It cannot live beside the other 23. Those are `@theokit/sdk-tools`, and `delegate()` is
// framework-owned — an SDK-side factory would have the SDK importing the framework, inverting G1's
// dependency direction. It is re-exported through the same `./tools` subpath so the consumer sees
// one surface regardless of which side of the seam a factory is implemented on.
//
// THIN BY DESIGN (parsimony rung 6). `delegate()` already merges the parent's tools, clamps the
// budget and propagates authority. Re-deriving any of that here would put two owners on one rule,
// which is how the two copies diverge in silence (G12).
import { Tool } from '@theokit/sdk'
import { TheokitAgentError } from '@theokit/sdk/errors'
import { z } from 'zod'

import { delegate, type DelegateOptions } from '../bridge/agent-orchestrator.js'
import { DelegationTimeoutError } from '../bridge/delegation-lifecycle.js'
import { isPort, type DelegationTarget } from '../bridge/delegation-scoring.js'
import {
  DelegationBudgetExceededError,
  DelegationError,
  type DelegationResult,
} from '../bridge/delegation-types.js'
import { GuardrailError, GuardrailViolationError } from '../guardrails/index.js'

/**
 * A roster misconfiguration — always raised at factory time, never at the model's first call.
 *
 * The distinction is the point. `delegate()` refuses an empty `apiKey` deep in its own call stack,
 * so a factory that forwards `{}` fails only when the model first reaches for the tool — by which
 * point the failure is a tool error the model will try to reason about, rather than a startup error
 * a human can read.
 */
export class DelegateToolConfigError extends TheokitAgentError {
  override readonly name = 'DelegateToolConfigError'

  constructor(
    message: string,
    readonly code: 'empty_roster' | 'duplicate_name' | 'missing_api_key' | 'unknown_agent',
  ) {
    super(message)
  }
}

/**
 * One delegation target, named.
 *
 * The name is carried here rather than read off the target because `DelegationPort` is `{run}` and
 * has no name to read — pairing them keeps a type guard out of every use site.
 */
export interface DelegateRosterEntry {
  readonly name: string
  readonly target: DelegationTarget
}

export interface CreateDelegateToolOptions {
  /** Who the agent may delegate to. Must be non-empty and free of duplicate names. */
  readonly roster: readonly DelegateRosterEntry[]
  /** Forwarded to `delegate()` verbatim. `apiKey` is required when any target is a `SubAgentSpec`. */
  readonly defaults?: DelegateOptions
  /** Defaults to `delegate`. Override when an app already exposes a tool by that name. */
  readonly name?: string
  /** Defaults to a description naming the roster. Override to describe the roster's semantics. */
  readonly description?: string
}

function assertUsableRoster(
  roster: readonly DelegateRosterEntry[],
  defaults: DelegateOptions | undefined,
): void {
  if (roster.length === 0) {
    throw new DelegateToolConfigError(
      'createDelegateTool: the roster is empty — a delegate tool with no reachable target is a defect, not a configuration.',
      'empty_roster',
    )
  }

  const seen = new Set<string>()
  for (const { name } of roster) {
    if (seen.has(name)) {
      // Two entries sharing a name collapse into one enum member and lookup then resolves to
      // whichever is found first — silent dispatch to the wrong sub-agent, which reads as success.
      throw new DelegateToolConfigError(
        `createDelegateTool: duplicate roster name ${JSON.stringify(name)} — each target must be uniquely addressable.`,
        'duplicate_name',
      )
    }
    seen.add(name)
  }

  const needsCredential = roster.some((entry) => !isPort(entry.target))
  // `null` is an ANSWER — "this provider takes no credential" — and not an omission
  // (usetheokit/theokit#423). Only `undefined` and `''` are omissions: the first is a caller who
  // said nothing, the second is what an unset environment variable produces, and folding either
  // into the keyless case would turn a typo into an unauthenticated run.
  if (needsCredential && defaults?.apiKey !== null && !defaults?.apiKey) {
    throw new DelegateToolConfigError(
      'createDelegateTool: a SubAgentSpec target requires defaults.apiKey — delegate() refuses an ' +
        "empty key, and without this check the failure would surface at the model's first call " +
        'instead of at startup. Pass `apiKey: null` when the provider takes no credential.',
      'missing_api_key',
    )
  }
}

/** The stable code an error crosses into the model payload as. */
function errorCodeOf(error: unknown): string | undefined {
  if (error instanceof DelegationBudgetExceededError) return 'delegation_budget_exceeded'
  if (error instanceof DelegationTimeoutError) return 'delegation_timeout'
  if (error instanceof DelegationError) return 'delegation_failed'
  // B-015 made this class reachable from `delegate()` for the first time. Before that it could not
  // come out, so it fell to the `undefined` arm and was rethrown as "a defect" — ending the parent's
  // turn while this tool's own description, shipped to the model, promises `{ ok: false, … }` on a
  // refusal. A guard refusal IS a refusal, so it crosses as one.
  if (error instanceof GuardrailViolationError) return 'guardrail_violation'
  // B-020 — every OTHER guardrail error, by construction. `MalformedGuardrailResultError` sits in
  // the same file as the class above, takes the same wrapping, and was not named here: it fell to
  // the `undefined` arm, was rethrown as a defect, and on the path where `DelegationError` wrapped
  // it first it crossed as `delegation_failed` — which IS on the message allowlist, so the guard's
  // name travelled to the model and a guard DEFECT was reported as a failure of the work.
  //
  // A distinct code rather than reusing `guardrail_violation`: a guard that is written wrong did not
  // refuse anything, and telling the model it was refused would be as wrong in the other direction.
  // Neither code is on `MESSAGE_MAY_CROSS`, so both withhold.
  //
  // The base-class arm is what makes a THIRD class covered by its own declaration. A list of two is
  // how this defect existed.
  if (error instanceof GuardrailError) return 'guardrail_error'
  return undefined
}

/** What a refusal says when its own message must not travel. */
const REFUSED_BY_POLICY = 'the delegated task was refused by a policy guard'

/**
 * What the model is told about a refusal.
 *
 * A budget or a timeout is a fact about the WORK, and its message is what the model acts on. A
 * guardrail message is not: it reads `Guardrail "pii-detector" blocked output: ssn found`, naming
 * the guard and the exact trigger. Give that to a model and it has a map around the gate — it
 * learns which words to avoid, not that it should stop. It still learns it was refused, which is
 * the one bit it can act on: delegate less, or do the work itself.
 *
 * ## The default is WITHHOLD, and the first version had it backwards
 *
 * This began as `if (code === 'guardrail_violation') return fixed` — a denylist, so any code added
 * to {@link errorCodeOf} later would pass its typed message through by DEFAULT, silently, on the
 * one function whose entire purpose is withholding. `errorCodeOf` directly above is an allowlist
 * (unknown → `undefined` → rethrow); this is now one too, and the two read the same way.
 *
 * Adding a code to `errorCodeOf` and not to `MESSAGE_MAY_CROSS` makes it withhold. That is the safe
 * direction of forgetting, and it is the only one a reviewer can rely on.
 *
 * ## The hole this used to name, and what closed it
 *
 * `DelegationError`'s message is `Delegation to agent "X" failed: ${cause.message}`
 * (`delegation-types.ts`), and `run-reflective-loop.ts` wrapped a non-delegation round error into
 * one — so a guard throwing INSIDE a round crossed as `delegation_failed`, which IS on the
 * allowlist above, with the guard's name and trigger intact. Measured through this tool with a
 * consumer-supplied `streamFactory`.
 *
 * `run-reflective-loop.ts` now lets `GuardrailViolationError` pass through as itself, alongside the
 * two delegation errors that already did, so it reaches `errorCodeOf` as the class it is. This
 * section described the hole as open for one round after the commit that closed it, in a file that
 * commit did not touch.
 */
/**
 * A `Set` and not a `Record<string, true>`, because that record's type LIES: indexing it types the
 * result `true`, so eslint reported `!MESSAGE_MAY_CROSS[code]` as "always falsy" while at runtime an
 * unlisted code yields `undefined`. A type that disagrees with its values is how the tagged-union
 * fail-open in `auth/permission-gate.ts` happened; `has()` returns a real boolean.
 */
const MESSAGE_MAY_CROSS: ReadonlySet<string> = new Set([
  // A budget or a timeout is a fact about the WORK, and the number in it is what the model acts on.
  'delegation_budget_exceeded',
  'delegation_timeout',
  'delegation_failed',
])

function messageForModel(code: string, error: unknown): string {
  if (!MESSAGE_MAY_CROSS.has(code)) return REFUSED_BY_POLICY
  return error instanceof Error ? error.message : String(error)
}

function describeRoster(roster: readonly DelegateRosterEntry[]): string {
  return roster.map((entry) => entry.name).join(', ')
}

/**
 * Build a tool that lets the agent delegate a task to one of `roster`.
 *
 * Recursion is bounded by BUDGET, not by depth — a sub-agent holding this same tool may delegate
 * again, and `delegate()` clamps the parent's remaining budget into each child. That guarantee is
 * conditional on the caller supplying `budget` / `parentBudgetRemaining` in `defaults`; both are
 * optional in `DelegateOptions`, and with neither set nothing at this layer bounds the descent.
 * Stated rather than fixed: a depth counter here would be a second owner of a rule `delegate()`
 * already owns.
 */
export function createDelegateTool(options: CreateDelegateToolOptions) {
  const { roster, defaults, name = 'delegate', description } = options

  assertUsableRoster(roster, defaults)

  const byName = new Map(roster.map((entry) => [entry.name, entry.target]))
  const names = roster.map((entry) => entry.name) as [string, ...string[]]

  const inputSchema = z.object({
    agent: z
      .enum(names)
      .describe(`Which sub-agent runs the task. One of: ${describeRoster(roster)}.`),
    task: z
      .string()
      .min(1)
      .describe(
        'What the sub-agent should do, stated so it can be acted on without further context.',
      ),
  })

  return Tool.create({
    name,
    description:
      description ??
      `Delegate a task to one of this app's sub-agents (${describeRoster(roster)}) and receive its answer. ` +
        'The sub-agent runs with its own turn and its own token cost, drawn from the same budget as this run — ' +
        'reach for it when the work is genuinely separable, not for something answerable directly. ' +
        'Returns JSON: { ok: true, response } on success, { ok: false, error, message } when delegation is refused.',
    inputSchema,
    handler: async (raw: unknown): Promise<string> => {
      // This parse is for TYPING, not for validation — and saying so matters, because a sabotage
      // test proved the difference: replacing it with a cast left all 16 tests green. `Tool.create`
      // already validates against this same schema before the handler runs, so the ZodError a caller
      // sees comes from there. What the parse buys is `agent`/`task` typed without a `as` on `raw`
      // (G3), with re-validation as a harmless byproduct on an already-valid object.
      const { agent, task } = inputSchema.parse(raw)

      const target = byName.get(agent)
      if (!target) {
        // UNREACHABLE by construction, and kept deliberately. `names` and `byName` are derived from
        // the same `roster` in the same expression, so any value surviving `inputSchema.parse` above
        // is a key here — a review confirmed empirically that no test reaches this line. It stays as
        // defence in depth for a future edit that decouples the two derivations, and TypeScript
        // needs the branch regardless because `Map.get` is partial. What it must NOT do is lie about
        // which failure it is: the first draft reused `'duplicate_name'` here, which would have sent
        // a reader of the code hunting for a collision that never happened.
        throw new DelegateToolConfigError(
          `delegate: unknown agent ${JSON.stringify(agent)} — the roster holds ${describeRoster(roster)}.`,
          'unknown_agent',
        )
      }

      try {
        const result: DelegationResult = isPort(target)
          ? await target.run(task)
          : await delegate(target, task, defaults ?? {})

        return JSON.stringify({ ok: true, response: result.response })
      } catch (error) {
        const code = errorCodeOf(error)
        if (code === undefined) {
          // Not a delegation outcome — a defect (a malformed spec, a bug in a port). Catching it
          // would hand the model prose to reason about instead of failing where a human can see it.
          throw error
        }
        // A delegation refusal is INFORMATION the model can act on: delegate less, or finish the
        // work itself. Throwing here would end the parent's turn over a recoverable signal. Nothing
        // is swallowed — the typed error's identity crosses as a stable code; the message travels except
        // where withholding it IS the point (see `messageForModel`).
        return JSON.stringify({ ok: false, error: code, message: messageForModel(code, error) })
      }
    },
  })
}
