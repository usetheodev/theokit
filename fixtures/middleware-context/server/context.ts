import type { IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'

export async function createContext({ request }: { request: IncomingMessage }) {
  return {
    requestId: randomUUID(),
    middlewareRan: request.headers['x-middleware-ran'] === 'true',
  }
}
