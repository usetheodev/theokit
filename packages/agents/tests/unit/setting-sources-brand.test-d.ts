/**
 * B-004 — a setting root that no posture authorised must not be representable.
 *
 * Type-level, because the defect is: `setOnce(draft, 'settingSources', ['mdm'], 'cap')` typechecked
 * CAST-FREE against the emitted `.d.ts` while `define-agent.ts` claimed the field "can only ever
 * hold roots that some posture authorized". A runtime test cannot see that at all.
 *
 * `@ts-expect-error` inverts correctly for this: it FAILS the build when the line it guards
 * compiles, so before the brand landed this file was the red.
 */
import { createDraft, setOnce } from '../../src/capability/capability.js'
import { resolveSettingSources } from '../../src/bridge/setting-sources-gate.js'

const draft = createDraft()

// The gated path: the value came out of the gate, so it carries the brand.
setOnce(draft, 'settingSources', resolveSettingSources(undefined), 'gated')

// @ts-expect-error — a raw root never passed a TrustPosture, and the type says so
setOnce(draft, 'settingSources', ['mdm', 'team', 'user', 'plugins'], 'bypass')

// The same through a variable, which is how excess-property checking is normally escaped.
const raw = ['project'] as const
// @ts-expect-error — still ungated
setOnce(draft, 'settingSources', raw, 'bypass-via-variable')
