import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import * as barrel from '../../src/index.js'
import * as sdk from '@theokit/sdk'

/**
 * M67 T5 — the coverage policy, extended to the axis that had none: the SDK's ROOT BAR.
 *
 * ## The hole this file closes
 *
 * `subpath-coverage.test.ts` (M78) demands a verdict for each of the SDK's 31 SUBPATHS, and its own
 * header explains why a verdict beats an allowlist: without one, "nobody has decided yet" is
 * indistinguishable from "we decided it stays out". That policy worked — for the axis it covers.
 *
 * The config/trust/wiring family lives on the ROOT BAR (`@theokit/sdk` entry `.`), which no gate
 * enumerated. Measured consequence: NINE consecutive minors (4.41 → 4.49) added symbols there and not
 * one produced a signal here. The omission did not survive because reviewers were careless; it
 * survived because the instrument's scope was narrower than the property it claimed. ADR 0061.
 *
 * ## Scope: VALUES, and the name says so
 *
 * Enumeration is `Object.keys` over the imported namespace — the runtime object. Every `export type`
 * in the SDK is erased at compile time and cannot appear. Claiming "every root-bar export has a
 * verdict" while covering only values would repeat, one level down, exactly the defect above. So the
 * test is named for what it checks, and type coverage is declared a known gap (ADR 0061, alternative 4).
 *
 * ## ESM on both sides, deliberately
 *
 * Both namespaces are imported as ESM. An earlier draft enumerated the SDK through `createRequire`
 * and every single symbol read as NOT crossing — CJS and ESM are different module instances, so
 * referential identity is false by construction between them. The comparison is only meaningful when
 * both sides come from the same module graph, which is also the graph a consumer loads.
 */

/** A root-bar value the layer re-exports. Verified by referential identity, never by presence. */
interface Inside {
  readonly verdict: 'in'
  /** Where it crosses, for a reader tracing the decision back to a block in `src/index.ts`. */
  readonly via: string
  /** Set when only one supported major has this. See `installedSdkMajor`. */
  readonly sinceMajor?: number
}

/** A root-bar value the layer deliberately does NOT re-export. */
interface Outside {
  readonly verdict: 'out'
  /** Why. Enforced non-trivial: an exception without a reason is never revisited. */
  readonly reason: string
  /** Set when only one supported major exports this. See SINCE_5 below. */
  readonly sinceMajor?: number
}

type Verdict = Inside | Outside

/**
 * Shared rationales. Grouping is honest here and mass-fill is not: these symbols are out for the SAME
 * reason, and repeating a sentence 12 times would make the table look considered without being more
 * so. What is forbidden is a reason nobody thought about — not a reason that covers a real group.
 */
const R = {
  RUNTIME:
    'runtime the SDK owns and executes (G2, rules/sdk-runtime.md) — the layer wires it, never re-publishes it',
  MEMORY:
    'memory engine is SDK runtime (G2); the layer exposes it declaratively through MemoryCapability instead',
  BUDGET:
    'cost/budget accounting is SDK runtime; the framework side is theokit/server/cost, a different seam',
  SCHEDULING:
    'job/cron/task scheduling is SDK runtime; the framework equivalent is theokit/server/{jobs,cron}',
  SESSION_LIFECYCLE:
    'session retention/destruction primitive — candidate for the M71/M72 session module, not decided here',
  INTERNAL:
    'internal helper of the SDK with no consumer-facing contract; exposing it would freeze an implementation detail',
  PUBLIC_NO_CONSUMER:
    'marked @public by the SDK, but no consumer in this repo or in the measured downstream product calls it — crossing it would publish surface G7 cannot justify. Revisit on the first real ask, not before',
  SCOPING_IS_FRAMEWORK:
    'conversation-id scoping is framework core per ADR-0040 (the {resource,thread} carve-out); the layer already publishes deriveConversationId/parseConversationId, and a second vocabulary for the same concept would split it',
  PURE_CONVERTER:
    'a pure converter/decision with no runtime to wire — out for lack of a consumer, not because the SDK executes it',
  OWN_SURFACE:
    'the layer publishes its own primitive under this name; re-exporting the SDK one would shadow it',
  RENAMED:
    'crosses under a non-colliding name (see the M91 block in src/index.ts) — the source name is taken here',
  GUARDRAILS:
    'the layer ships its own guardrail pipeline (src/guardrails); a second, differently-shaped one would split the contract',
  CREDENTIALS:
    'credential/env resolution — M79 owns the decision to publish it, against the 4.49 surface not the 4.40 one',
} as const

/**
 * The major of the SDK actually installed. The supported range spans two
 * (`^4.52.1 || ^5.0.0`), so "this export is absent" only means the table has rotted when the
 * installed major is one that should have it.
 */
function installedSdkMajor(): number {
  const require_ = createRequire(import.meta.url)
  const { version } = require_('@theokit/sdk/package.json') as { version: string }
  return Number(version.split('.')[0])
}

const ROOT_BAR_VERDICTS: Record<string, Verdict> = {
  // ── Arrived with `@theokit/sdk@5.x`; `sinceMajor` keeps them out of the orphan guard on 4.x.
  Workflow: { sinceMajor: 5, verdict: 'out', reason: R.PUBLIC_NO_CONSUMER },
  agentStep: { sinceMajor: 5, verdict: 'out', reason: R.PUBLIC_NO_CONSUMER },
  fn: { sinceMajor: 5, verdict: 'out', reason: R.PUBLIC_NO_CONSUMER },
  isValidTaskId: { sinceMajor: 5, verdict: 'out', reason: R.SCHEDULING },
  TASK_RESERVED_PREFIXES: { sinceMajor: 5, verdict: 'out', reason: R.SCHEDULING },
  readSessionMessages: {
    sinceMajor: 5,
    verdict: 'out',
    reason:
      'reads a stored session back as structured messages, so a host that repointed a session can ' +
      're-render it. Real and useful, and nothing in this repo or the measured downstream product ' +
      'calls it yet — the layer that would is a UI, not this one. Crossing it now would publish ' +
      'surface on a guess about who wants it; revisit on the first real ask',
  },
  // ── IN — errors + core primitives (M58/M63/M78 blocks) ──────────────────────────────────────
  Agent: { verdict: 'in', via: 'M103 narrowed re-export' },
  AgentDisposedError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  AgentRunError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  AuthenticationError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  ConfigurationError: { verdict: 'in', via: './errors.js (layer home module)' },
  IntegrationNotConnectedError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  InvalidTaskIdError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  JudgeCredentialError: {
    verdict: 'in',
    via: 'loop/goal-runner.ts -> loop/index.ts (NOT the /errors subpath)',
  },
  MemoryAdapterError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  NetworkError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  RateLimitError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  TaskNotFoundError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  TheokitAgentError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  UnknownAgentError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  UnsupportedBudgetOperationError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  UnsupportedRunOperationError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  UnsupportedTaskOperationError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  isTransientError: { verdict: 'in', via: "export * from '@theokit/sdk/errors'" },
  Provider: { verdict: 'in', via: 'M58 core block' },
  Squad: { verdict: 'in', via: 'M58 core block' },
  Tool: { verdict: 'in', via: 'M58 core block' },
  setDiagnosticsSink: { verdict: 'in', via: 'theokit#173 diagnostics block' },
  // ── IN — the M67 family itself ──────────────────────────────────────────────────────────────
  applySecurityFloor: { verdict: 'in', via: 'M67 config/trust/wiring block' },
  auditEnvReachability: { verdict: 'in', via: 'M67 config/trust/wiring block' },
  foldLayers: { verdict: 'in', via: 'M67 config/trust/wiring block' },
  recordWiring: { verdict: 'in', via: 'M67 config/trust/wiring block' },
  resolveTrustPosture: { verdict: 'in', via: 'M67 config/trust/wiring block' },
  verifyLayerOrdering: { verdict: 'in', via: 'M67 config/trust/wiring block' },

  // ── OUT — name owned by the layer ───────────────────────────────────────────────────────────
  AgentBuilder: { verdict: 'out', reason: R.OWN_SURFACE },
  BudgetExceededError: { verdict: 'out', reason: R.RENAMED },
  UnicodeNormalizer: { verdict: 'out', reason: R.GUARDRAILS },
  Security: { verdict: 'out', reason: R.GUARDRAILS },

  // ── OUT — SDK runtime (G2) ──────────────────────────────────────────────────────────────────
  AgentFactory: { verdict: 'out', reason: R.RUNTIME },
  Theokit: { verdict: 'out', reason: R.RUNTIME },
  Plugin: { verdict: 'out', reason: R.RUNTIME },
  PermissionPlugin: { verdict: 'out', reason: R.RUNTIME },
  PermissionEngine: { verdict: 'out', reason: R.RUNTIME },
  EventBus: { verdict: 'out', reason: R.RUNTIME },
  emitRunEvent: { verdict: 'out', reason: R.RUNTIME },
  runGoalLoop: { verdict: 'out', reason: R.RUNTIME },
  decideApproval: { verdict: 'out', reason: R.RUNTIME },
  applyMode: { verdict: 'out', reason: R.RUNTIME },
  GOAL_CONTINUATION_MARKER: { verdict: 'out', reason: R.RUNTIME },
  Skill: { verdict: 'out', reason: R.RUNTIME },
  SkillReadTool: { verdict: 'out', reason: R.RUNTIME },
  toShareGptTrajectory: { verdict: 'out', reason: R.PURE_CONVERTER },
  evaluateBlastRadius: { verdict: 'out', reason: R.PURE_CONVERTER },
  withBlastRadius: { verdict: 'out', reason: R.PURE_CONVERTER },
  UngatedCapabilityError: { verdict: 'in', via: 'M67 root-bar typed-errors block' },

  // ── OUT — memory engine ─────────────────────────────────────────────────────────────────────
  Memory: { verdict: 'out', reason: R.MEMORY },
  NoopMemoryProvider: { verdict: 'out', reason: R.MEMORY },
  migrateSqliteToLance: { verdict: 'out', reason: R.MEMORY },
  mkMemoryId: { verdict: 'out', reason: R.MEMORY },

  // ── OUT — cost / budget accounting ──────────────────────────────────────────────────────────
  Budget: { verdict: 'out', reason: R.BUDGET },
  TokenLimiter: { verdict: 'out', reason: R.BUDGET },
  UsageAccumulator: { verdict: 'out', reason: R.BUDGET },
  computeCost: { verdict: 'out', reason: R.BUDGET },
  getPricingEntry: { verdict: 'out', reason: R.BUDGET },
  chargeAndCheckThresholds: { verdict: 'out', reason: R.BUDGET },
  createCounterBudgetTracker: { verdict: 'out', reason: R.BUDGET },
  normalizeUsage: { verdict: 'out', reason: R.BUDGET },
  estimateTokens: { verdict: 'out', reason: R.BUDGET },

  // ── OUT — scheduling ────────────────────────────────────────────────────────────────────────
  JobQueue: { verdict: 'out', reason: R.SCHEDULING },
  Cron: { verdict: 'out', reason: R.SCHEDULING },
  Task: { verdict: 'out', reason: R.SCHEDULING },

  // ── OUT — session lifecycle / retention (M71, M72 territory) ────────────────────────────────
  guardSessionDestruction: { verdict: 'out', reason: R.SESSION_LIFECYCLE },
  planReaping: { verdict: 'out', reason: R.SESSION_LIFECYCLE },
  RetentionPolicyError: { verdict: 'out', reason: R.SESSION_LIFECYCLE },
  LiveSessionError: { verdict: 'out', reason: R.SESSION_LIFECYCLE },
  scopedConversationId: { verdict: 'out', reason: R.SCOPING_IS_FRAMEWORK },
  sessionScopePrefix: { verdict: 'out', reason: R.SCOPING_IS_FRAMEWORK },

  // ── OUT — credential / env (M79 territory) ──────────────────────────────────────────────────
  loadProjectEnv: { verdict: 'out', reason: R.CREDENTIALS },
  describeCredential: { verdict: 'out', reason: R.CREDENTIALS },
  SOVEREIGN_ENV_KEYS: { verdict: 'out', reason: R.CREDENTIALS },

  // ── OUT — internal helpers ──────────────────────────────────────────────────────────────────
  // B-029 — arrived with the floor. It has been in the SDK's root bar since 5.x and was invisible
  // here while the workspace resolved 4.52.1; narrowing the declared range is what surfaced it, and
  // this line is the "break the build ONCE" the assertion below asks for.
  //
  // It takes the SDK's `AgentOptions`, not this layer's definition, so a consumer holding a
  // `defineAgent` result could not feed it without reaching past the layer anyway. Measured before
  // claiming PUBLIC_NO_CONSUMER, which is an assertion about consumers rather than about taste:
  // 0 files in `packages/*/src`, 0 in `packages/*/tests`, and 0 in TheoCode's `packages/*/src` —
  // against probe controls of 3 (`resolveTrustPosture`) here and 90 (`@theokit/agents`) there, so
  // the zero is about the symbol and not about the query.
  effectiveToolNames: { verdict: 'out', reason: R.PUBLIC_NO_CONSUMER },
  describeAction: { verdict: 'out', reason: R.PUBLIC_NO_CONSUMER },
  normalizeSchema: { verdict: 'out', reason: R.INTERNAL },
  inferApiMode: { verdict: 'out', reason: R.INTERNAL },
  extractRawId: { verdict: 'out', reason: R.PUBLIC_NO_CONSUMER },
  preflightCheck: { verdict: 'out', reason: R.INTERNAL },
  withCwdMutex: { verdict: 'out', reason: R.INTERNAL },
  LayerOrderError: { verdict: 'in', via: 'M67 root-bar typed-errors block' },
  GenerateObjectError: { verdict: 'in', via: 'M67 root-bar typed-errors block' },
  StreamObjectError: { verdict: 'in', via: 'M67 root-bar typed-errors block' },
  ToolError: { verdict: 'in', via: 'M67 root-bar typed-errors block' },
}

const rootBarValues = (): string[] =>
  Object.keys(sdk as unknown as Record<string, unknown>).sort((a, b) => a.localeCompare(b))
const barrelValue = (name: string): unknown => (barrel as unknown as Record<string, unknown>)[name]
const sdkValue = (name: string): unknown => (sdk as unknown as Record<string, unknown>)[name]

describe('M67 T5 — root-bar coverage policy', () => {
  it('test_every_root_bar_VALUE_has_a_verdict', () => {
    const undecided = rootBarValues().filter((name) => ROOT_BAR_VERDICTS[name] === undefined)
    expect(
      undecided,
      'a new root-bar export must break the build ONCE; the fix is one line saying what was decided',
    ).toEqual([])
  })

  it('test_the_verdict_list_does_not_reference_a_NONEXISTENT_export', () => {
    // The inverse. Without it the table rots, holding decisions about symbols the SDK dropped.
    const present = new Set(rootBarValues())
    const installedMajor = installedSdkMajor()
    const orphans = Object.keys(ROOT_BAR_VERDICTS).filter((name) => {
      if (present.has(name)) return false
      const since = ROOT_BAR_VERDICTS[name].sinceMajor
      // Absent AND expected on this major — see the note on `sinceMajor`.
      return since === undefined || installedMajor >= since
    })
    expect(orphans, 'these have a verdict but the SDK no longer exports them').toEqual([])
  })

  it('test_every_OUT_verdict_has_a_non_trivial_reason', () => {
    const weak = Object.entries(ROOT_BAR_VERDICTS)
      .filter(([, v]) => v.verdict === 'out')
      .filter(([, v]) => (v as Outside).reason.trim().length <= 20)
      .map(([name]) => name)
    expect(weak, 'an exception without a reason is never revisited').toEqual([])
  })

  it('test_every_OUT_verdict_actually_stays_out', () => {
    // The symmetric check. Without it the table drifts in the other direction: a symbol starts
    // crossing (someone adds it to a block, or an `export *` widens upstream) while the table still
    // says it was kept out — and the written reason becomes a lie nobody notices.
    //
    // "Stays out" means: not the SAME object under the SAME name. A name the layer publishes with its
    // own meaning (`BudgetExceededError`, the delegation class) is legitimately out by this measure.
    const leaked = Object.entries(ROOT_BAR_VERDICTS)
      .filter(([, v]) => v.verdict === 'out')
      .filter(([name]) => barrelValue(name) !== undefined && barrelValue(name) === sdkValue(name))
      .map(([name]) => name)
    expect(leaked, 'declared `out` but crosses — update the verdict or remove the export').toEqual(
      [],
    )
  })

  it('test_every_IN_verdict_actually_crosses_with_referential_identity', () => {
    // `toBe`, not presence: if the build inlines the SDK the layer exports a COPY, `instanceof` goes
    // silently false across the boundary and no behavioural test turns red (M73).
    const broken = Object.entries(ROOT_BAR_VERDICTS)
      .filter(([, v]) => v.verdict === 'in')
      .filter(([name]) => barrelValue(name) !== sdkValue(name))
      .map(([name]) => name)
    expect(broken, 'declared `in` but does not cross as the same object').toEqual([])
  })
})
