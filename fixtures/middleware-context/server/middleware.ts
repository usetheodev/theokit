import type { IncomingMessage, ServerResponse } from 'node:http'

export default async function middleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => Promise<void>,
) {
  // Mark that middleware ran (via request header for context to read)
  req.headers['x-middleware-ran'] = 'true'

  await next()

  // After handler — add custom response header
  res.setHeader('X-Custom-Header', 'theo')
}
