/**
 * B-001 — `on_session_end`'s reason is a claim about a TYPE, so a type test is what holds it.
 *
 * `UNWIRED_EVENT_REASONS.on_session_end` says `seam: null` — nothing delivers this — because the
 * handler returns `void` and a handler that cannot return a decision cannot refuse an ending. That
 * is the whole justification for the one genuine gap the measurement found.
 *
 * If a future SDK gives the handler a decision type, the justification stops being true and the
 * message becomes quietly wrong. This assertion is what says so, at compile time, instead of leaving
 * a stale sentence in a warning nobody re-reads.
 *
 * Discovery is governed by `packages/agents/vitest.config.ts:33` (`typecheck.enabled: true`,
 * `include: ['tests/**\/*.test-d.ts']`, package-local `tsconfig.test.json`) — NOT the root config.
 * The distinction is load-bearing: `usetheokit/theokit#357` measured six type tests in this very
 * package compiled by `tsc` as ordinary source, asserting nothing, because `expectTypeOf` is inert
 * without the typechecker driving it.
 */
import { expectTypeOf, it } from 'vitest'

import type { HookHandlers } from '../../src/bridge/hook-handlers.js'
import type { UnwiredEventReason } from '../../src/hooks/unwired-events.js'

it('test_on_session_end_cannot_express_a_refusal', () => {
  type Handler = NonNullable<HookHandlers['on_session_end']>
  // The assertion that carries B-001's central conclusion. A decision-shaped return type here
  // (`boolean`, `{ block: boolean }`, anything but void) breaks this line — which is the signal
  // that `UNWIRED_EVENT_REASONS.on_session_end.reason` needs rewriting.
  expectTypeOf<ReturnType<Handler>>().toEqualTypeOf<Promise<void> | void>()
})

it('test_a_covering_seam_is_a_string_and_an_absent_one_is_null', () => {
  // `seam: string | null`, never optional. `null` is a measured claim ("nothing covers this");
  // an optional field would be indistinguishable from an entry somebody left half-written.
  expectTypeOf<UnwiredEventReason['seam']>().toEqualTypeOf<string | null>()
})
