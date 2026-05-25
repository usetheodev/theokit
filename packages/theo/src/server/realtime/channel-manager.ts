import type { WebSocketLike } from '../define/define-websocket.js'

export class ChannelManager {
  private rooms = new Map<string, Set<WebSocketLike>>()
  private wsRooms = new Map<WebSocketLike, Set<string>>()

  subscribe(ws: WebSocketLike, room: string): void {
    let roomSet = this.rooms.get(room)
    if (!roomSet) {
      roomSet = new Set()
      this.rooms.set(room, roomSet)
    }
    roomSet.add(ws)

    let wsSet = this.wsRooms.get(ws)
    if (!wsSet) {
      wsSet = new Set()
      this.wsRooms.set(ws, wsSet)
    }
    wsSet.add(room)
  }

  unsubscribe(ws: WebSocketLike, room: string): void {
    this.rooms.get(room)?.delete(ws)
    if (this.rooms.get(room)?.size === 0) this.rooms.delete(room)

    this.wsRooms.get(ws)?.delete(room)
    if (this.wsRooms.get(ws)?.size === 0) this.wsRooms.delete(ws)
  }

  broadcast(room: string, data: unknown, exclude?: WebSocketLike): void {
    const clients = this.rooms.get(room)
    if (!clients) return

    const msg = JSON.stringify(data)
    for (const ws of clients) {
      if (ws !== exclude) ws.send(msg)
    }
  }

  broadcastAll(data: unknown): void {
    const msg = JSON.stringify(data)
    const seen = new Set<WebSocketLike>()
    for (const clients of this.rooms.values()) {
      for (const ws of clients) {
        if (!seen.has(ws)) {
          ws.send(msg)
          seen.add(ws)
        }
      }
    }
  }

  getRoomSize(room: string): number {
    return this.rooms.get(room)?.size ?? 0
  }

  cleanup(ws: WebSocketLike): void {
    const rooms = this.wsRooms.get(ws)
    if (rooms) {
      for (const room of rooms) {
        this.rooms.get(room)?.delete(ws)
        if (this.rooms.get(room)?.size === 0) this.rooms.delete(room)
      }
    }
    this.wsRooms.delete(ws)
  }
}
