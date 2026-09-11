import { describe, expect, it } from 'vitest'

import { applyCapabilities } from '../../src/capability/capability.js'
import { ContextWindowCapability } from '../../src/capability/agent-capabilities.js'
import { ModelCapability } from '../../src/capability/capabilities.js'
import { assembleM8CreateOptions } from '../../src/bridge/sdk-adapter-create-options.js'

/**
 * `@ContextWindow({ maxTokens })` reads as a compaction budget and is also the on-switch for
 * instruction discovery.
 *
 * The SDK constructs its `FileContextManager` only under `if (options.context !== undefined)`, and
 * `ContextWindowCapability` is the sole place this layer sets that field
 * (`capability/agent-capabilities.ts:60`). So declaring a compaction budget silently enables
 * discovery of `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules` and `.theokit/rules`; omitting
 * it leaves every instruction file on disk inert.
 *
 * Nothing said so. The option's whole surface is one key whose doc comment reads "Maximum tokens
 * before compaction triggers", and the module docblock above it is entirely about compaction and
 * strategy knobs. A consumer debugging "why is my CLAUDE.md ignored" has no path from the symptom to
 * this decorator.
 *
 * This file pins the coupling so it cannot drift back into being undocumented. If discovery ever
 * gets its own switch, the second test goes red and is the place to record that the coupling ended.
 */
describe('the context knob is also the instruction-discovery switch', () => {
  it('test_without_the_capability_no_context_reaches_the_sdk', () => {
    const compiled = applyCapabilities([new ModelCapability('m')])
    const { options } = assembleM8CreateOptions(compiled)
    expect(
      options.context,
      'context is set by something other than @ContextWindow — the coupling this file documents has moved',
    ).toBeUndefined()
  })

  it('test_declaring_a_compaction_budget_is_what_turns_discovery_on', () => {
    const compiled = applyCapabilities([
      new ModelCapability('m'),
      new ContextWindowCapability({ maxTokens: 1000 }),
    ])
    const { options } = assembleM8CreateOptions(compiled)
    expect(
      options.context,
      'the SDK builds its FileContextManager only when this field is present, so an absent ' +
        'context means CLAUDE.md and every rules directory are never read',
    ).toBeDefined()
  })
})
