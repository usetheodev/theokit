import type { WebSocketLike } from './define-websocket.js'
import type { IncomingMessage } from 'node:http'

export interface ChannelHandler<TMessage = unknown> {
  onSubscribe?: (ws: WebSocketLike, room: string, req: IncomingMessage) => void
  onMessage?: (ws: WebSocketLike, room: string, data: TMessage) => void
  onUnsubscribe?: (ws: WebSocketLike, room: string) => void
}

/**
 * Define a channel handler for WebSocket rooms.
 * Identity function — provides type inference for channel handlers.
 */
export function defineChannel<TMessage = unknown>(
  handler: ChannelHandler<TMessage>,
): ChannelHandler<TMessage> {
  return handler
}
