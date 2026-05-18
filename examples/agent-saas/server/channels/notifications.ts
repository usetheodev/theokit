import { defineChannel } from 'theokit/server'

/**
 * Notifications channel.
 *
 * Connecting clients subscribe to a room (derived from the URL path).
 * Other parts of the app can broadcast events into the room — e.g., when
 * a long-running agent task completes, notify the user's dashboard tab.
 *
 * Channel route: `ws://host/channels/notifications/<userId>`
 */
const rooms = new Map<string, Set<{ send: (msg: string) => void }>>()

export function broadcast(room: string, event: { kind: string; payload: unknown }): void {
  const set = rooms.get(room)
  if (!set) return
  const payload = JSON.stringify(event)
  for (const ws of set) ws.send(payload)
}

export default defineChannel<{ kind?: string }>({
  onSubscribe(ws, room) {
    let set = rooms.get(room)
    if (!set) {
      set = new Set()
      rooms.set(room, set)
    }
    set.add(ws)
    ws.send(JSON.stringify({ kind: 'subscribed', room }))
  },
  onUnsubscribe(ws, room) {
    const set = rooms.get(room)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) rooms.delete(room)
  },
  onMessage(ws, _room, data) {
    // Echo-style — clients can ping to keep the connection alive.
    if (data && (data as { kind?: string }).kind === 'ping') {
      ws.send(JSON.stringify({ kind: 'pong', ts: Date.now() }))
    }
  },
})
