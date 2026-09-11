/**
 * `grantGate` exists to be assigned to `HookHandlers['pre_tool_call']`. Nothing checked that it
 * fits.
 *
 * `GrantGateContext` and `Veto` are hand-mirrored from the SDK's `PreToolCallContext` and
 * `PreToolCallDecision`, so the only thing that can detect drift is a test — and the next SDK bump
 * to either shape would otherwise break a consumer's build, not ours, with the mirror's docblock
 * still telling them the assignment is the intended use.
 *
 * This is pillar 2 of the wiring triad for a seam whose only production caller is the barrel. The
 * assignment compiles today; this file is what keeps that true.
 */
import { expectTypeOf } from 'vitest'

import { grantGate } from '../../src/auth/permission-gate.js'
import type { Classification, GrantGateContext } from '../../src/auth/permission-gate.js'
import type { HookHandlers } from '../../src/bridge/hook-handlers.js'
import type { PermissionStore } from '../../src/auth/permission-store.js'

declare const store: PermissionStore

// Annotated rather than inferred: a bare ternary widens both arms to `{ governed: boolean }`, which
// is not the tagged union, and the resulting error would be about this file rather than about the
// assignment it exists to pin.
const classify = (ctx: GrantGateContext): Classification =>
  ctx.name === 'Bash'
    ? { governed: true, query: { tool: 'Bash', scope: '/repo', command: 'rm -rf /' } }
    : { governed: false }

// The assignment the gate's own docblock instructs a consumer to make. If the SDK's
// `PreToolCallContext` or `PreToolCallDecision` moves away from the mirrored shape, this line stops
// compiling HERE rather than in a consumer's repository.
const handlers: HookHandlers = {
  pre_tool_call: grantGate(store, classify),
}

// `expectTypeOf`, the convention the sibling type tests use, rather than a `void` discard the lint
// rejects. It also asserts something: the handler kept its type through the assignment instead of
// collapsing to `never` or `any`, either of which would make the line above compile while proving
// nothing.
expectTypeOf(handlers.pre_tool_call).not.toBeNever()
expectTypeOf(handlers.pre_tool_call).not.toBeAny()
