import { describe, it, expect } from 'vitest'
import { defineWebSocket } from '../../packages/theo/src/server/define/define-websocket.js'

describe('defineWebSocket', () => {
  it('should return the same reference (identity)', () => {
    const handler = { onMessage: () => {} }
    expect(defineWebSocket(handler)).toBe(handler)
  })

  it('should preserve all callbacks', () => {
    const handler = {
      onOpen: () => {},
      onMessage: () => {},
      onClose: () => {},
      onError: () => {},
    }
    const result = defineWebSocket(handler)
    expect(result.onOpen).toBe(handler.onOpen)
    expect(result.onMessage).toBe(handler.onMessage)
    expect(result.onClose).toBe(handler.onClose)
    expect(result.onError).toBe(handler.onError)
  })

  it('should work with only onMessage', () => {
    const handler = { onMessage: () => {} }
    const result = defineWebSocket(handler)
    expect(result.onMessage).toBeDefined()
    expect(result.onOpen).toBeUndefined()
  })

  it('should work with empty handler', () => {
    const handler = {}
    const result = defineWebSocket(handler)
    expect(result).toEqual({})
  })
})
