import { describe, it, expect } from 'vitest'
import { defineChannel } from '../../packages/theo/src/server/define/define-channel.js'
import type { ChannelHandler } from '../../packages/theo/src/server/define/define-channel.js'

describe('defineChannel', () => {
  it('should return the same handler reference (identity)', () => {
    // Given: a channel handler
    const handler: ChannelHandler = {
      onSubscribe: () => {},
      onMessage: () => {},
      onUnsubscribe: () => {},
    }

    // When: defineChannel is called
    const result = defineChannel(handler)

    // Then: returned reference is the same object
    expect(result).toBe(handler)
  })

  it('should accept handler with all callbacks', () => {
    // Given: a handler with onSubscribe, onMessage, onUnsubscribe
    const handler = defineChannel({
      onSubscribe: (_ws, _room, _req) => {},
      onMessage: (_ws, _room, _data) => {},
      onUnsubscribe: (_ws, _room) => {},
    })

    // Then: all callbacks are present
    expect(handler.onSubscribe).toBeDefined()
    expect(handler.onMessage).toBeDefined()
    expect(handler.onUnsubscribe).toBeDefined()
  })

  it('should accept handler with only onMessage', () => {
    // Given: a handler with only onMessage
    const handler = defineChannel({
      onMessage: (_ws, _room, _data) => {},
    })

    // Then: onMessage is present, others undefined
    expect(handler.onMessage).toBeDefined()
    expect(handler.onSubscribe).toBeUndefined()
    expect(handler.onUnsubscribe).toBeUndefined()
  })

  it('should accept empty handler', () => {
    // Given: an empty handler
    const handler = defineChannel({})

    // Then: returned object is empty
    expect(handler).toEqual({})
  })

  it('should preserve typed message generic', () => {
    // Given: a handler with typed message
    interface ChatMessage {
      text: string
      sender: string
    }

    const handler = defineChannel<ChatMessage>({
      onMessage: (_ws, _room, data: ChatMessage) => {
        // Type inference: `data` is ChatMessage at the call site (verified
        // by the parameter annotation above; runtime body is a no-op).
        expect(typeof data.text).toBe('string')
      },
    })

    // Then: handler is defined
    expect(handler.onMessage).toBeDefined()
  })
})
