import { defineTheoPlugin } from 'theokit/server'

/**
 * Example plugin: echoes the requestId into a response header on every reply.
 * Demonstrates the four-hook surface and `decorateRequest`.
 */
export const requestIdEchoPlugin = defineTheoPlugin({
  name: 'request-id-echo',
  register(app) {
    app.decorateRequest('startedAt', Date.now())

    app.addHook('onRequest', (ctx) => {
      ctx.response.setHeader('x-plugin-onrequest', '1')
    })

    app.addHook('preHandler', (ctx) => {
      ctx.response.setHeader('x-plugin-prehandler', '1')
    })

    app.addHook('onResponse', (ctx) => {
      ctx.response.setHeader('x-request-id-echo', ctx.requestId)
    })

    app.addHook('onError', (ctx) => {
      console.error(`[request-id-echo] request ${ctx.requestId} failed:`, ctx.error)
    })
  },
})
