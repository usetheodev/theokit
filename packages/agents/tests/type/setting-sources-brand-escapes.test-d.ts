/**
 * B-004 — the routes by which a raw setting root does NOT reach the branded field.
 *
 * `setting-sources-gate.ts` claims "TEN other routes are refused, and they are refused by a TEST
 * rather than by this sentence", and until this file that claim was prose supported by a
 * measurement somebody ran once. (This comment quoted it as "Nine other routes ARE refused, each
 * verified against the emitted declarations" — wording that exists in no file. The gate's own
 * docblock records the nine-to-ten correction; the file quoting it did not follow.) On this branch that is the recurring defect: a safety property asserted where nothing checks
 * it. The claim now has the mechanism it describes.
 *
 * `@ts-expect-error` inverts correctly for this. Each directive FAILS the typecheck if the line it
 * guards compiles — so weakening the brand does not quietly pass, it reports which route reopened.
 *
 * Reflective writes are deliberately absent: `Object.assign`, `Reflect.set` and
 * `Object.defineProperty` all typecheck cast-free, and the gate's docblock names any reflective
 * write as a CLASS the brand does not close. A test asserting otherwise would be the overstatement
 * this file exists to prevent — and calling it "the one escape", as this comment did for a round
 * after the gate stopped, is that overstatement surviving the fix it was part of.
 *
 * Adopted from an independent review's scratch probe. Its two self-controls — a plain type error and
 * a deliberately unused directive — were run and both fired, proving the file is compiled and that
 * unused-directive detection reaches it. They are not kept, because a committed file that must fail
 * is a build nobody can run.
 */
import { createDraft, setOnce } from '../../src/capability/capability.js'
import type { CompiledAgentOptionsDraft } from '../../src/capability/capability.js'

const draft = createDraft()

// 1 — setOnce with a raw array
// @ts-expect-error a raw array never passed a TrustPosture
setOnce(draft, 'settingSources', ['project'], 'r1')

// 2 — setOnce through a generic wrapper
function wrap<K extends keyof CompiledAgentOptionsDraft>(
  d: CompiledAgentOptionsDraft,
  k: K,
  v: CompiledAgentOptionsDraft[K],
): void {
  setOnce(d, k, v, 'r2')
}
// @ts-expect-error a generic wrapper does not launder the brand
wrap(draft, 'settingSources', ['project'])

// 3 — a direct draft.settingSources =
// @ts-expect-error assigning the field directly skips the gate too
draft.settingSources = ['project']

// 4 — a spread of an array literal (structurally distinct from route 8's `as const` spread)
const spreadOfLiteral = [...['project']]
// @ts-expect-error a spread widens to string, which is not gated
setOnce(draft, 'settingSources', spreadOfLiteral, 'r4')

// 5 — an object literal with `as`  (as a plain widening, not `as never`)
const widenedByAs = ['project'] as string[]
// @ts-expect-error an `as string[]` is not an `as never`
setOnce(draft, 'settingSources', widenedByAs, 'r5')

// 6 — .concat
const concatenated = ([] as string[]).concat('project')
// @ts-expect-error .concat returns string[], ungated
setOnce(draft, 'settingSources', concatenated, 'r6')

// 7 — .map
const mapped = ['project'].map((s) => s)
// @ts-expect-error .map erases the literal type, and the brand with it
setOnce(draft, 'settingSources', mapped, 'r7')

// 8 — spread-widening
const widened = [...(['project'] as const)]
// @ts-expect-error spread-widening drops the brand while keeping the literal (`"project"[]`)
setOnce(draft, 'settingSources', widened, 'r8')

// 9 — satisfies
const satisfied = ['project'] satisfies string[]
// @ts-expect-error satisfies checks, it does not brand
setOnce(draft, 'settingSources', satisfied, 'r9')

// 10 — .push
const pushed: string[] = []
pushed.push('project')
// @ts-expect-error .push builds a plain string[]
setOnce(draft, 'settingSources', pushed, 'r10')

/*
 * The SIBLING field. `compatSources` is resolved by `resolveCompatSources`, guarded by the same
 * `ProjectSettingsGrant` and refused with the same `UntrustedSettingSourceError` — and its docblock
 * in `agent-compiler.ts` makes the same claim this file exists to mechanise: "a value here can only
 * hold a source some posture granted".
 *
 * Measured on 2026-09-11, with the route-1 line above as the control: the control errored (the brand
 * holds for `settingSources`) and `setOnce(draft, 'compatSources', ['claude-code'], 'cap')` compiled
 * cast-free. The gate was closed on one of the two fields one selection object feeds, while
 * `agent-capabilities.ts` writes both from that same object.
 *
 * It matters more than its twin, not less: `applyLocalSources` forwards this field to
 * `Agent.create({ local: { compatSources } })`, which reads `<cwd>/.claude/` — `hooks.json`
 * included, and that executes shell.
 */

// 11 — setOnce with a raw array
// @ts-expect-error a raw compat source never passed a TrustPosture
setOnce(draft, 'compatSources', ['claude-code'], 'r11')

// 12 — a direct draft.compatSources =
// @ts-expect-error assigning the field directly skips resolveCompatSources
draft.compatSources = ['claude-code']

// 13 — the narrowed object form, which carries the same authority as the bare string
// @ts-expect-error a hand-built narrowed source is not a resolved one
setOnce(draft, 'compatSources', [{ kind: 'claude-code', import: ['agents' as never] }], 'r13')
