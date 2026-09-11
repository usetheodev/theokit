/**
 * B-004 — the routes by which a raw setting root does NOT reach the branded field.
 *
 * `setting-sources-gate.ts` claims "Nine other routes ARE refused, each verified against the emitted
 * declarations", and until this file that claim was prose supported by a measurement somebody ran
 * once. On this branch that is the recurring defect: a safety property asserted where nothing checks
 * it. The claim now has the mechanism it describes.
 *
 * `@ts-expect-error` inverts correctly for this. Each directive FAILS the typecheck if the line it
 * guards compiles — so weakening the brand does not quietly pass, it reports which route reopened.
 *
 * `Object.assign` is deliberately absent: it typechecks cast-free and the docblock names it as the
 * one escape the brand does not close. A test asserting otherwise would be the overstatement this
 * file exists to prevent.
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

// 4 — a spread of a compiled object
// @ts-expect-error a spread widens to string, which is not gated
setOnce(draft, 'settingSources', [...['project']], 'r4')

// 5 — an object literal with `as`  (as a plain widening, not `as never`)
// @ts-expect-error an `as string[]` is not an `as never`
setOnce(draft, 'settingSources', ['project'] as string[], 'r5')

// 6 — .concat
// @ts-expect-error .concat returns string[], ungated
setOnce(draft, 'settingSources', ([] as string[]).concat('project'), 'r6')

// 7 — .map
// @ts-expect-error .map erases the literal type, and the brand with it
setOnce(
  draft,
  'settingSources',
  ['project'].map((s) => s),
  'r7',
)

// 8 — spread-widening
const widened = [...(['project'] as const)]
// @ts-expect-error spread-widening produces string[]
setOnce(draft, 'settingSources', widened, 'r8')

// 9 — satisfies
// @ts-expect-error satisfies checks, it does not brand
setOnce(draft, 'settingSources', ['project'] satisfies string[], 'r9')

// 10 — .push
const pushed: string[] = []
pushed.push('project')
// @ts-expect-error .push builds a plain string[]
setOnce(draft, 'settingSources', pushed, 'r10')
