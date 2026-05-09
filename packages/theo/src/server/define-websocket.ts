export interface WebSocketLike {
  send(data: string | Buffer): void
  close(code?: number, reason?: string): void
}

export interface WebSocketHandler {
  onOpen?: (ws: WebSocketLike, req: import('node:http').IncomingMessage) => void
  onMessage?: (ws: WebSocketLike, data: string | Buffer) => void
  onClose?: (ws: WebSocketLike, code: number, reason: Buffer) => void
  onError?: (ws: WebSocketLike, error: Error) => void
}

/**
 * Define a WebSocket endpoint handler.
 * Identity function — provides type inference for WebSocket handlers.
 */
export function defineWebSocket(handler: WebSocketHandler): WebSocketHandler {
  return handler
}
