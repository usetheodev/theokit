/**
 * The two wrappers that sit between `toAgentFactory` and the handle it serves.
 *
 * Extracted from `sdk-adapter.ts` when adding `generate` to the handle pushed that file past its
 * 500-line budget. The seam is not arbitrary: both functions answer one question — "what does this
 * handle do that the SDK's own does not?" — and neither knows how the agent was created.
 *
 * They are ordinary exports rather than `_`-prefixed test seams. Reaching them through
 * `toAgentFactory` needs an SDK runtime, an api key and a session, none of which is the thing under
 * test; a module of their own makes the honest import the normal one.
 *
 * @internal
 */
import type { Guardrail } from '../guardrails/index.js'
import { runInputGuards, runOutputGuards } from '../guardrails/index.js'

import type { SdkAgentHandle, SdkSendOptions, SdkTurnHandle } from './sdk-adapter.js'

/**
 * theokit#363 — carry the declared step ceiling onto the handle {@link toAgentFactory} serves.
 *
 * The streaming path owns its own `send`, so `applyStepCeiling` reaches it directly. This path hands
 * the agent to someone else (ACP, the delegation surfaces) and never sees their `send` call, so the
 * ceiling has to travel as a DEFAULT on the handle. Without it, the same definition capped on
 * `mountAgent` ran uncapped over ACP — the shape of bypass theokit#139 fixed for guardrails.
 *
 * The caller's own `maxIterations` WINS (spread last): a host asking for a different ceiling on one
 * turn is the per-run override this layer already honors for `model` and `reasoningEffort`.
 */
export function withStepCeiling(
  handle: SdkAgentHandle,
  maxIterations: number | undefined,
): SdkAgentHandle {
  // Nothing declared ⇒ the original handle, untouched — no wrapper, no key, the SDK default stands.
  if (maxIterations === undefined) return handle
  return {
    get agentId() {
      return handle.agentId
    },
    dispose: () => handle.dispose(),
    // Forwarded — see {@link SdkAgentHandle.generate} for why, and why it is not guarded.
    ...(handle.generate === undefined ? {} : { generate: handle.generate.bind(handle) }),
    send: (msg: string, sendOpts?: SdkSendOptions) =>
      handle.send(msg, { maxIterations, ...sendOpts }),
  }
}

export function withGuardrails(
  handle: SdkAgentHandle,
  guardrails: readonly Guardrail[] | undefined,
): SdkAgentHandle {
  // No guards ⇒ the original handle, untouched. Wrapping unconditionally would put an await on the
  // hot path of every served agent to enforce an empty list.
  if (guardrails === undefined || guardrails.length === 0) return handle
  return {
    get agentId() {
      return handle.agentId
    },
    dispose: () => handle.dispose(),
    // Forwarded — see {@link SdkAgentHandle.generate} for why, and why it is not guarded.
    ...(handle.generate === undefined ? {} : { generate: handle.generate.bind(handle) }),
    send: async (msg: string, sendOpts?: SdkSendOptions): Promise<SdkTurnHandle> => {
      // BEFORE the SDK sees it: a guard that blocks must stop the prompt from reaching the model,
      // not merely annotate it afterwards.
      const guarded = await runInputGuards(msg, guardrails)
      const turn = await handle.send(guarded, sendOpts)
      return {
        wait: async () => {
          const out = await turn.wait()
          if (out.result === undefined) return out
          return { ...out, result: await runOutputGuards(out.result, guardrails) }
        },
      }
    },
  }
}
