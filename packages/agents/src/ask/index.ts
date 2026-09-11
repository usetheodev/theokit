/**
 * `@theokit/agents/ask` — M77: the channel for the agent to ask a human something mid-turn.
 *
 * A subpath rather than a member of the main barrel, for the same reason as `/hooks`: an app that
 * only defines an agent should not carry the machinery for a surface that renders prompts. The main
 * bundle sits at 34.7K against a 35K ceiling (see `../index.ts`), and the next symbol added there
 * breaks it.
 *
 * ## The two halves, and why they live together
 *
 * {@link createAskBridge} is the FRAMEWORK side: it holds the paused turn's resolver and settles it
 * when an answer arrives. {@link createPendingLedger} is the SURFACE side: it remembers what has
 * already been shown and answered, which the framework's stateless `list()` cannot.
 *
 * They are siblings of one problem — a human decision that outlives a single request — and splitting
 * them across subpaths would make a surface import two to do one thing.
 */
export {
  ConcurrentListenerError,
  ConcurrentQuestionError,
  QuestionAbandonedError,
  createAskBridge,
} from './ask-bridge.js'
export type { AskBridge, DisposeListener, ListenerOptions, PendingQuestion } from './ask-bridge.js'

export { createPendingLedger } from './pending-ledger.js'
export type { PendingItem, PendingLedger } from './pending-ledger.js'

export { askUserVia } from './ask-user-via.js'

/**
 * ## How the question tool reaches this channel — and what was NOT done
 *
 * The M77 milestone asked for `createQuestionTool` to take the bridge as its DEFAULT `askUser`, so
 * the tool is usable with no plumbing. What shipped is one line of plumbing instead, deliberately:
 *
 * ```ts
 * const bridge = createAskBridge()
 * defineAgent({ context: { askUser: askUserVia(bridge) }, … })
 * bridge.setListener(threadId, (q) => renderPrompt(q))
 * ```
 *
 * Two facts blocked the literal reading. `createQuestionTool` is a pure re-export of the SDK's tool
 * — not ours to give a default to — and the SDK already prefers `ctx.context.askUser` over the
 * baked-in callback, which is the seam this layer owns (`withRunContext`). Injecting a bridge into
 * every run context automatically would mean minting a process-wide instance and merging it into
 * user-supplied context behind their back: magic, and a collision with an app that supplies its own.
 *
 * The remaining gap is real but small — the app writes one line — and it is named here rather than
 * quietly counted as delivered.
 */

/**
 * B-061 — the type this barrel's own signatures NAME.
 *
 * It appeared in an exported signature and crossed nothing: a consumer could read the shape in the
 * emitted `.d.ts` and could only name it by importing the upstream package directly. The sixth
 * instance of the shape `bridge/index.ts` enumerates by issue number, and the first caught by a
 * guard that DERIVES the requirement from the built barrels rather than listing it
 * (`tests/unit/every-public-type-crosses-the-barrel.test.ts`).
 */
export type { TheokitAgentError } from '@theokit/sdk/errors'
