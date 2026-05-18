# define-channel

Demonstrates `defineChannel` — the pub/sub primitive over WebSocket rooms.

The `notifications` channel keeps an in-memory room registry; clients connecting to the same URL path are placed in the same room. Any message from one subscriber is broadcast to all peers in the room.

## API

```ts
import { defineChannel } from 'theokit/server'

export default defineChannel({
  onSubscribe(ws, room) { /* called when client joins */ },
  onMessage(ws, room, data) { /* called per inbound message */ },
  onUnsubscribe(ws, room) { /* called on disconnect */ },
})
```

The `room` argument is derived from the request URL; the channel registry handles per-room socket fan-out.

For production use, replace the in-memory `Map<string, Set>` with a Redis pub/sub (or similar) so multiple server processes share state.

## Run the integration test

```bash
npx vitest run tests/unit/fixture-define-channel.test.ts
```
