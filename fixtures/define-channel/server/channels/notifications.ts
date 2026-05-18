import { defineChannel } from 'theokit/server'

/**
 * Notifications channel — pub/sub pattern over WebSocket rooms.
 *
 * Each connecting client subscribes to a room (the URL path acts as the
 * room key). When any client in the room sends a message, all subscribers
 * receive a broadcast.
 *
 * Wire shape:
 *   client → server: any JSON
 *   server → client: `{ kind: 'echo', from: '<room>', data: <message> }`
 */

// In-memory room → set-of-sockets registry. For real use this would be
// backed by Redis pub/sub or similar. Demo only.
const rooms = new Map<string, Set<{ send: (data: string) => void }>>()

export default defineChannel<unknown>({
  onSubscribe(ws, room) {
    const set = rooms.get(room) ?? new Set()
    set.add(ws)
    rooms.set(room, set)
    ws.send(JSON.stringify({ kind: 'joined', room }))
  },

  onMessage(_ws, room, data) {
    const set = rooms.get(room)
    if (!set) return
    const payload = JSON.stringify({ kind: 'echo', from: room, data })
    for (const peer of set) {
      peer.send(payload)
    }
  },

  onUnsubscribe(ws, room) {
    const set = rooms.get(room)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) rooms.delete(room)
  },
})
