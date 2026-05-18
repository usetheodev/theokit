# use-agent-stream-react

Demonstrates `useAgentStream` in plain React — no `@usetheo/ui`, no extra UI library. Proves the hook is usable in any React app.

The hook returns:

```ts
const { events, send, status, abort, reset } = useAgentStream<{ message: string }>('/api/agent')
```

- `events: AgentEvent[]` — accumulated runtime events
- `send(body)` — opens a new POST stream; cancels any in-flight one
- `status` — `'idle' | 'streaming' | 'done' | 'error'`
- `abort()` — cancels the in-flight stream
- `reset()` — aborts + clears state

Transport is `fetch + ReadableStream`, not `EventSource` (EventSource is GET-only; agent endpoints need POST + body).

## Run

```bash
npx vitest run tests/unit/fixture-use-agent-stream-react.test.ts
```
