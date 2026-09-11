import { describe, expect, it } from 'vitest'

import { assembleM8CreateOptions } from '../../src/bridge/sdk-adapter-create-options.js'
import { applyCapabilities } from '../../src/capability/capability.js'
import { ModelCapability } from '../../src/capability/capabilities.js'
import { SessionStoreCapability } from '../../src/capability/agent-capabilities.js'

/**
 * A shared session store could not be declared, so serverless and multi-pod were unreachable.
 *
 * The SDK takes `local.sessionStore` — a Postgres / Redis / KV / durable-object store used as the
 * PRIMARY session store and resume source, for deployments where the filesystem is ephemeral or the
 * next request lands on a different host. Measured: `sessionStore` returned 0 files in this layer.
 *
 * This layer's stated doctrine, repeated across roughly eight docblocks, is that a consumer should
 * not import `@theokit/sdk` directly. With no authoring surface for the store, the only way to reach
 * it was to do exactly that — so the doctrine and the capability disagreed, and the consumer paid.
 *
 * Both halves matter and the item says so: forwarding a capability whose TYPE cannot be named does
 * not close it. `SessionStore` crosses the barrel with the capability, and
 * `every-public-type-crosses-the-barrel.test.ts` now derives that requirement rather than listing
 * it — so this is the first of these where the type half is checked by construction.
 */
const STORE = {
  load: () => Promise.resolve(undefined),
  save: () => Promise.resolve(),
} as never

describe('a declared session store reaches Agent.create', () => {
  it('projects it into local.sessionStore', () => {
    const compiled = applyCapabilities([
      new ModelCapability('m'),
      new SessionStoreCapability(STORE),
    ])
    const { options } = assembleM8CreateOptions(compiled)

    expect(
      (options.local as Record<string, unknown> | undefined)?.sessionStore,
      'the store was declared and the SDK was never told — the agent resumes from local disk',
    ).toBe(STORE)
  })

  it('writes no local block when nothing was declared', () => {
    // The control. An empty `local` would hand `Agent.create` a claim about setting sources and a
    // cwd that no author made.
    const compiled = applyCapabilities([new ModelCapability('m')])
    const { options } = assembleM8CreateOptions(compiled)
    // The BLOCK, not the key. Asserting only `local?.sessionStore` passes for an unconditional
    // write too — it lands as `undefined` either way — while `local` itself has been created, which
    // is the claim about setting sources and a cwd that no author made. Measured: the mutation
    // survived until this line changed.
    expect(options.local, 'an empty local block was sent for an agent that declared none').toBe(
      undefined,
    )
  })

  it('reports the capability as applied', () => {
    // `applied` drives the observability log. A projection nothing records is one nobody can tell
    // ran — the wiring triad's third pillar.
    const compiled = applyCapabilities([
      new ModelCapability('m'),
      new SessionStoreCapability(STORE),
    ])
    expect(assembleM8CreateOptions(compiled).applied).toContain('sessionStore')
  })
})
