import type { SettingSource, TrustPosture } from '@theokit/sdk'
import { TheokitAgentError } from '@theokit/sdk/errors'

import { currentOperatorPolicy } from '../config/operator-policy.js'

/**
 * M68 — the trust gate for `settingSources`.
 *
 * ## The defect this module closes
 *
 * `settingSources` enables on-disk config discovery. `'user'` reads `~/.theokit/` — the operator's
 * own machine, which no third party controls. `'project'` reads `<cwd>/.theokit/`, **including
 * `hooks.json`, which executes shell**.
 *
 * The previous API took `readonly SettingSource[]`, and its JSDoc justified the risk this way:
 * *"it is opt-in because `.theokit/` is the app's own repo (informed consent)"*. That premise holds
 * for a web app whose `cwd` is its own deploy. It does **not** hold for the class of product this
 * framework addresses — an agent whose `cwd` is a repository the user just cloned. There `.theokit/`
 * is attacker-controlled content, and enabling `'project'` is remote code execution on the first
 * `build()`.
 *
 * Documenting it did not prevent it. The measured consumer (TheoCode) did not trust the API: it
 * gated from the outside, with a `posture.allows` of its own (`chat.ts:386`, comment B-008). It
 * already **had** the right decision and could not pass it through, because the API only accepted
 * strings. The gate existed on its side and evaporated at the boundary.
 *
 * ## The evidence is the SDK's, not one invented here
 *
 * `TrustPosture` is `@theokit/sdk`'s own trust primitive, and `recordWiring`'s doc says *"a posture
 * is the only thing in this package that retains a capability"*. A bespoke type would make two trust
 * grammars coexist and drift apart (ADR 0063).
 */

/**
 * The framework's capability vocabulary — deliberately a single name (ADR 0065).
 *
 * `allows` is all-or-nothing in the SDK: every declared `K` gets the same boolean. A finer
 * vocabulary (`hooks`, `skills`, `subagents`, `mcp`) would promise the consumer it can gate one
 * without gating the other, and the primitive does not deliver that. An API that suggests a
 * distinction the runtime does not make teaches the wrong thing, and the error only surfaces when
 * somebody depends on the distinction.
 */
export type SettingSourceCapability = 'projectSettings'

/** Authorization to read config from the working directory. Requires the posture, never a claim. */
export interface ProjectSettingsGrant {
  /**
   * Typically the output of `resolveTrustPosture` — which is what gives it `source` (`'env' |
   * 'store' | 'default'`) and therefore a refusal that says WHERE the decision came from instead of
   * merely denying.
   */
  readonly trustedBy: TrustPosture<SettingSourceCapability>
}

/**
 * Which on-disk config roots the agent may read.
 *
 * The asymmetry is the design: `user` is a boolean because `~/.theokit/` belongs to the operator;
 * `project` requires evidence because `<cwd>/.theokit/` may not. Omitting a root is not enabling it
 * — never "enabling without a gate". The asymmetry is inherited from the SDK itself, whose
 * `TrustPostureInput.envOverride` documents that `false` and `undefined` both mean "the operator did
 * not turn it on", not "turned it off".
 */
export interface SettingSourcesSelection {
  /**
   * `~/.theokit/` — the operator's machine. No gate: no third party controls it.
   *
   * ## What this does NOT do today, stated here because the field is where it is read
   *
   * **Nothing reads the operator's root because of this flag.** `resolveSettingSources` forwards it
   * and `includesSetting` is called with exactly `"project"` and `"plugins"` — measured against
   * `@theokit/sdk@5.5.0`, not inferred: a grep of the published `dist` returns those two literals
   * and no `"user"`. So skills, subagents and rules under `~/.theokit/` do not reach a run.
   *
   * The admission already lived in `resolveSettingSources`' docblock, several hundred lines away,
   * while this line described the root as though the flag delivered it. Two docblocks disagreeing
   * about one field is how a consumer reads the reassuring one — and this is the one they read,
   * because it is the one attached to the thing they are typing.
   *
   * ## What the SDK DOES read from `~/.theokit/`, which is the part nothing gates
   *
   * Measured at 5.5.0: `pluginsRoot()` → `~/.theokit/plugins/model-providers`, the provider trust
   * file, the transcript root and the HTTP cache. Those are read UNCONDITIONALLY — no setting
   * source governs them, and this flag neither enables nor disables them. So the honest shape of
   * the gap is two halves, not one: a grant that governs nothing, beside a root that is read with
   * no grant at all.
   *
   * ## Why it is still accepted rather than refused
   *
   * Refusing would be the shape `HookGateUnsupportedError` uses for an unsupported option, and it
   * is wrong here: the measured consumer passes `user: true` on every run, including the
   * untrusted-directory path where it is the ONLY thing granted. A refusal would turn a graceful
   * degradation into a throw for the exact case the flag was designed to survive.
   *
   * Delivering it is not reachable from this layer alone: the SDK builds every root from `cwd`
   * (`projectConfigRoots(this.cwd, …)`, globbing within it, never walking up), so there is no
   * second root to hand it. The remaining options are an SDK-side root or reading and injecting
   * here, the way the reference consumer does. Tracked as B-024.
   */
  readonly user?: boolean
  /** `<cwd>/.theokit/` — controlled by whoever wrote the open repository. Requires evidence. */
  readonly project?: ProjectSettingsGrant
  /**
   * `<cwd>/.theokit/plugins` and any declared foreign dialect's plugin root — executable bundles.
   *
   * Same grant as `project`, deliberately: `PluginsManager.refresh` loads code out of the same
   * cwd-controlled tree, and the tree usually arrived with the clone.
   *
   * Absent from this interface until 2026-09-10, while `includesSetting` reads it
   * (`local-agent.ts:175`) — so a consumer wanting plugins had to bypass this facade, which is the
   * door it exists to close. `team` and `mdm` remain absent for the opposite reason: the SDK never
   * reads them.
   */
  readonly plugins?: ProjectSettingsGrant
  /**
   * `<cwd>/.claude/` — a FOREIGN configuration dialect, read only once declared
   * (`usetheokit/theokit-sdk#524`).
   *
   * ## Two questions, and which half of this field answers each
   *
   * The SDK's docblock separates them, and the separation is the whole point of `compatSources`:
   * a trust gate answers *"do I trust the code in this directory?"*; importing another product's
   * configuration answers *"do I want it imported into this one?"*. They come apart in the ordinary
   * case, because `.claude/` is populated in exactly the repository one trusts most — for a
   * different tool, by a teammate who never heard of this runtime.
   *
   * So the two are answered by two different things here, and it matters which:
   *
   * | Question | Answered by |
   * |---|---|
   * | do I want the foreign dialect imported? | **declaring this field at all** — omitting is not enabling |
   * | do I trust this directory's code to run? | the `TrustPosture` inside the grant |
   *
   * ## Why the grant is `ProjectSettingsGrant` and not a vocabulary of its own
   *
   * Not because the two questions are the same — they are not. Because a separate grant could not
   * carry the distinction even if it existed: `TrustPosture.allows` is `Record<K, boolean>` and the
   * SDK documents every value as moving together with the level, so a `'foreignDialects'` capability
   * beside `'projectSettings'` would promise an operator they can grant one and withhold the other,
   * and `resolveTrustPosture` would hand back the same boolean for both. That is precisely the
   * failure ADR 0065 exists to prevent, and inventing the second name would commit it while looking
   * like rigour.
   *
   * The consent half is therefore carried by the declaration, which is a real and sufficient
   * boundary: an operator who trusts a repository completely still reads no `.claude/` until they
   * write this field. What the grant adds on top is stricter than the SDK — there, listing a dialect
   * is enough — and the extra strictness is deliberate: this reads a `hooks.json` that executes
   * shell out of a directory that usually arrived with the clone.
   */
  readonly claudeCode?: ProjectSettingsGrant & {
    /**
     * #686 — WHICH surfaces of the foreign root to import. Absent means all of them, which is what
     * every caller before this meant and still means.
     *
     * The distinction is the reason the grant exists. `.claude/` usually arrives with the clone and
     * its `hooks.json` executes shell, so "take the skills, refuse the hooks" is the ordinary thing
     * to want — and before this the only choices were all of it or none of it.
     *
     * Requires `@theokit/sdk >= 5.4.0`, which is where the narrowed form landed. On an older SDK the
     * runtime drops an unrecognised shape in SILENCE, so declaring it there would import nothing at
     * all rather than importing less — refused at resolve time instead.
     */
    readonly import?: readonly CompatSurface[]
  }
}

/**
 * The surfaces a foreign configuration root can contribute.
 *
 * Written out rather than imported, for the same reason as the `claude-code` literal below:
 * `CompatSurface` does not exist in `@theokit/sdk@4.52.1`, this package's declared floor, and a gate
 * that cannot build against its own minimum dependency is worse than a constant that has been
 * checked. Verified against the published 5.4.0 `.d.ts`, where the union is
 * `"hooks" | "plugins" | "skills" | "subagents"` — note `subagents`, not `agents`.
 *
 * The two unions therefore DIVERGE, on purpose. `commands` is this layer's, because
 * `<projectDir>/.claude/commands/*.md` is read here and never by the SDK. A caller who builds SDK
 * `local` options directly cannot pass a value of this type — `TS2345`, with a compiler message
 * that names the mismatch and not the reason. Derive the SDK's list from this one minus the names
 * the SDK lacks rather than writing one list beside the other; a hand-copied list goes stale the
 * day a surface is added, which is the divergence #704 existed to remove.
 *
 * `context` is the foreign root's INSTRUCTIONS — `.claude/rules/*.md`. Added ahead of the SDK
 * release that honours it (usetheokit/theokit-sdk#652), and that ordering is safe in exactly one
 * direction: the SDK matches an `import` list PER SURFACE, so a name it does not recognise is never
 * matched and changes nothing. On an older SDK the rules load as they always did; on a newer one
 * the grant is what keeps them loading. The reverse — shipping the SDK gate first and this
 * vocabulary second — would take `.claude/rules` from every caller here with no name they could
 * write to ask for it back, which is the failure the paragraph above this one describes.
 */
// `commands` is loaded by THIS package rather than by the SDK, and was missing here until #704.
// An enumeration used to NARROW a root must cover every surface that root feeds: a name absent
// from the vocabulary is a surface the caller cannot ask for and cannot be told it lost.
export type CompatSurface = 'commands' | 'context' | 'hooks' | 'plugins' | 'skills' | 'subagents'

/**
 * Every surface the bare `'claude-code'` literal stands for.
 *
 * Written out so an operator refusal can express "all of it EXCEPT hooks", which the literal cannot.
 * It must stay in step with `CompatSurface`; the type is the contract and this is the enumeration of
 * it, which TypeScript checks by construction below.
 */
const EVERY_SURFACE: readonly CompatSurface[] = [
  'commands',
  'context',
  'hooks',
  'plugins',
  'skills',
  'subagents',
]

const IGNORE_WARNING = (): void => undefined

/** What `resolveCompatSources` returns: the whole root, or the root narrowed to some surfaces. */
export type ResolvedCompatSource =
  | 'claude-code'
  | { readonly kind: 'claude-code'; readonly import: readonly CompatSurface[] }

/**
 * Refusal to read the working directory for lack of trust.
 *
 * Descends from `TheokitAgentError` because typed errors are an unbreakable rule here — and because
 * `isTransientError` only sees this hierarchy. A class extending plain `Error` would be invisible to
 * the predicate that separates recoverable from unrecoverable (the defect M67 fixed in five
 * classes).
 */
export class UntrustedSettingSourceError extends TheokitAgentError {
  override readonly name = 'UntrustedSettingSourceError'

  constructor(
    message: string,
    /** Where the trust decision came from: `'env' | 'store' | 'default'`. */
    readonly trustSource: string,
    /** The refused capability. */
    readonly capability: SettingSourceCapability,
  ) {
    super(message)
  }
}

/**
 * Translate the declared selection into the `SettingSource`s the SDK accepts, refusing what the
 * posture does not authorize.
 *
 * Refuses rather than ignores (ADR 0064). Ignoring would leave the product running in the belief
 * that the repository's hooks are active — a silent failure mode, on the wrong side. The SDK already
 * picked that side for the same problem: `recordWiring` throws `UngatedCapabilityError` when
 * somebody registers a capability the posture does not gate.
 *
 * @throws {UntrustedSettingSourceError} when `project` is requested and the posture does not grant it.
 */
declare const GATED: unique symbol

/**
 * A root that some `TrustPosture` authorised — mintable ONLY by {@link resolveSettingSources}.
 *
 * ## Why a brand rather than a check
 *
 * `define-agent.ts` claimed `CompiledAgentOptions.settingSources` "can only ever hold roots that
 * some posture authorized". Measured 2026-09-10 against the emitted `.d.ts`:
 * `setOnce(draft, 'settingSources', ['mdm','team','user','plugins'], 'cap')` typechecked CAST-FREE.
 * A consumer writing a `Capability` — the documented way to extend the builder — reached the field
 * directly, and `project`, the root this gate exists to protect, is one of the two the SDK reads.
 *
 * The obvious fix was to read `draft.provenance` and refuse a write from a capability. It does not
 * work, measured: the LEGITIMATE builder path also writes through `setOnce`
 * (`capability/agent-capabilities.ts:155`), so provenance names a capability either way. What
 * actually differs is where the VALUE came from, and a brand is a value's provenance carried in its
 * type.
 *
 * ## What it does not do
 *
 * `as never` defeats it, like every brand — and so does ANY REFLECTIVE WRITE: `Object.assign`,
 * `Reflect.set`, `Object.defineProperty`. All three typecheck cast-free, measured, including from
 * inside a `Capability.apply`. That is a TypeScript-wide hole rather than a design choice here —
 * those APIs type their value as `any` or return `T & U` without checking `T`'s existing fields.
 *
 * Stated as a CLASS and not a list, after two rounds of naming one instance and calling it "the one
 * named exception". A list of escapes is a list somebody adds to; the property is that reflection
 * bypasses the type system, and enumerating members of that class understates it every time.
 *
 * TEN other routes are refused, and they are refused by a TEST rather than by this sentence:
 * `tests/type/setting-sources-brand-escapes.test-d.ts` guards each one with a `@ts-expect-error`,
 * so weakening the brand reports which route reopened instead of passing quietly. `setOnce` with a
 * raw array, `setOnce` through a generic wrapper, a direct `draft.settingSources =`, a spread of an
 * array literal, an object literal with `as`, `.concat`, `.map`, spread-widening, `satisfies`,
 * and `.push`.
 *
 * The count said "nine" while the list held ten — the same off-by-one this branch has now made
 * three times in a docblock. Counting them in a file that fails when the count is wrong is the
 * point of moving the claim into a test.
 *
 * So this refuses the accident — a capability author reaching for the field because it is there —
 * with the named exceptions above, and not a caller who has decided to bypass the gate. Naming them
 * exception is the point: the comment this replaced claimed an invariant nothing enforced, and a
 * replacement that overstated its own coverage would be the same defect one size smaller.
 *
 * ## Which roots the SDK actually READS
 *
 * `includesSetting` is called with exactly `"project"` and `"plugins"`
 * (`theokit-sdk/packages/sdk/src/internal/local-agent/local-agent.ts:174-175`). `user`, `team` and
 * `mdm` are accepted by the option and never consulted, so forwarding them would be a name the
 * runtime discards. `user` is still resolved here because it costs nothing and the SDK may start
 * reading it; `team` and `mdm` are deliberately absent from {@link SettingSourcesSelection} rather
 * than plumbed through to be ignored.
 */
export type GatedSettingSource = SettingSource & { readonly [GATED]: true }

/**
 * A compat source some `TrustPosture` authorised — mintable ONLY by {@link resolveCompatSources}.
 *
 * The twin of {@link GatedSettingSource}, and it exists because B-004 branded one of the two fields
 * one `SettingSourcesSelection` feeds and left the other bare. Measured 2026-09-11, with the
 * `settingSources` route as the control: the control errored, and
 * `setOnce(draft, 'compatSources', ['claude-code'], 'cap')` compiled CAST-FREE — while
 * `agent-compiler.ts` told the reader that field "can only hold a source some posture granted".
 *
 * It carries more authority than its twin, not less: `applyLocalSources` forwards it to
 * `Agent.create({ local: { compatSources } })`, which reads `<cwd>/.claude/` — `hooks.json`
 * included, and that executes shell. The refusal thrown below spells that out; the brand is what
 * stops a caller reaching the field without meeting the refusal at all.
 *
 * Same `GATED` symbol as the twin, so there is one brand in this module rather than two that must
 * be kept in step. The escapes are the same CLASS the twin documents — `as never` and any
 * reflective write — and are not re-listed here.
 */
export type GatedCompatSource = ResolvedCompatSource & { readonly [GATED]: true }

export function resolveSettingSources(
  selection: SettingSourcesSelection | undefined,
): readonly GatedSettingSource[] {
  if (selection === undefined) return []

  // The one place the brand is minted. Every push below has passed its posture check first, which is
  // the property the type then carries for the rest of the program.
  const sources: GatedSettingSource[] = []
  const gated = (root: SettingSource): GatedSettingSource => root as GatedSettingSource
  if (selection.user === true) sources.push(gated('user'))

  const grant = selection.project
  if (grant !== undefined) {
    const posture = grant.trustedBy
    if (!posture.allows.projectSettings) {
      throw new UntrustedSettingSourceError(
        `the \`project\` setting source reads <cwd>/.theokit/ — including shell-executing hooks — ` +
          `and the posture does not grant \`projectSettings\` (level: ${posture.level}, decided ` +
          `by: ${posture.source}). Grant it with a trusted posture, or omit \`project\` to read ` +
          `only the operator's own ~/.theokit/.`,
        posture.source,
        'projectSettings',
      )
    }
    sources.push(gated('project'))
  }

  // `plugins` takes the SAME grant as `project`, and not a weaker one: `PluginsManager.refresh`
  // loads executable bundles from `pluginBundleRoots(cwd, compatSources)` — the same cwd-controlled
  // tree `project` protects, which usually arrived with the clone. It is also the root this facade
  // withheld while the SDK genuinely reads it, which is the half of B-004 that survived measurement.
  const pluginsGrant = selection.plugins
  if (pluginsGrant !== undefined) {
    const posture = pluginsGrant.trustedBy
    if (!posture.allows.projectSettings) {
      throw new UntrustedSettingSourceError(
        `the \`plugins\` setting source loads executable plugin bundles from <cwd>/.theokit/plugins ` +
          `and from any declared foreign dialect, and the posture does not grant \`projectSettings\` ` +
          `(level: ${posture.level}, decided by: ${posture.source}). Grant it with a trusted ` +
          `posture, or omit \`plugins\` to load none.`,
        posture.source,
        'projectSettings',
      )
    }
    sources.push(gated('plugins'))
  }

  return sources
}

/**
 * The foreign configuration dialects this layer forwards, once the posture authorises them.
 *
 * ## Why it is a separate function and the same vocabulary
 *
 * Separate because the SDK takes them on a separate option (`local.compatSources`); the same
 * `ProjectSettingsGrant` because the thing being authorised is identical — reading a `hooks.json`
 * that executes shell out of a directory the operator does not necessarily control.
 *
 * ## What it deliberately does NOT do
 *
 * Validate the source NAME. The SDK DROPS an unrecognised name rather than turning it into
 * `<cwd>/<name>`, so a typo fails closed there; turning that into a throw here would convert a safe
 * default into a crash. This gate decides authorisation, never vocabulary.
 *
 * @throws {UntrustedSettingSourceError} when a source is requested and the posture does not grant it.
 */
export function resolveCompatSources(
  selection: SettingSourcesSelection | undefined,
  /**
   * Where a policy problem is reported. Optional because the two in-tree callers compile agents and
   * have no channel of their own; absent, the operator still hears it through `currentOperatorPolicy`'s
   * replay to whichever reader does have one.
   */
  onWarn?: (message: string) => void,
): readonly GatedCompatSource[] {
  if (selection?.claudeCode === undefined) return []

  const posture = selection.claudeCode.trustedBy
  if (!posture.allows.projectSettings) {
    throw new UntrustedSettingSourceError(
      `the \`claudeCode\` compat source reads <cwd>/.claude/ — including hooks.json, which ` +
        `executes shell — and the posture does not grant \`projectSettings\` (level: ` +
        `${posture.level}, decided by: ${posture.source}). That directory is usually written for a ` +
        `different product and often arrives with the repository, so it needs the same evidence ` +
        `<cwd>/.theokit/ does. Grant it with a trusted posture, or omit \`claudeCode\`.`,
      posture.source,
      'projectSettings',
    )
  }
  // The SDK declares `export type CompatSource = "claude-code"` — kebab, verified against the
  // PUBLISHED package rather than its source, by compiling the literal and its camelCase twin under
  // `--strict` (the `@ts-expect-error` on the twin was consumed, so the union really does reject it).
  //
  // Written out rather than imported, deliberately. `import type { CompatSource } from '@theokit/sdk'`
  // would turn a future disagreement into a compile error, which is strictly better — and it would
  // also stop this package compiling against `^4.52.1`, its own declared floor, where the type does
  // not exist yet. A gate that cannot build against its minimum dependency is worse than a constant
  // that has been checked. Import it when the floor moves past the version that introduced it.
  //
  // The check matters more than a spelling normally would: the SDK DROPS an unrecognised name in
  // silence, so a wrong constant here is a forward that is declared, gated, projected, and then
  // discarded with no message — the exact failure #634 exists to prevent.
  // #686 — an EMPTY list is the one input where "nothing" and "unset, so everything" are both
  // defensible readings, and picking either would settle a security question by convention. Refused
  // so the caller says which they meant.
  const surfaces = selection.claudeCode.import
  if (surfaces?.length === 0) {
    throw new UntrustedSettingSourceError(
      `\`claudeCode.import\` is an empty list, which could mean "no surfaces" or "unset, so all of ` +
        `them" — and the two differ by whether <cwd>/.claude/hooks.json executes. Name the surfaces ` +
        `you want, or omit \`import\` to take the whole root (usetheokit/theokit#686).`,
      selection.claudeCode.trustedBy.source,
      'projectSettings',
    )
  }
  // The two places the compat brand is minted. Both are past every posture check above, which is
  // the property the type then carries for the rest of the program.
  const gated = (source: ResolvedCompatSource): GatedCompatSource => source as GatedCompatSource

  // B-042 — the operator's refusal, applied where the root is granted. This gate's own message above
  // already says `.claude/` includes "hooks.json, which executes shell", so it is the one place that
  // knows both that the surface is being handed over and that shell comes with it.
  //
  // `EVERY_SURFACE` minus `hooks` rather than the bare literal: the literal means "all of them", and
  // a future surface added by the SDK would ride in on it. Narrowing fails CLOSED against that — a
  // surface this package has not heard of is not granted — which is the right direction here and is
  // stated rather than left to be discovered.
  if (currentOperatorPolicy(onWarn ?? IGNORE_WARNING).disableAllHooks === true) {
    const kept = (surfaces ?? EVERY_SURFACE).filter((surface) => surface !== 'hooks')
    // No empty `import` list: `#686` refuses that as ambiguous, and it would be a lie here anyway.
    // Nothing survived, so nothing is granted.
    return kept.length === 0 ? [] : [gated({ kind: 'claude-code', import: kept })]
  }

  if (surfaces !== undefined) return [gated({ kind: 'claude-code', import: [...surfaces] })]
  return [gated('claude-code')]
}
