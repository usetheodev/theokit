import { describe, expect, it } from 'vitest'

import { AgentBuilder } from '../../src/bridge/agent-builder.js'
import type { CompiledAgentOptions } from '../../src/bridge/agent-compiler.js'
import { compileAgentDefinition } from '../../src/bridge/define-agent.js'
import { assembleM8CreateOptions } from '../../src/bridge/sdk-adapter-create-options.js'
import { TelemetryCapability } from '../../src/capability/agent-capabilities.js'
import { applyCapabilities } from '../../src/capability/capability.js'

/**
 * The SDK emits OpenTelemetry spans, and nothing on this surface could turn them on.
 *
 * `TelemetrySettings` is `@public` on the SDK type and has been since 4.52.1 — the version this
 * package depends on. It is a real implementation, not a placeholder: spans for `agent.send`,
 * `llm.call`, `tool.call` and `memory.search`, an exporter selector, a service name, and
 * auto-detection of Langfuse / Sentry / PostHog. `@opentelemetry/api` is an OPTIONAL peer, so a
 * consumer who has not installed it gets a silent no-op rather than a crash.
 *
 * This layer never projected the field. Measured before the fix: four occurrences of the word
 * "telemetry" in `packages/agents/src`, all four in prose — a doc comment about what a span would
 * record, a field description, two narrative paragraphs. Zero assignments. So an operator running
 * an agent built with `@theokit/agents` could not see a run as a trace alongside the rest of their
 * system, and the SDK underneath was ready to give them one.
 *
 * That is the M73 surface-parity invariant — this layer enriches the SDK and never reduces it —
 * failing in the quiet direction: not a wrong value, an absent door.
 *
 * The backlog item that produced this test (B-072) was filed as "no OpenTelemetry export", which
 * measurement contradicted. The export exists one layer down. Writing a tracer here would have
 * built a second one beside it, which is the outcome the item's own Definition of Done warned
 * against: "if implemented it does not become a second diagnostics vocabulary".
 */
describe('telemetry reaches the SDK from the authoring surface', () => {
  it('projects a declared telemetry block onto Agent.create()', () => {
    const compiled = {
      telemetry: { enabled: true, serviceName: 'checkout-agent' },
    } as CompiledAgentOptions

    const { options, applied } = assembleM8CreateOptions(compiled)

    expect(
      options.telemetry,
      'an operator declared telemetry and the SDK was never told, so the run produced no spans',
    ).toEqual({ enabled: true, serviceName: 'checkout-agent' })
    expect(applied).toContain('telemetry')
  })

  it('reaches the same field through the capability path', () => {
    // Both halves, because the two paths are asserted deep-equal by
    // `capability-zero-behavior.test.ts` and a projection wired to only one of them would satisfy
    // this file while breaking that one — the split-door failure the waist gate exists to catch.
    const draft = applyCapabilities([
      new TelemetryCapability({ enabled: true, exporter: 'otlp' }),
    ]) as unknown as CompiledAgentOptions

    expect(draft.telemetry).toEqual({ enabled: true, exporter: 'otlp' })
    expect(assembleM8CreateOptions(draft).options.telemetry).toEqual({
      enabled: true,
      exporter: 'otlp',
    })
  })

  it('reaches the same field through the fluent builder', () => {
    // The third authoring surface, and the one where declaring the method was NOT enough: this
    // builder's runtime is an explicit method table, not a proxy, so an entry added to the
    // interface and not to `makeBuilder` type-checks at every call site and drops the value on the
    // floor. Exactly the shape of defect this item is about, one layer up.
    const definition = AgentBuilder.create()
      .model('openai/gpt-5.4')
      .telemetry({ enabled: true, serviceName: 'checkout-agent' })
      .build()

    const compiled = compileAgentDefinition(definition)
    expect(compiled.telemetry).toEqual({ enabled: true, serviceName: 'checkout-agent' })
    expect(assembleM8CreateOptions(compiled).options.telemetry).toEqual({
      enabled: true,
      serviceName: 'checkout-agent',
    })
  })

  it('writes no telemetry key when none was declared', () => {
    // The control. A projection that assigned unconditionally would hand the SDK
    // `telemetry: undefined` for every agent that never asked — which reads, to anyone inspecting
    // the options, as a decision someone made about telemetry rather than the absence of one.
    const { options, applied } = assembleM8CreateOptions({} as CompiledAgentOptions)

    expect(Object.hasOwn(options, 'telemetry')).toBe(false)
    expect(applied).not.toContain('telemetry')
  })
})
