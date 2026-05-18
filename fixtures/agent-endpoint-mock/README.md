# agent-endpoint-mock

Wire-format reference for `defineAgentEndpoint`. POST `/api/agent` emits one Server-Sent Events chunk per `AgentEvent` variant, in order. The infinite-stream route `/api/agent-infinite` exists to prove abort propagation.

This fixture is the canonical source of truth for "what does an `AgentEvent` look like on the wire?" — useful when integrating a non-TheoKit client (e.g., a Python SDK) or debugging a stream.

## Wire format

```
data: {"type":"message","content":"hello from the mock"}\n\n
data: {"type":"tool_call","name":"search","args":{"q":"theokit"}}\n\n
data: {"type":"tool_result","name":"search","data":{"hits":0}}\n\n
data: {"type":"error","message":"simulated error (still part of the wire-format demo)"}\n\n
```

Headers:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`

## Run the integration test

```bash
npx vitest run tests/integration/fixture-agent-endpoint.test.ts
```

The test imports `agent.ts` and `agent-infinite.ts` directly and exercises them with a `Request` object — no dev server spin-up needed.
