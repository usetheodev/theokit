---
'@theokit/agents': minor
---

Telemetry is reachable from the authoring surface: `defineAgent({ telemetry })`,
`AgentBuilder.create().telemetry(...)`, and `TelemetryCapability` all forward the SDK's
`TelemetrySettings` to `Agent.create({ telemetry })`, so a run emits OpenTelemetry spans for
`agent.send`, `llm.call`, `tool.call` and `memory.search`.

The SDK has emitted these spans since 4.52.1 — with an exporter selector, a service name, and
auto-detection of Langfuse / Sentry / PostHog. This layer never passed the field through, so an
operator could not turn any of it on and had no way to see a run as a trace alongside the rest of
their system. Measured before the change: four occurrences of the word "telemetry" in the package
source, all four in prose, zero assignments.

`@opentelemetry/api` is an OPTIONAL peer of the SDK. Without it, telemetry is a silent no-op even
with `enabled: true` — which is the usual explanation for a run that reports no spans, rather than a
misconfigured collector. Content (prompts, responses, tool args) is omitted unless you set
`includeContent: true`.
