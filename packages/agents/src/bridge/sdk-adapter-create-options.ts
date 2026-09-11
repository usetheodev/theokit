/**
 * SDK-adapter create-options projection — extracted from `sdk-adapter.ts` (G6 file-size split).
 *
 * Two pure helpers the streaming adapter uses to talk to the SDK:
 *  - `assembleM8CreateOptions` projects the compiled `@Agent` decorator fields into `Agent.create()`
 *    arguments (the single compile site is `agent-compiler.ts`, per sdk-runtime.md);
 *  - `realUsageDone` builds the terminal `done` StreamEvent from the SDK `RunResult`.
 */
import { createRequire } from 'node:module'

import type { ContextSettings, SkillsSettings, SystemPromptResolver } from '@theokit/sdk'
import type { MemorySettings } from '@theokit/sdk'
import { TheokitAgentError } from '@theokit/sdk/errors'

import type { McpServersMap } from '../types.js'

import type { CompiledAgentOptions } from './agent-compiler.js'
import type { StreamEvent } from './agent-sse-handler.js'
import type { AgentStopReason, DoneEvent } from './agent-stream-events.js'
import { compileProjectContext } from './compile-project-context.js'
import type { ResolvedCompatSource } from './setting-sources-gate.js'

/** Extra `Agent.create()` options compiled from the M8 declarative decorators. */
interface M8CreateOptions {
  skills?: SkillsSettings
  context?: ContextSettings
  systemPrompt?: string | SystemPromptResolver
  /** SDK local options: settings source for SKILL.md discovery (EC-1) + per-run cwd (V4-L.2). */
  local?: {
    settingSources?: string[]
    compatSources?: ResolvedCompatSource[]
    cwd?: string
    baseDir?: string
    /** #686 — the pre-spawn approval gate, forwarded to `Agent.create({ local: { hooks } })`. */
    hooks?: HookApprovalGate
  }
  plugins?: readonly unknown[]
  /** #89 — `@MCP` servers forwarded to `Agent.create({ mcpServers })` (the SDK owns execution). */
  mcpServers?: McpServersMap
  /** M49 — durable-memory settings forwarded to `Agent.create({ memory })` (SDK MemorySettings). */
  memory?: MemorySettings
}

/**
 * Project the M8 fields from `CompiledAgentOptions` into `Agent.create()` arguments. Only the async
 * `@ProjectContext` resolver is built here (it does I/O, so the compiler keeps it raw). `applied`
 * lists which decorators contributed, for the observability log (wiring triad — runtime metric).
 */
/**
 * #686 — a consumer's decision point before the SDK spawns a hook, forwarded to
 * `Agent.create({ local: { hooks } })`.
 *
 * Declared here rather than imported: the SDK's `HookApprovalGate` landed in `5.4.0` and this
 * package's floor is `^4.52.1`, so importing the type would refuse to build on every version below
 * it. The shape is structural and small, which is the same reasoning `compatSources` already
 * records — "a string union is declarable here".
 *
 * The SDK calls the option `hooks`. On this layer's authoring surface it is `hookApproval`, because
 * `defineAgent({ hooks })` is already the LIFECYCLE seam and two different security-relevant things
 * under one name is how a consumer configures the wrong one.
 */
export interface HookApprovalGate {
  readonly approve?: (request: HookApprovalRequest) => boolean | Promise<boolean>
}

/** What the consumer is shown when asked to approve a hook. Mirrors the SDK's shape (5.4.0). */
export interface HookApprovalRequest {
  readonly command: string
  readonly event: string
  readonly sourcePath?: string
  readonly matcher?: string
}

/** The first `@theokit/sdk` that can honour `local.hooks`. Measured by unpacking the tarballs. */
const HOOK_GATE_SINCE = { major: 5, minor: 4 } as const

/**
 * Where the NARROWED `compatSources[].import` shape landed.
 *
 * `compatSources` itself landed in 5.0.0 (see {@link warnIfSdkCannotReadCompatSources}); listing
 * WHICH surfaces to import landed in 5.4.0. The two are different versions and were treated as one,
 * which is the whole defect: the `import` field's docblock stated the narrowed form was "refused at
 * resolve time" on an older SDK, and nothing read a version for it. Measured — on 5.0.0 ≤ SDK <
 * 5.4.0, squarely inside this package's declared `^4.52.1 || ^5.0.0`, a narrowed `import` was
 * forwarded, dropped by the runtime in silence, and the foreign root was not read AT ALL.
 *
 * That is the failure `setting-sources-gate.ts` names as its own reason for existing — declared,
 * gated, projected, and then discarded with no message — reproduced by the sentence claiming to
 * prevent it.
 */
const COMPAT_IMPORT_SINCE = { major: 5, minor: 4 } as const

/**
 * Refuses when the installed SDK cannot honour a declared hook gate.
 *
 * ## Why this THROWS where its `compatSources` sibling only warns
 *
 * That one guards a configuration source: ignored, the foreign root is not read, and the agent runs
 * with less than was asked for. This one guards a SECURITY decision. Ignored, the agent runs with
 * MORE than was asked for — every hook spawns unreviewed — while the consumer believes it is gated
 * and stops looking. The consumer that reported #686 asked for the refusal in those words: they
 * would rather have no gate than a silent one, because their `doctor` would otherwise publish a
 * guarantee that is false on `@theokit/sdk@5.0.0`.
 *
 * ## Why an unreadable version is a refusal and not a shrug
 *
 * The sibling stays silent when it cannot read the version, and that is right for a diagnostic. Here
 * "cannot tell" and "is gated" must not collapse: unproven is not proven, and this whole issue is
 * one instance of that confusion. A bundled SDK that hides `package.json` gets an explicit refusal
 * naming what it could not read, which is recoverable; a silent pass is not.
 */
export class HookGateUnsupportedError extends TheokitAgentError {
  override readonly name = 'HookGateUnsupportedError'
  constructor(version: string | undefined) {
    super(
      `a hook approval gate was declared, but the installed @theokit/sdk ` +
        `(${version ?? 'version unreadable'}) cannot honour it: \`local.hooks\` landed in ` +
        `${String(HOOK_GATE_SINCE.major)}.${String(HOOK_GATE_SINCE.minor)}.0. Forwarding it anyway ` +
        `would leave every hook spawning unreviewed while the gate reports as installed. Upgrade ` +
        `@theokit/sdk, or remove \`hookApproval\` and keep whatever refusal you have today ` +
        `(usetheokit/theokit#686).`,
      { code: 'hook_gate_unsupported', isRetryable: false },
    )
  }
}

/**
 * A narrowed `import` on an SDK that cannot read it.
 *
 * Refuses rather than warns, and the asymmetry with {@link warnIfSdkCannotReadCompatSources} is
 * deliberate: an unrecognised `compatSources` shape means the foreign root is not read, so a
 * consumer who asked for "the skills but not the hooks" silently gets NOTHING — strictly further
 * from what they asked for than the un-narrowed form, which at least reads something. Failing loud
 * is recoverable; a silent nothing is discovered by wondering why a skill is missing.
 *
 * ## The cost, which this file argues against two functions above
 *
 * An unreadable version is refused too, on the principle {@link assertSdkCanGateHooks} states:
 * "cannot tell" and "is supported" must not collapse. The sibling WARNING takes the opposite view
 * for itself — *"a bundled or vendored SDK may not resolve that subpath, and refusing to create an
 * agent over a diagnostic would be the cure being worse than the disease."*
 *
 * Both are right for what they guard, and the difference is what the check IS. A diagnostic that
 * cannot read a version should stay quiet; a GATE that cannot read one has not established the
 * thing it exists to establish. But the cost is real and belongs here rather than in a reviewer's
 * report: a consumer who bundles the SDK so `@theokit/sdk/package.json` does not resolve cannot
 * create an agent with a narrowed `import`, even on 5.4.0+. Their exit is to omit `import` and read
 * the whole root.
 */
export class CompatImportUnsupportedError extends TheokitAgentError {
  override readonly name = 'CompatImportUnsupportedError'
  constructor(version: string | undefined) {
    super(
      `\`claudeCode.import\` narrows WHICH surfaces of a foreign configuration root to read, but ` +
        `the installed @theokit/sdk (${version ?? 'version unreadable'}) cannot honour it: the ` +
        `narrowed shape landed in ` +
        `${String(COMPAT_IMPORT_SINCE.major)}.${String(COMPAT_IMPORT_SINCE.minor)}.0. An older ` +
        `runtime drops the unrecognised shape in silence, so the root would not be read AT ALL — ` +
        `less than you asked for, not more. Upgrade @theokit/sdk, or omit \`import\` to read every ` +
        `surface of the root (usetheokit/theokit#686).`,
      { code: 'compat_import_unsupported', isRetryable: false },
    )
  }
}

/**
 * Narrow this layer's compat sources to the surfaces the SDK actually handles.
 *
 * The two vocabularies diverge by ONE name on purpose: `commands` is this layer's, because
 * `<projectDir>/.claude/commands/*.md` is read by `config/custom-commands.ts` and never by the SDK.
 * `setting-sources-gate.ts` says so and prescribes the remedy — *"Derive the SDK's list from this
 * one minus `commands` rather than writing four names beside five"* — as advice to a consumer,
 * while the projection that needed it did not follow it.
 *
 * The consequence was measured: `import: ['commands']` forwarded a list containing zero names the
 * SDK defines, i.e. its own empty-list case. Four lines of `resolveCompatSources` REFUSE
 * `import: []` on the ground that "none" and "unset, so all of them" are both defensible and the
 * difference is whether `<cwd>/.claude/hooks.json` executes — and then this reproduced that exact
 * ambiguity one layer down, in silence.
 *
 * A source whose surfaces all belong to this layer is DROPPED from the SDK's list rather than sent
 * empty: the SDK is asked for what the SDK handles, and if that is nothing it is not asked. The
 * compiled value keeps `commands`, because `custom-commands.ts` reads the same field for the half
 * it owns.
 *
 * Exported for the same reason {@link assertSdkCanGateHooks} is — pure, so both directions are
 * testable without installing two SDKs.
 *
 * This sentence used to continue: "the version gate above refuses a narrowed import before this
 * runs, so a test that went through `assembleM8CreateOptions` could not reach it at all." True for
 * one commit, and the reorder that put the narrowing FIRST made it false — while the sentence
 * stayed. That is how the reorder shipped with no test through the path it changed: the docblock
 * said the test was impossible, so nobody wrote it.
 *
 * `the-compat-import-gate-refuses.test.ts` now drives both, and the assembled path is the one that
 * pins the ordering.
 */
export function compatSourcesForSdk(
  sources: readonly ResolvedCompatSource[],
): ResolvedCompatSource[] {
  const out: ResolvedCompatSource[] = []
  for (const source of sources) {
    if (typeof source === 'string') {
      out.push(source)
      continue
    }
    const forSdk = source.import.filter((surface) => surface !== 'commands')
    if (forSdk.length > 0) out.push({ kind: source.kind, import: forSdk })
  }
  return out
}

/** Pure so both directions are testable without installing two SDKs. */
export function assertSdkCanReadNarrowedImport(version: string | undefined): void {
  const [major, minor] = (version ?? '').split('.').map((n) => Number.parseInt(n, 10))
  const known = Number.isFinite(major) && Number.isFinite(minor)
  const supported =
    known &&
    (major > COMPAT_IMPORT_SINCE.major ||
      (major === COMPAT_IMPORT_SINCE.major && minor >= COMPAT_IMPORT_SINCE.minor))
  // Unreadable is NOT supported, same as the hook gate: "cannot tell" and "is gated" must not
  // collapse, and this defect is one instance of that confusion.
  if (!supported) throw new CompatImportUnsupportedError(version)
}

/** Pure so both directions are testable without installing two SDKs. */
export function assertSdkCanGateHooks(version: string | undefined): void {
  const [major, minor] = (version ?? '').split('.').map((n) => Number.parseInt(n, 10))
  const known = Number.isFinite(major) && Number.isFinite(minor)
  const supported =
    known &&
    (major > HOOK_GATE_SINCE.major ||
      (major === HOOK_GATE_SINCE.major && minor >= HOOK_GATE_SINCE.minor))
  if (!supported) throw new HookGateUnsupportedError(version)
}

/** The installed SDK's version, or `undefined` when the subpath does not resolve. */
function installedSdkVersion(): string | undefined {
  try {
    return (createRequire(import.meta.url)('@theokit/sdk/package.json') as { version?: string })
      .version
  } catch {
    return undefined
  }
}

/** Reported once per process — a warning repeated per agent stops being read. */
let sdkCompatWarningEmitted = false

/**
 * Warns when the installed SDK is too old to know `compatSources`, instead of letting it vanish.
 *
 * ## Why this lives here and not upstream
 *
 * `theokit-sdk#526` makes the SDK name an unrecognised key under `local` — and it only exists in
 * the SDK that already supports `compatSources`. So it covers exactly the half where no warning is
 * needed, and is absent from the half where one is. This layer is the only place that sees both.
 *
 * ## Why this does not require raising the floor
 *
 * `@theokit/sdk` declares `"./package.json"` in `exports`, so its version is readable at runtime.
 * That is what made `usetheokit/theokit#634` buildable before a stable cut: the blocker was never
 * the missing type — a string union is declarable here — it was that a forward against an older SDK
 * would be inert IN SILENCE. Reading the version removes the silence, and the floor stays
 * `^4.52.1`, so no consumer is pinned to a prerelease.
 *
 * Failure to read it is not an error: a bundled or vendored SDK may not resolve that subpath, and
 * refusing to create an agent over a diagnostic would be the cure being worse than the disease.
 */
function warnIfSdkCannotReadCompatSources(): void {
  if (sdkCompatWarningEmitted) return
  let version: string | undefined
  try {
    version = (createRequire(import.meta.url)('@theokit/sdk/package.json') as { version?: string })
      .version
  } catch {
    return // cannot tell — say nothing rather than guess
  }
  const major = Number.parseInt(version?.split('.')[0] ?? '', 10)
  if (!Number.isFinite(major) || major >= 5) return
  sdkCompatWarningEmitted = true
  console.warn(
    `[theokit/agents] \`compatSources\` was declared, but @theokit/sdk@${version} does not know ` +
      `that option and will ignore it — the foreign configuration root will NOT be read. It landed ` +
      `in 5.0.0. Until this package's floor can name a stable 5.x, override the SDK in your ` +
      `workspace (usetheokit/theokit#634).`,
  )
}

/**
 * Project the two config-root fields onto `options.local`.
 *
 * ## M68 — `settingSources` is a projection, not a decision
 *
 * `CompiledAgentOptions.settingSources` holds only roots some posture authorized — carried by the
 * TYPE since 2026-09-10, not by the claim this sentence used to make. It said "because every
 * authoring path runs the selection through `resolveSettingSources`", which was measured false: a
 * `Capability` is an authoring path and writes the draft directly, so a raw array reached the field
 * cast-free. `resolveSettingSources` now returns a branded `GatedSettingSource[]`, which a raw root
 * does not satisfy. See its docblock for what the brand does and does not cover.
 *
 * Two things died here, and both were the defect. A LOCAL function named `resolveSettingSources` —
 * same name as the gate, consulting no posture — is what this used to call, so a grep for the gate
 * landed on a homonym and the gate looked wired. And that homonym injected `['project']` whenever
 * the agent declared inline skills, "for back-compat": declaring a skill is a statement about
 * prompts, and it was silently enabling shell execution from the working directory.
 *
 * ## #634 — both spread, neither replaces
 *
 * The second write eating the first is the ordinary way this breaks: invisibly, with each option
 * passing its own test. `applyHookApproval` writes to the same object and follows the same rule.
 *
 * Extracted together because they are one concern and because keeping them inline put the assembler
 * over the complexity ceiling once the hook gate joined it (#686).
 */
function applyLocalSources(
  compiled: CompiledAgentOptions,
  options: M8CreateOptions,
  applied: string[],
): void {
  if (compiled.settingSources !== undefined && compiled.settingSources.length > 0) {
    options.local = { ...options.local, settingSources: [...compiled.settingSources] }
    applied.push('settingSources')
  }
  if (compiled.compatSources !== undefined && compiled.compatSources.length > 0) {
    // Narrow FIRST, then gate on what would actually be sent.
    //
    // The reverse order shipped for one commit and refused a config the SDK is never asked about:
    // `import: ['commands']` forwards nothing — `commands` is this layer's surface — yet the version
    // check fired anyway, telling the operator to upgrade for a narrowing that would never travel,
    // and denying `config/custom-commands.ts` the only surface it reads. Measured on 4.52.1, this
    // package's declared floor. It also contradicted `compatSourcesForSdk`'s own docblock: "the SDK
    // is asked for what the SDK handles, and if that is nothing it is not asked."
    const forSdk = compatSourcesForSdk(compiled.compatSources)
    if (forSdk.some((c) => typeof c === 'object' && 'import' in c)) {
      // A narrowed `import` needs a newer SDK than `compatSources` itself does — refuse before the
      // value travels, because the older runtime's silence is indistinguishable from success.
      assertSdkCanReadNarrowedImport(installedSdkVersion())
    }
    if (forSdk.length > 0) {
      options.local = { ...options.local, compatSources: forSdk }
      applied.push('compatSources')
      warnIfSdkCannotReadCompatSources()
    }
  }
}

/**
 * #686 — forward the pre-spawn approval gate, or refuse.
 *
 * Checked ONLY when one was declared: an agent that asks for no gate must not be refused over an
 * SDK feature it never needed. The check comes BEFORE the forward, so an unsupported SDK never
 * leaves a caller holding options that read as gated.
 *
 * Extracted because it pushed `assembleM8CreateOptions` past the complexity ceiling, and a security
 * decision is the last place to spend a suppression.
 */
function applyHookApproval(
  compiled: CompiledAgentOptions,
  options: M8CreateOptions,
  applied: string[],
  sdkVersion: string | undefined,
): void {
  if (compiled.hookApproval === undefined) return
  assertSdkCanGateHooks(sdkVersion ?? installedSdkVersion())
  options.local = { ...options.local, hooks: compiled.hookApproval }
  applied.push('hookApproval')
}

export function assembleM8CreateOptions(
  compiled: CompiledAgentOptions,
  /** Injectable for tests; production reads the installed SDK (#686). */
  deps: { readonly sdkVersion?: string } = {},
): {
  options: M8CreateOptions
  applied: string[]
} {
  const options: M8CreateOptions = {}
  const applied: string[] = []
  const base = compiled.systemPrompt

  if (compiled.skills) {
    options.skills = compiled.skills
    applied.push('skills')
  }
  // theokit-file-based-config — project `.theokit/` discovery sources into `local`, DECOUPLED from
  // inline skills (an agent may want hooks/mcp/subagents/context/cron with no inline skill). cwd is
  // merged downstream (`sdk-adapter.ts` overrides.cwd → app root via `mount-agent.ts`); never dropped.
  // Code `Plugin` objects (e.g. `createToolHooksPlugin`) — registered directly by the runtime
  // (`extractCodePlugins`); this is the fluent builder's only route to the SDK lifecycle-hook seam.
  if (compiled.plugins) {
    options.plugins = compiled.plugins
    applied.push('plugins')
  }
  applyLocalSources(compiled, options, applied)
  applyHookApproval(compiled, options, applied, deps.sdkVersion)
  if (compiled.context) {
    options.context = compiled.context
    applied.push('context')
  }
  if (compiled.projectContext) {
    options.systemPrompt = compileProjectContext(compiled.projectContext, base)
    applied.push('projectContext')
  } else if (base !== undefined) {
    options.systemPrompt = base
  }
  // #89 — forward the compiled `@MCP` servers to `Agent.create`. Without this the decorator was
  // inert (metadata compiled but never reaching the SDK runtime — same class as the HITL
  // `kind:'general'` bug). The SDK owns MCP server execution; this is pure adapter projection.
  if (compiled.mcpServers && Object.keys(compiled.mcpServers).length > 0) {
    options.mcpServers = compiled.mcpServers
    applied.push('mcpServers')
  }
  // M49 — forward memory to `Agent.create` (same inert-decorator class as #89: the field compiled
  // but never projected, so the SDK's whole memory subsystem was unreachable). Builder path carries
  // the SDK `MemorySettings` verbatim; the legacy decorator shape (no `enabled`) normalizes to the
  // minimal opt-in — declaring `@Memory()` means the author wants memory ON.
  if (compiled.memory !== undefined) {
    if ('enabled' in compiled.memory) {
      options.memory = compiled.memory
    } else {
      // Legacy decorator shape ({provider, embeddings, fts, scope, maxFacts}) — those knobs have no
      // SDK counterpart yet, so they are DISCARDED on normalization. Loud, never silent (M49 review
      // F8): the author asked for e.g. maxFacts and must know it is not honored.
      const dropped = Object.keys(compiled.memory)
      if (dropped.length > 0) {
        process.stderr.write(
          `[theokit-agents] @Memory decorator options not yet mapped to the SDK (${dropped.join(', ')}) — memory enabled with defaults\n`,
        )
      }
      options.memory = { enabled: true }
    }
    applied.push('memory')
  }

  return { options, applied }
}

/**
 * theokit#379 — map the SDK `RunResult`'s two truncation flags onto the framework's stop reason, or
 * `undefined` when the run finished on its own.
 *
 * The precedence is NOT a preference. It mirrors the SDK's own `classifyRound`
 * (`run-to-completion.ts`, read from the shipped bundle), which tests `stoppedByDoomLoop` FIRST and
 * only then `stoppedAtIterationLimit`. A doom-loop stop is the more specific verdict and the one
 * that must not be re-sent, so a caller reading our reason and a caller reading the SDK's driver
 * reach the same decision instead of disagreeing about a run both observed.
 */
function stopReasonOf(result: {
  stoppedAtIterationLimit?: boolean
  stoppedByDoomLoop?: boolean
}): AgentStopReason | undefined {
  if (result.stoppedByDoomLoop === true) return 'no_progress'
  if (result.stoppedAtIterationLimit === true) return 'step_limit'
  return undefined
}

/**
 * V4-N.1: build the terminal `done` event from the SDK `RunResult` (real per-run token usage +
 * cost). Extracted from the stream generator to keep its complexity within budget (G6).
 *
 * theokit#379: it also carries WHY the run stopped. Until then this read three fields off a run
 * object that reports more, so a run the SDK cut at its iteration ceiling — which, absent a declared
 * `maxIterations`, is every served run needing more than the SDK's default of 8 tool-calling turns —
 * reached the caller as an ordinary `done`.
 */
export function realUsageDone(
  result: {
    result?: string
    usage?: {
      inputTokens?: number
      outputTokens?: number
      // V4-O: optional reasoning/cache buckets from the SDK TokenUsage.
      reasoningTokens?: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
    }
    cost?: { amount?: number }
    // theokit#379: the SDK's truncation flags. Optional — absent on a clean finish and on an SDK
    // that predates them, which is the degradation this layer wants.
    stoppedAtIterationLimit?: boolean
    stoppedByDoomLoop?: boolean
  },
  t0: number,
  /**
   * The model the turn ran on, already resolved by the caller
   * (`overrides.model ?? compiled.model ?? default`). It is a PARAMETER rather than something read
   * off `compiled` here for the reason {@link DoneEvent.model} states: `compiled.model` is the
   * declared model, and the declared model is not always the one that ran.
   *
   * Optional, so the two integration tests that call this with a bare `RunResult` keep compiling
   * and keep asserting the same event they always did.
   */
  model?: string,
): StreamEvent {
  const u = result.usage
  const inputTokens = u?.inputTokens ?? 0
  const outputTokens = u?.outputTokens ?? 0
  const stopReason = stopReasonOf(result)
  return {
    type: 'done',
    result: result.result ?? '',
    // V4-O: forward the SDK reasoning/cache buckets (0 when the provider omits them) so a
    // consumer keeps full per-turn usage through the loop into DelegationResult (passthrough — ADR D1).
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      reasoningTokens: u?.reasoningTokens ?? 0,
      cacheReadTokens: u?.cacheReadTokens ?? 0,
      cacheWriteTokens: u?.cacheWriteTokens ?? 0,
    },
    durationMs: Date.now() - t0,
    cost: result.cost?.amount ?? 0,
    ...terminalExtras(stopReason, model),
  }
}

/**
 * The terminal frame's OPTIONAL keys, spread rather than assigned as `undefined`.
 *
 * theokit#379: a clean run's `done` must stay byte-identical to what it was before `stopReason`
 * shipped — absence is what means "finished", so a key holding `undefined` would be a new, noisy
 * field on every uncapped run. The same discipline applies to the model: a producer with none to
 * report emits the event it emitted before, key for key.
 *
 * They live in their own function rather than inline in {@link realUsageDone} because that function
 * was already at the complexity ceiling, and two more conditional keys is exactly the growth the
 * ceiling exists to notice.
 */
function terminalExtras(
  stopReason: AgentStopReason | undefined,
  model: string | undefined,
): { stopReason?: AgentStopReason; model?: string } {
  const extras: { stopReason?: AgentStopReason; model?: string } = {}
  if (stopReason !== undefined) extras.stopReason = stopReason
  if (model !== undefined) extras.model = model
  return extras
}
