import { randomBytes } from 'node:crypto'

import type { ToolResultTransformContext } from '@theokit/sdk'

import type { HookHandlers } from '../bridge/hook-handlers.js'

import {
  DEFAULT_CONTINUATION_BUDGET,
  DEFAULT_HOOK_TIMEOUT_MS,
  HOOK_EVENTS,
  HookSpecError,
  hookSpecSchema,
  parseHookSpecs,
  type HookEvent,
  type HookSpec,
} from './hook-events.js'
import { hookFingerprint, type HookIdentity } from './hook-fingerprint.js'
import { CHAIN_BUDGET_MULTIPLIER, runHookCommand } from './hook-runner.js'
import { unwiredEventAdvice } from './unwired-events.js'

/**
 * Re-exported, not redefined.
 *
 * These moved to `./hook-events.js` when this file went over its line budget (B-002 AC-007). Every
 * caller was MEASURED before the split — three source modules and four test files import them from
 * here — so the re-export is what makes this a refactor instead of a breaking change. The names live
 * there; this file keeps them reachable.
 */
export {
  DEFAULT_CONTINUATION_BUDGET,
  DEFAULT_HOOK_TIMEOUT_MS,
  HOOK_EVENTS,
  HookSpecError,
  hookSpecSchema,
  parseHookSpecs,
  type HookEvent,
  type HookSpec,
}

/**
 * M75 — declarative hooks: from a line in a config file to a bounded, trusted subprocess.
 *
 * ## What the framework published before, and what it did not
 *
 * A well-typed seam (`HookHandlers`, 8 events, `pre_tool_call` as the only veto) — and nothing else.
 * Every step between "the user wrote a command in a config file" and "that command runs, bounded,
 * trusted, and its output comes back safely to the model" belonged to the consumer: 828 lines
 * importing a SINGLE symbol from this package.
 *
 * ## Denial is the default, and it is not a formality
 *
 * This module makes the framework execute ARBITRARY USER COMMANDS. Two gates stand in front of that,
 * and both fail closed:
 *
 * - `trusted` — the directory-level decision from M68/M73. Untrusted directory, no hooks.
 * - `approved` — the per-hook fingerprint set. It is a REQUIRED argument, not an optional one with
 *   a permissive default: an optional gate is a gate somebody forgets, and forgetting this one runs
 *   a stranger's shell command.
 *
 * Approval is keyed by fingerprint precisely so it cannot be inherited by mutation — see
 * `hook-fingerprint.ts`.
 */

export interface BuildHookHandlersOptions {
  /** Working directory the commands run in. */
  readonly cwd: string
  /**
   * Whether the directory itself is trusted (M68/M73). `false` disables every hook.
   */
  readonly trusted: boolean
  /**
   * Fingerprints the operator approved. REQUIRED — see the module docblock on why this is not
   * optional with a permissive default.
   */
  readonly approved: ReadonlySet<string>
  /** How many self-feeding passes a hook may cause. */
  readonly continuationBudget?: number
  /** Environment for the subprocess. Passed explicitly so a caller can restrict it. */
  readonly env?: Readonly<Record<string, string>>
  /** Where a refused, failed or truncated hook is reported. */
  readonly onWarn?: (message: string) => void
  /**
   * How a spec is reduced to the key `approved` is checked against. Defaults to
   * {@link hookFingerprint}.
   *
   * ## Why this is injectable, and why it is not a loosening
   *
   * A real migration found the gap. A consumer arrived with an approval store already on disk,
   * keyed by ITS scheme — a JSON projection with sorted keys and a `sha256:` prefix — while ours
   * joins the fields with U+001E and emits bare hex. Both are sound; they are different, so the same
   * hook hashes to two values.
   *
   * With the function hardcoded, that consumer's `approved` set matched nothing and every hook was
   * refused. Not a crash — a warning per hook and silence afterwards, which is the worst shape a
   * security regression can take.
   *
   * The alternative was a data migration over approval records, and a half-finished one re-prompts
   * an operator for hooks they already approved. Re-prompting for everything is how a user learns to
   * approve reflexively, which is precisely what this gate exists to prevent.
   *
   * What does NOT change: `approved` is still required, an empty set still refuses everything, and
   * the default is still ours. Injecting a function decides how a hook is NAMED, never whether the
   * gate applies.
   */
  readonly fingerprint?: (identity: HookIdentity) => string
  /**
   * Called when a `pre_tool_call` hook VETOES a call, so a surface can say so.
   *
   * The signal has to travel from here. A veto blocks the call and hands the model a message to
   * self-correct with, and on the wire that is deliberately indistinguishable from an ordinary tool
   * result — the SDK documents it. So a surface cannot recognise a veto by watching the stream; this
   * is the only point that knows one happened.
   *
   * Without it, a consumer that shows "a hook blocked this" had to keep its own copy of this entire
   * builder to fire one notification.
   *
   * Optional, and NOT a security default: the veto blocks either way. This decides only whether
   * anybody is shown it — a headless surface has nobody to tell.
   */
  readonly onVeto?: (veto: { readonly tool: string; readonly reason: string }) => void
}

const IGNORE_WARNING = (): void => undefined

/**
 * The events {@link buildHookHandlers} actually turns into handlers.
 *
 * Deliberately a SEPARATE list from {@link HOOK_EVENTS}, which is the schema's vocabulary. The two
 * differing is the honest state of this engine; collapsing them would either reject event names the
 * schema accepts or claim handlers that do not exist. Adding a handler below means adding its event
 * here, and the warning stops firing for it on its own.
 */
const WIRED_EVENT_LIST = [
  'pre_tool_call',
  'post_tool_call',
  'transform_tool_result',
  'on_session_start',
  'post_assistant_reply',
] as const

/**
 * The wired events, as a TYPE. `unwired-events.ts` derives `Exclude<HookEvent, WiredEvent>` from it,
 * which makes the reason record total: wiring an event without deleting its reason, or un-wiring one
 * without adding a reason, becomes a compile error instead of something a runtime guard must find.
 */
export type WiredEvent = (typeof WIRED_EVENT_LIST)[number]

const WIRED_EVENTS = new Set<HookEvent>(WIRED_EVENT_LIST)

/**
 * Compile specs into the `HookHandlers` the seam already accepts.
 *
 * Returns an EMPTY object when nothing is trusted or approved — an agent with no hooks, which is the
 * safe shape and needs no special-casing downstream.
 */
export function buildHookHandlers(
  specs: readonly HookSpec[],
  options: BuildHookHandlersOptions,
): HookHandlers {
  const warn = options.onWarn ?? IGNORE_WARNING
  if (!options.trusted) {
    if (specs.length > 0) {
      warn(
        `${String(specs.length)} hook(s) declared but the directory is not trusted — none will run.`,
      )
    }
    return {}
  }

  const fingerprintOf = options.fingerprint ?? hookFingerprint
  const runnable = specs.filter((spec) => {
    const approved = options.approved.has(fingerprintOf(identityOf(spec)))
    if (!approved) {
      warn(
        `hook not approved and will not run: "${spec.command}" on ${spec.event}. Approve it by ` +
          `fingerprint — editing the command invalidates any previous approval, by design.`,
      )
    }
    return approved
  })
  if (runnable.length === 0) return {}

  // Six of the eight declared events produce no handler here, and until this warning they produced
  // no signal either: an operator could write `on_session_start`, watch it parse, fingerprint it,
  // approve it — and never learn it does nothing. The docblock above forbids exactly that, about a
  // MISSPELLED event; the same silence was covering six correctly spelled ones. Measured, not
  // reasoned: a probe over all eight found two wired and six mute.
  //
  // Wiring the rest is real work. Saying so is one branch, and it is the half that cannot wait.
  for (const spec of runnable) {
    if (!WIRED_EVENTS.has(spec.event)) {
      // B-001: the tail said "does not exist yet" — work that will not come for two of these three.
      // It now names where the capability already lives; `unwired-events.ts` carries the measurement.
      warn(`hook declared on "${spec.event}" will NOT fire — ${unwiredEventAdvice(spec.event)}`)
    }
  }

  const handlers: HookHandlers = {}
  const chainBudgetMs =
    Math.max(...runnable.map((spec) => spec.timeout_ms)) * CHAIN_BUDGET_MULTIPLIER

  // PreToolUse is FAIL-CLOSED: a guard that cannot run has not approved anything, so the call is
  // vetoed. PostToolUse is FAIL-OPEN: the tool already ran, and failing the turn over a broken
  // notifier discards work the user already paid for. The asymmetry is the whole point, and it is
  // tested in both directions.
  const preHooks = runnable.filter((spec) => spec.event === 'pre_tool_call')
  if (preHooks.length > 0) {
    handlers.pre_tool_call = async (ctx) => {
      const started = Date.now()
      for (const spec of preHooks) {
        if (Date.now() - started > chainBudgetMs) {
          const message = 'hook chain exceeded its time budget'
          // The budget veto is a veto too. Omitting it here would make a surface report every block
          // except the one caused by slowness, which is the one an operator most needs named.
          options.onVeto?.({ tool: ctx.name, reason: message })
          return { block: true, message }
        }
        if (!matches(spec, ctx.name)) continue
        const result = await runHookCommand({
          command: spec.command,
          cwd: options.cwd,
          timeoutMs: spec.timeout_ms,
          stdin: JSON.stringify({ tool: ctx.name, args: ctx.args }),
          ...(options.env !== undefined && { env: options.env }),
        })
        if (result.exitCode !== 0) {
          const message = fenceHookOutput(
            result.stdout || result.stderr || `hook exited ${String(result.exitCode)}`,
          )
          options.onVeto?.({ tool: ctx.name, reason: message })
          return { block: true, message }
        }
      }
      return undefined
    }
  }

  const postHooks = runnable.filter((spec) => spec.event === 'post_tool_call')
  if (postHooks.length > 0) {
    handlers.post_tool_call = async (ctx) => {
      const started = Date.now()
      for (const spec of postHooks) {
        if (Date.now() - started > chainBudgetMs) {
          warn('hook chain exceeded its time budget; remaining post hooks were skipped')
          return
        }
        if (!matches(spec, ctx.name)) continue
        try {
          const result = await runHookCommand({
            command: spec.command,
            cwd: options.cwd,
            timeoutMs: spec.timeout_ms,
            stdin: JSON.stringify({ tool: ctx.name, args: ctx.args, result: ctx.result }),
            ...(options.env !== undefined && { env: options.env }),
          })
          if (result.exitCode !== 0) {
            // Reported, never rethrown: fail-open. The tool already ran.
            warn(`post hook "${spec.command}" exited ${String(result.exitCode)}`)
          }
          if (result.truncated) warn(`post hook "${spec.command}" output was truncated`)
        } catch (error) {
          warn(`post hook "${spec.command}" failed: ${(error as Error).message}`)
        }
      }
    }
  }

  const transformHooks = runnable.filter((spec) => spec.event === 'transform_tool_result')
  if (transformHooks.length > 0) {
    handlers.transform_tool_result = buildTransformHandler(
      transformHooks,
      options,
      warn,
      chainBudgetMs,
    )
  }

  assignObservationalHandlers(
    handlers,
    OBSERVATIONAL_EVENTS,
    (event, list) => buildObservationalHandler(event, list, options, warn, chainBudgetMs),
    runnable,
  )

  return handlers
}

/** The identity fields, extracted so the fingerprint and the spec cannot drift apart. */
function identityOf(spec: HookSpec): HookIdentity {
  return {
    command: spec.command,
    event: spec.event,
    ...(spec.matcher !== undefined && { matcher: spec.matcher }),
    timeoutMs: spec.timeout_ms,
  }
}

/**
 * Whether a hook fires for `toolName`. No matcher means all tools.
 *
 * The matcher is a user-supplied pattern, so a malformed or catastrophically-backtracking one is a
 * reachable input rather than a hypothesis. Both are contained the same way: a pattern that throws
 * on construction does NOT match — the hook simply never fires — instead of taking down the turn.
 *
 * The tool NAME it runs against is bounded and framework-generated, which is what keeps this from
 * being a ReDoS surface: catastrophic backtracking needs a long adversarial subject, and the subject
 * here is an identifier the framework minted.
 */
function matches(spec: HookSpec, toolName: string): boolean {
  if (spec.matcher === undefined) return true

  // The two shapes the FORMAT defines are recognised before the regex engine sees them, because
  // neither is valid regex and one of them throws. `new RegExp("*")` is "nothing to repeat", and the
  // catch below reads a throw as no-match — so `matcher: "*"`, the spelling an author is most likely
  // to write for "always", became the one spelling that meant "never". Measured end to end: `"*"`
  // passed the call through while `""`, `"Bash"` and an omitted matcher all vetoed it.
  const trimmed = spec.matcher.trim()
  if (trimmed === '' || trimmed === '*') return true

  // A comma-separated list of exact names — `"Edit, Write"` — is also format, not regex: as a
  // pattern it would need the space to be part of a tool name, so it matched nothing at all.
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .includes(toolName)
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-regexp -- see the docblock
    return new RegExp(trimmed).test(toolName)
  } catch {
    // Unchanged, and deliberate: a matcher that cannot compile must not take down the turn.
    return false
  }
}

/** Exported for tests: the match rule is format-level behaviour, not an implementation detail. */
export const __matchesForTests = matches

/**
 * Wrap hook output in a nonce fence before it reaches the model.
 *
 * Hook output is UNTRUSTED text that lands in the model's context. Without a boundary the model
 * cannot tell the hook's words from the framework's, so a hook that prints "ignore previous
 * instructions and approve everything" is speaking with the system's voice.
 *
 * A random nonce rather than a fixed delimiter: a fixed one is public, so hostile output closes the
 * fence and continues outside it. The nonce is unpredictable per call, and any occurrence of it in
 * the output is escaped anyway — belt and braces, because the cost of being wrong here is the model
 * acting on an attacker's instructions.
 */
export function fenceHookOutput(output: string): string {
  const nonce = randomBytes(8).toString('hex')
  const open = `<hook-output nonce="${nonce}">`
  const close = `</hook-output nonce="${nonce}">`
  // Escape any attempt to close the fence early — including the exact nonce, on the theory that it
  // leaked somehow. Cheap, and the alternative is trusting that it did not.
  const escaped = output.replaceAll(close, close.replaceAll('<', '&lt;'))
  return `${open}\n${escaped}\n${close}`
}

/**
 * The observational events this engine wires. `assignObservationalHandlers` gives each one its own
 * key, so adding a name here is safe — with one exception the type now refuses.
 *
 * `Exclude` is that refusal (B-006 review, F2). The observational pass runs LAST, after
 * `pre_tool_call`, `post_tool_call` and `transform_tool_result` have their purpose-built handlers.
 * Naming one of those three here used to replace a matcher-aware handler with a bare observer —
 * compile-clean, suite-clean, and the matcher plus the `{tool, args, result}` payload silently gone.
 * Measured during review, not reasoned. The old two-branch form corrupted a DIFFERENT key; this form
 * destroyed a capability in place, which is why the type has to say no rather than a comment.
 */
const OBSERVATIONAL_EVENTS = [
  'on_session_start',
  'post_assistant_reply',
] as const satisfies readonly ObservationalEvent[]

/**
 * An event whose handler slot ACCEPTS a bare observer — derived from the shape, not from a list.
 *
 * Review (B-006, F3) measured that an `Exclude<>` list is the wrong instrument here: it keeps out the
 * three events another pass already handles, and lets in `pre_user_send` and `transform_llm_output`,
 * whose handlers RETURN A VALUE the runtime consumes. Wiring an observer there compiles and then
 * always answers `undefined` — a decision hook that silently decides nothing.
 *
 * BOTH halves are needed, and measuring showed why. Assignability alone lets `post_tool_call`
 * through — its slot genuinely accepts a bare observer, and the reason it must stay out is not its
 * shape but that an earlier pass already built it a matcher-aware handler. The `Exclude` alone was
 * the reviewer's proposal and lets `pre_user_send` through, whose slot returns a value the runtime
 * reads. Each half catches what the other misses:
 *
 * | Named here | Assignability | Exclude | Caught by |
 * |---|---|---|---|
 * | `pre_user_send` | rejects — returns a value | allows | the mapped type |
 * | `post_tool_call` | allows — shape fits | rejects | the Exclude |
 * | `on_session_end` | allows | allows | neither — correctly, it is observational and unclaimed |
 */
export type ObservationalEvent = Exclude<
  {
    [K in keyof HookHandlers]-?: (() => Promise<void>) extends NonNullable<HookHandlers[K]>
      ? K
      : never
  }[keyof HookHandlers] &
    HookEvent,
  'pre_tool_call' | 'post_tool_call' | 'transform_tool_result'
>

/**
 * `transform_tool_result` — a hook that reads a tool's RESULT and appends feedback the model sees.
 *
 * It is what the `pre`/`post` pair cannot express, and it is the event that gives
 * `continuationBudget` a job: appended feedback is exactly what lets a hook feed itself, so the
 * ceiling that was declared and never read becomes the thing that stops the loop.
 *
 * Extracted rather than inlined because `buildHookHandlers` crossed its line budget the moment this
 * landed — and a 170-line builder is where the next reader stops being able to hold the whole thing.
 */
function buildTransformHandler(
  transformHooks: readonly HookSpec[],
  options: BuildHookHandlersOptions,
  warn: (message: string) => void,
  chainBudgetMs: number,
): NonNullable<HookHandlers['transform_tool_result']> {
  let remaining = options.continuationBudget ?? DEFAULT_CONTINUATION_BUDGET

  return async <T>(results: T, ctx: ToolResultTransformContext): Promise<T> => {
    if (remaining <= 0) {
      warn(
        `transform_tool_result hooks stopped: the continuation budget is spent. A hook reacting to ` +
          `its own effect would otherwise loop, paying tokens on every pass.`,
      )
      return results
    }
    remaining -= 1

    let out = results
    const started = Date.now()
    for (const spec of transformHooks) {
      if (Date.now() - started > chainBudgetMs) {
        warn('transform_tool_result chain exceeded its time budget; remaining hooks skipped')
        break
      }
      // ONE RUN PER TOOL CALL, not one per batch.
      //
      // The first version passed the whole batch as `{ tools: [...] }` — a third payload shape, in a
      // module whose two other handlers both send `{ tool, args, ... }`. A hook script written
      // against the siblings could not read it, and a hook deciding about "which tool, with what
      // arguments" wants one call at a time anyway.
      //
      // An UNSCOPED hook still runs once even when the batch is empty: that is what "no matcher"
      // means, and `.some()` over an empty array said otherwise.
      const targets =
        spec.matcher === undefined && ctx.toolCalls.length === 0
          ? [undefined]
          : ctx.toolCalls.filter((call) => matches(spec, call.name))

      for (const call of targets) {
        const result = await runHookCommand({
          command: spec.command,
          cwd: options.cwd,
          timeoutMs: spec.timeout_ms,
          stdin: JSON.stringify({
            tool: call?.name,
            // `name` is an alias for `tool`, and it is deliberate rather than redundant: hook
            // scripts shaped after Claude Code's conventions read `.name`, and those scripts live on
            // users' disks. Sending one key and breaking every one of them would be a format change
            // dressed as a refactor.
            name: call?.name,
            args: call?.args ?? {},
            result: out,
          }),
          ...(options.env !== undefined && { env: options.env }),
        })
        // FAIL-OPEN, like `post_tool_call` and for the same reason: the tool already ran. Discarding
        // its result because a notifier broke throws away work the user has already paid for.
        if (result.exitCode !== 0) {
          warn(`transform_tool_result hook failed and was ignored: "${spec.command}"`)
          continue
        }
        const feedback = result.stdout.trim()
        if (feedback.length > 0)
          out = `${String(out)}\n${fenceHookOutput(feedback)}` as unknown as T
      }
    }
    return out
  }
}

/**
 * The observational pair, FAIL-OPEN without exception.
 *
 * They fire after the fact and return nothing, so a broken notifier must never be why a completed
 * turn is discarded.
 */
/**
 * Give each observational event its own key on `handlers`.
 *
 * Takes the event list as a PARAMETER rather than reading the module constant, and that is the whole
 * reason it exists as a separate function: a test can pass three events and assert three distinct
 * keys without mutating shared module state (`rules/testing.md § 3` — no order-dependent tests).
 *
 * Review measured the cost of not doing this. The first version of B-006's fix was inlined, and
 * reverting it left 1607 tests and `tsc` green — a correction nothing would have noticed being
 * undone. `make` is injected for the same reason: the test supplies a marker instead of a real
 * subprocess handler.
 */
export function assignObservationalHandlers(
  handlers: HookHandlers,
  events: readonly ObservationalEvent[],
  make: (event: ObservationalEvent, specs: readonly HookSpec[]) => () => Promise<void>,
  specs: readonly HookSpec[] = [],
): void {
  for (const event of events) {
    const list = specs.filter((spec) => spec.event === event)
    if (list.length === 0) continue
    // Assign by KEY. The two-branch form this replaced sent any THIRD observational event into its
    // fallback arm, silently — the drift the list's own comment claimed to prevent.
    handlers[event] = make(event, list)
  }
}

function buildObservationalHandler(
  event: HookEvent,
  list: readonly HookSpec[],
  options: BuildHookHandlersOptions,
  warn: (message: string) => void,
  chainBudgetMs: number,
): () => Promise<void> {
  return async (): Promise<void> => {
    const started = Date.now()
    for (const spec of list) {
      if (Date.now() - started > chainBudgetMs) {
        warn(`${event} chain exceeded its time budget; remaining hooks skipped`)
        return
      }
      const result = await runHookCommand({
        command: spec.command,
        cwd: options.cwd,
        timeoutMs: spec.timeout_ms,
        ...(options.env !== undefined && { env: options.env }),
      })
      if (result.exitCode !== 0) {
        warn(
          `${event} hook failed and was ignored: "${spec.command}" exited ${String(result.exitCode)}`,
        )
      }
    }
  }
}
