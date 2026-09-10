/**
 * B-012, fourth round — an output guard applied through `AgentRunner`, on BOTH channels.
 *
 * Every B-012 test before this one called `moderateOutputStream` directly, where the generator's
 * return value is a bare `'done'` string nobody asserts on. That absence is why the defect below
 * survived four review rounds: the redaction reached the EVENTS and the aggregate carried the
 * original text, so `run()` — the primary non-streaming API — delivered the secret while every test
 * was green.
 *
 * These tests assert on what a CONSUMER receives from the runner, which is the only place the two
 * channels are visible together.
 */
import { describe, expect, it, vi } from 'vitest'

interface StreamEvent {
  type: string
  [key: string]: unknown
}

const h = vi.hoisted(() => ({ rounds: [] as StreamEvent[][], calls: 0 }))

vi.mock('../../src/bridge/sdk-adapter.js', () => ({
  createSdkAgentStream:
    () =>
    (_message: string, _sessionId: string): AsyncIterable<StreamEvent> => {
      const events = h.rounds[Math.min(h.calls, h.rounds.length - 1)] ?? []
      h.calls += 1
      return (async function* () {
        for (const e of events) yield e
      })()
    },
}))

const { AgentRunner } = await import('../../src/loop/agent-runner.js')
const { applyCapabilities } = await import('../../src/capability/capability.js')
const { ModelCapability } = await import('../../src/capability/capabilities.js')
const { MainLoopCapability } = await import('../../src/capability/agent-capabilities.js')
const { GuardrailsCapability } = await import('../../src/capability/agent-capabilities.js')

const redactor = {
  name: 'redactor',
  checkOutput: (t: string) => ({ action: 'redact' as const, text: t.replace(/sk-\w+/g, '[R]') }),
}

function runnerWithGuard(): InstanceType<typeof AgentRunner> {
  const compiled = applyCapabilities([
    new ModelCapability('test-model'),
    new MainLoopCapability({ maxIterations: 1 }),
    new GuardrailsCapability([redactor]),
  ])
  return AgentRunner.fromSpec({
    compiled,
    name: 'guarded',
    strategy: 'simple-chat',
    maxIterations: 1,
  }).build()
}

function script(rounds: StreamEvent[][]): void {
  h.rounds = rounds
  h.calls = 0
}

const LEAKY_ROUND: StreamEvent[] = [
  { type: 'text_delta', content: 'the key is ' },
  { type: 'text_delta', content: 'sk-abc123' },
  { type: 'done' },
]

describe('an output guard applied through AgentRunner', () => {
  it('test_run_returns_the_moderated_response_not_the_original', async () => {
    // THE defect. `run()` drains `stream()` and returns its return value, which was accumulated in
    // `run-reflective-loop.ts` from the PRE-moderation events. The guard computed '[R]' and the
    // caller received 'sk-abc123'.
    script([LEAKY_ROUND])
    const result = await runnerWithGuard().run('hi', { apiKey: 'test-key' })

    expect(result.response).toBe('the key is [R]')
    expect(
      result.response,
      'run() is the primary non-streaming API — a redaction that misses it misses most consumers',
    ).not.toContain('sk-abc123')
  })

  it('test_the_streams_return_value_is_moderated_too', async () => {
    // The same channel, reached the other way: a consumer who drains the generator and reads its
    // return value rather than calling run().
    script([LEAKY_ROUND])
    const gen = runnerWithGuard().stream('hi', { apiKey: 'test-key' })
    let step = await gen.next()
    const seen: StreamEvent[] = []
    while (!step.done) {
      seen.push(step.value as StreamEvent)
      step = await gen.next()
    }

    expect(step.value.response).toBe('the key is [R]')
    expect(
      JSON.stringify(seen),
      'the event channel was already correct — this pins that it stays correct',
    ).not.toContain('sk-abc123')
  })

  it('test_an_unguarded_runner_is_untouched', async () => {
    // NFR: a runner with no output guard must behave exactly as before — no buffering, no rewrite.
    script([LEAKY_ROUND])
    const compiled = applyCapabilities([
      new ModelCapability('test-model'),
      new MainLoopCapability({ maxIterations: 1 }),
    ])
    const runner = AgentRunner.fromSpec({
      compiled,
      name: 'plain',
      strategy: 'simple-chat',
      maxIterations: 1,
    }).build()

    const result = await runner.run('hi', { apiKey: 'test-key' })
    expect(result.response).toBe('the key is sk-abc123')
  })
})
