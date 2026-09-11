/**
 * M84 — `@theokit/agents/client/react`: the hook, separated from the rest of the chain.
 *
 * The separation is not cosmetic. `@theokit/agents/client` is **React-free by contract** so that a
 * Node consumer — an in-process transport in a process with no UI — does not drag React into its
 * graph merely by importing a transport. Putting the two in a single entry did exactly that, and the
 * gate inherited from the CLI (`test_client_core_entry_imports_no_react`) failed on the first run.
 *
 * `react` is an **optional** peer of the package: anyone who never imports this entry does not need
 * it installed; anyone who does already has it, because a hook only runs inside a component.
 */
export { useAgent } from './client/use-agent.js'
export type {
  PendingApproval,
  UseAgentReturn,
  UseAgentOptions,
  UseAgentStatus,
} from './client/use-agent.js'

/**
 * B-061 — the type this barrel's own signatures NAME.
 *
 * It appeared in an exported signature and crossed nothing: a consumer could read the shape in the
 * emitted `.d.ts` and could only name it by importing the upstream package directly. The sixth
 * instance of the shape `bridge/index.ts` enumerates by issue number, and the first caught by a
 * guard that DERIVES the requirement from the built barrels rather than listing it
 * (`tests/unit/every-public-type-crosses-the-barrel.test.ts`).
 */
export type { WireMessage } from '@theokit/presenter/wire'
