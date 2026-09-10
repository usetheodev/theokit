/**
 * B-001 — `on_session_end`'s reason is a claim about a TYPE, so a type test is what holds it.
 *
 * `UNWIRED_EVENT_REASONS.on_session_end` says `seam: null` — nothing delivers this — because the
 * handler returns `void` and a handler that cannot return a decision cannot refuse an ending. That
 * is the whole justification for the one genuine gap the measurement found.
 *
 * WHAT THIS PINS, precisely — review corrected an overclaim here. The docblock used to say an SDK
 * change would fail this test. It would not: `@theokit/sdk` 4.52.1 types every hook as
 * `(ctx: unknown) => unknown | Promise<unknown>` and narrows nothing per-hook, so the SDK already
 * permits a decision-shaped return and will never "add" one. `HookHandlers['on_session_end']` is
 * THIS package's own hand-authored narrowing (`src/bridge/hook-handlers.ts`).
 *
 * So this guards an editorial choice, not an upstream contract — which is still worth guarding,
 * because that choice IS the justification for `seam: null`. A human widening the return type here
 * must also rewrite the reason. Saying which of the two it pins is the difference between a guard
 * and a claim.
 *
 * Discovery is governed by `packages/agents/vitest.config.ts:31-39` (`typecheck.enabled: true` at `:32`,
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
