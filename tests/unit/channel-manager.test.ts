import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelManager } from '../../packages/theo/src/server/channel-manager.js'
import type { WebSocketLike } from '../../packages/theo/src/server/define-websocket.js'

function createMockWs(): WebSocketLike {
  return {
    send: vi.fn(),
    close: vi.fn(),
  }
}

describe('ChannelManager', () => {
  let manager: ChannelManager

  beforeEach(() => {
    manager = new ChannelManager()
  })

  describe('subscribe', () => {
    it('should add ws to room and increase room size', () => {
      // Given: a ws and a room name
      const ws = createMockWs()

      // When: ws subscribes to room
      manager.subscribe(ws, 'chat:lobby')

      // Then: room size is 1
      expect(manager.getRoomSize('chat:lobby')).toBe(1)
    })

    it('should allow multiple ws in same room', () => {
      // Given: two ws clients
      const ws1 = createMockWs()
      const ws2 = createMockWs()

      // When: both subscribe to same room
      manager.subscribe(ws1, 'chat:lobby')
      manager.subscribe(ws2, 'chat:lobby')

      // Then: room size is 2
      expect(manager.getRoomSize('chat:lobby')).toBe(2)
    })
  })

  describe('broadcast', () => {
    it('should send message to all ws in room', () => {
      // Given: two ws subscribed to same room
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      manager.subscribe(ws1, 'chat:lobby')
      manager.subscribe(ws2, 'chat:lobby')

      // When: broadcast to room
      manager.broadcast('chat:lobby', { type: 'hello' })

      // Then: both ws receive the message
      const expected = JSON.stringify({ type: 'hello' })
      expect(ws1.send).toHaveBeenCalledWith(expected)
      expect(ws2.send).toHaveBeenCalledWith(expected)
    })

    it('should exclude specified ws from broadcast', () => {
      // Given: two ws subscribed to same room
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      manager.subscribe(ws1, 'chat:lobby')
      manager.subscribe(ws2, 'chat:lobby')

      // When: broadcast excluding ws1
      manager.broadcast('chat:lobby', { type: 'hello' }, ws1)

      // Then: only ws2 receives the message
      expect(ws1.send).not.toHaveBeenCalled()
      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'hello' }))
    })

    it('should not throw when broadcasting to empty or non-existent room', () => {
      // Given: no subscriptions exist

      // When/Then: broadcast does not throw
      expect(() => manager.broadcast('nonexistent', { type: 'hello' })).not.toThrow()
    })
  })

  describe('broadcastAll', () => {
    it('should send message to all unique ws across rooms', () => {
      // Given: ws1 in room-a, ws2 in room-b, ws3 in both
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      const ws3 = createMockWs()
      manager.subscribe(ws1, 'room-a')
      manager.subscribe(ws2, 'room-b')
      manager.subscribe(ws3, 'room-a')
      manager.subscribe(ws3, 'room-b')

      // When: broadcastAll
      manager.broadcastAll({ type: 'global' })

      // Then: each ws receives exactly one message
      const expected = JSON.stringify({ type: 'global' })
      expect(ws1.send).toHaveBeenCalledTimes(1)
      expect(ws1.send).toHaveBeenCalledWith(expected)
      expect(ws2.send).toHaveBeenCalledTimes(1)
      expect(ws2.send).toHaveBeenCalledWith(expected)
      expect(ws3.send).toHaveBeenCalledTimes(1)
      expect(ws3.send).toHaveBeenCalledWith(expected)
    })
  })

  describe('unsubscribe', () => {
    it('should remove ws from room and decrease room size', () => {
      // Given: ws subscribed to room
      const ws = createMockWs()
      manager.subscribe(ws, 'chat:lobby')

      // When: ws unsubscribes
      manager.unsubscribe(ws, 'chat:lobby')

      // Then: room size is 0
      expect(manager.getRoomSize('chat:lobby')).toBe(0)
    })

    it('should clean up empty room from internal map', () => {
      // Given: ws subscribed and then unsubscribed
      const ws = createMockWs()
      manager.subscribe(ws, 'chat:lobby')
      manager.unsubscribe(ws, 'chat:lobby')

      // When: broadcast to that room
      // Then: no error and no messages sent
      expect(() => manager.broadcast('chat:lobby', { type: 'test' })).not.toThrow()
    })
  })

  describe('cleanup', () => {
    it('should remove ws from all subscribed rooms', () => {
      // Given: ws subscribed to room-a and room-b
      const ws = createMockWs()
      manager.subscribe(ws, 'room-a')
      manager.subscribe(ws, 'room-b')

      // When: cleanup ws
      manager.cleanup(ws)

      // Then: both rooms have size 0
      expect(manager.getRoomSize('room-a')).toBe(0)
      expect(manager.getRoomSize('room-b')).toBe(0)
    })

    it('should not affect other ws in the same rooms', () => {
      // Given: ws1 and ws2 in same room
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      manager.subscribe(ws1, 'chat:lobby')
      manager.subscribe(ws2, 'chat:lobby')

      // When: cleanup ws1
      manager.cleanup(ws1)

      // Then: ws2 still in room
      expect(manager.getRoomSize('chat:lobby')).toBe(1)
    })
  })

  describe('getRoomSize', () => {
    it('should return 0 for non-existent room', () => {
      expect(manager.getRoomSize('nonexistent')).toBe(0)
    })
  })
})
