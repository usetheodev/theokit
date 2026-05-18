import { defineMiddleware } from 'theokit/server'

/**
 * Structured request log. Logs at request start; the framework's response
 * pipeline emits the status/duration at end (see logger.ts in theokit/server).
 */
export default defineMiddleware(async (req, _res, next) => {
  const started = Date.now()
  const method = req.method ?? 'GET'
  const url = req.url ?? '/'
  console.log(
    JSON.stringify({
      kind: 'req.start',
      method,
      url,
      ts: new Date().toISOString(),
    }),
  )
  await next()
  console.log(
    JSON.stringify({
      kind: 'req.end',
      method,
      url,
      ms: Date.now() - started,
    }),
  )
})
