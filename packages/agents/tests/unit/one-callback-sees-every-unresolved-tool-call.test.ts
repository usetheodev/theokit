import { describe, expect, it, vi } from 'vitest'

import { assembleM8CreateOptions } from '../../src/bridge/sdk-adapter-create-options.js'
import { applyCapabilities } from '../../src/capability/capability.js'
import { ModelCapability } from '../../src/capability/capabilities.js'
import { CanUseToolCapability } from '../../src/capability/agent-capabilities.js'

/**
 * No callback saw a tool call the earlier steps did not resolve, so a tool nobody had declared an
 * opinion about simply ran.
 *
 * Measured: `canUseTool` returned 0 files in this layer, against controls of `hooks` 31 and
 * `session` 37. The SDK HAS the seam — `createPermissionPlugin({ canUseTool })`, invoked on an
 * `ask` verdict and **fail-closed** when absent — and this layer offered no way to reach it.
 *
 * ## The default is the half that matters
 *
 * A tool added AFTER the approvals were written must default to asking, not to allowing. The SDK's
 * engine already does this (`defaultAction: "ask"`, fail-closed since #55), and the value of wiring
 * the gate here is that an unresolved call now reaches somebody who can decide instead of being
 * blocked with nobody to ask.
 *
 * ## `updatedInput` is decided, upstream, and not by silence
 *
 * The spec lets a gate CORRECT a call, not only allow or refuse it. The SDK states the position in
 * `permission-plugin.ts`: "Arg rewrite (`updatedInput`) is intentionally NOT supported yet — the
 * `pre_tool_call` seam is veto-only (`{ block, message }`); a future enhancement can extend it."
 * Surfacing a gate that accepted an `updatedInput` this runtime would discard is the fabricated
 * mechanism this backlog keeps finding; the narrower contract is carried as it is.
 */
const GATE = vi.fn(() => ({ behavior: 'allow' as const }))

describe('one callback sees every tool call the earlier steps did not resolve', () => {
  it('reaches Agent.create as a permission plugin', () => {
    const compiled = applyCapabilities([new ModelCapability('m'), new CanUseToolCapability(GATE)])
    const { options, applied } = assembleM8CreateOptions(compiled)

    expect(
      options.plugins,
      'the gate was declared and the SDK was never given it — an unresolved call had nobody to ask',
    ).toHaveLength(1)
    expect(applied).toContain('canUseTool')
  })

  it('composes with code plugins rather than replacing them', () => {
    // The control that matters for a consumer who already registers lifecycle plugins: the gate is
    // appended, so declaring it does not silently drop what was there.
    const compiled = applyCapabilities([new ModelCapability('m'), new CanUseToolCapability(GATE)])
    compiled.plugins = [{ name: 'existing', register: () => {} }] as never
    expect(assembleM8CreateOptions(compiled).options.plugins).toHaveLength(2)
  })

  it('adds no plugin when no gate was declared', () => {
    // The second control. An empty permission plugin would install a gate that blocks every `ask`
    // verdict with nobody to consult — strictly worse than the absence it replaced.
    const compiled = applyCapabilities([new ModelCapability('m')])
    expect(assembleM8CreateOptions(compiled).options.plugins).toBeUndefined()
  })
})
