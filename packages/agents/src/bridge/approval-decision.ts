/**
 * T2.1 — "may I auto-approve this tool right now?", as a symbol a surface can call.
 *
 * ## Why this exists next to `approval-posture.ts` rather than inside it
 *
 * {@link applyPosture} answers a different question: *"construct this agent with a gate?"*. It runs
 * once, at factory time, mutating an options bag. A surface asks per EVENT, before it decides
 * whether to render a prompt, and it has no options bag in hand.
 *
 * Until this function existed the only reachable half of the rule was the type. `approval-posture.ts`
 * says in writing that the consumer implemented the refusal twice and calls that a G12 violation —
 * and it was still true when this was written, because the enforcement stayed private. A rule that
 * lives in an unexported function lives once for the framework and zero times for everyone else.
 *
 * ## The invariant, stated once
 *
 * **Nothing auto-approves without positive evidence of enforced confinement.** Two consumer defects
 * reduce to it:
 *
 *  - *B-006* — an absent posture counts as unconfined. Absence of evidence is not evidence of
 *    confinement, and defaulting the other way silently disables the guard anywhere the posture has
 *    not been threaded through.
 *  - *B-021* — the headless path made the posture a required argument precisely because omitting it
 *    returned "approved" for `full-auto`, skipping the refusal the function exists for.
 *
 * `posture` stays OPTIONAL in the type so a surface mid-migration still compiles; it just gets
 * `false`. Making it required would be the stricter type and the worse outcome — a caller who cannot
 * yet supply it writes its own predicate instead, which is how the duplication started.
 *
 * The peers resolve omission the same way: `codex`'s `GranularApprovalConfig` auto-REJECTS an absent
 * field, and `opencode` resolves an absent rule to `ask`.
 */
import type { SandboxPosture } from '@theokit/sdk/sandbox'

/**
 * What a surface does about asking, as the three modes a coding agent actually offers.
 *
 * Not a framework invention: these are the values the only real consumer put in front of users, and
 * naming them here is what lets its two copies of the rule become one call.
 */
export const APPROVAL_MODES = ['suggest', 'auto-edit', 'full-auto'] as const

export type ApprovalMode = (typeof APPROVAL_MODES)[number]

/**
 * The runtime's permission posture each local mode means.
 *
 * Two vocabularies described the same axis and never met: this layer offers
 * `suggest | auto-edit | full-auto` — the values a real consumer put in front of users — while the
 * runtime resolves `default | plan | acceptEdits | bypass`. A reader of either found no way to the
 * other, and B-057 measured the consequence: `permissionMode` appeared in exactly one file, as a
 * mirrored field nothing branches on.
 *
 * `suggest` maps to `default`, NOT to something that asks unconditionally: `default` means the rules
 * decide and an unmatched call asks, so mapping it otherwise would discard every allow rule the
 * operator shipped.
 *
 * `full-auto` maps to `bypass`, which allows everything EXCEPT an explicit deny. That exception is
 * the load-bearing half — mapping the most permissive local mode onto something that also cleared
 * denies would turn a UI convenience into a policy override.
 *
 * **`plan` has no local counterpart, deliberately.** It is an explore-only posture an OPERATOR
 * imposes, not something this surface offers, and inventing a fourth local name for it would put a
 * decision that belongs to the operator into the user's mode picker. The absence is the mapping's
 * one honest hole, and it is named rather than filled.
 */
const PERMISSION_MODE_BY_APPROVAL_MODE = {
  suggest: 'default',
  'auto-edit': 'acceptEdits',
  'full-auto': 'bypass',
} as const satisfies Record<ApprovalMode, string>

/**
 * Translate a local approval mode into the runtime's permission mode.
 *
 * Typed on `ApprovalMode` so a fourth local mode is a COMPILE error here rather than a silent
 * fallthrough to a default posture — a map missing an entry reads as deliberate, and a posture
 * nobody chose is the shape this area keeps producing.
 */
export function approvalModeToPermissionMode(
  mode: ApprovalMode,
): (typeof PERMISSION_MODE_BY_APPROVAL_MODE)[ApprovalMode] {
  return PERMISSION_MODE_BY_APPROVAL_MODE[mode]
}

/**
 * Tools whose writes are bounded by their own write root rather than by the kernel.
 *
 * A CATALOG, not a policy. The names are the SDK factories' defaults (`apply-patch.ts:51`,
 * `edit-file.ts:155`, `write-file.ts:86`), so this answers "does this tool confine its own writes?"
 * — a fact about the SDK. It does NOT answer "may this tool run without asking a human?", which is
 * the product's to decide and is why {@link shouldAutoApprove} does not read this by default. See
 * the `auto-edit` branch there for what conflating the two cost.
 *
 * Genuinely immutable, not merely typed that way. `ReadonlySet` is erased at runtime, and one
 * `as Set<string>` on an approval gate reachable from every consumer of this package would widen
 * what auto-approves everywhere, with no diff in the module that owns the rule. `Object.freeze`
 * alone does not do it: a Set keeps its entries in internal slots rather than own properties, so
 * freezing leaves `add` fully functional — the mutators have to be replaced.
 */
export const WRITE_SCOPED_TOOLS: ReadonlySet<string> = immutableSet([
  'apply_patch',
  'edit_file',
  'write_file',
])

/** A `Set` whose mutators throw rather than a `Set` we promise not to mutate. */
function immutableSet(values: readonly string[]): ReadonlySet<string> {
  const set = new Set(values)
  const refuse = (op: string) => () => {
    throw new TypeError(
      `${op} on an immutable set: this is an approval catalog, and widening it at runtime would ` +
        `change what auto-approves for every consumer of this package. Pass your own set via ` +
        `\`writeScopedTools\` instead.`,
    )
  }
  return Object.freeze(
    Object.assign(set, {
      add: refuse('add'),
      delete: refuse('delete'),
      clear: refuse('clear'),
    }),
  )
}

export interface ShouldAutoApproveOptions {
  /**
   * Which tools this PRODUCT lets run without asking, in `auto-edit`.
   *
   * Required in practice: absent, `auto-edit` approves nothing. {@link WRITE_SCOPED_TOOLS} is
   * available for a product that wants every write-scoped tool, but passing it is a decision the
   * product makes, not a default it inherits.
   */
  writeScopedTools?: ReadonlySet<string>
}

/**
 * Whether a gated tool may run without asking a human.
 *
 * Pure over its arguments and holds no state, so a surface can call it per event.
 *
 * @param mode - what the user chose.
 * @param toolName - the name the model sees, which is also the approval key.
 * @param posture - the sandbox's own answer to "am I kernel-enforced right now?". Absent or
 *   unenforced means NOT confined, and nothing auto-approves.
 */
export function shouldAutoApprove(
  mode: ApprovalMode,
  toolName: string,
  posture?: Pick<SandboxPosture, 'enforced'>,
  options?: ShouldAutoApproveOptions,
): boolean {
  switch (mode) {
    case 'suggest':
      return false
    case 'auto-edit':
      // No posture needed: the bound is the tool's write root, and the user opted into edits
      // specifically. An unknown name is refused — the B-006 shape applied to names.
      //
      // An ABSENT set refuses everything, and that is the same shape one level up. Defaulting to
      // WRITE_SCOPED_TOOLS made the framework decide a policy it cannot know: which tools the
      // product registered, and under what names. Measured on the only real consumer — it registers
      // `apply_patch` AND `edit_file` (`chat.ts:272-273`) while auto-approving only the first, so
      // inheriting this default would have stopped a live, model-callable write tool from requiring
      // a human, as a side effect of deleting duplicated code. A product states its set; silence
      // asks.
      return options?.writeScopedTools?.has(toolName) ?? false
    case 'full-auto':
      // The one place the sandbox's own report is the deciding evidence.
      return posture?.enforced === true
  }
}
