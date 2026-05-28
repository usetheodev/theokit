import { describe, it, expect, beforeEach, vi } from 'vitest'

import { createCacheEngine } from '../../packages/theo/src/cache/cache-engine.js'
import { defineCachedRoute } from '../../packages/theo/src/cache/define-cached-route.js'
import { InMemoryCacheAdapter } from '../../packages/theo/src/cache/in-memory-adapter.js'
import type { CacheEngine } from '../../packages/theo/src/cache/cache-engine.js'

function makeCtx(req: Request): {
  query: undefined
  body: undefined
  params: undefined
  request: Request
  ctx: unknown
} {
  return {
    query: undefined,
    body: undefined,
    params: undefined,
    request: req,
    ctx: undefined,
  }
}

describe('defineCachedRoute', () => {
  let engine: CacheEngine
  beforeEach(() => {
    engine = createCacheEngine({ storage: new InMemoryCacheAdapter() })
  })

  describe('config-time validation', () => {
    it('throws on negative maxAge', () => {
      expect(() =>
        defineCachedRoute(engine, {
          cache: { maxAge: -1 },
          handler: () => Response.json({ ok: true }),
        }),
      ).toThrow(/Invalid maxAge/)
    })

    it('throws on empty cacheVersion', () => {
      expect(() =>
        defineCachedRoute(engine, {
          cache: { cacheVersion: '' },
          handler: () => Response.json({ ok: true }),
        }),
      ).toThrow(/cacheVersion must be non-empty/)
    })

    it('EC-19: throws on negative maxEntrySize', () => {
      expect(() =>
        defineCachedRoute(engine, {
          cache: { maxEntrySize: -1 },
          handler: () => Response.json({ ok: true }),
        }),
      ).toThrow(/Invalid maxEntrySize/)
    })
  })

  describe('method bypass (ADR D8)', () => {
    it('default methods GET/HEAD only — POST bypasses cache', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => {
          calls++
          return Response.json({ calls })
        },
      })
      const req = new Request('https://x/api', { method: 'POST' })
      await route.handler(makeCtx(req))
      await route.handler(makeCtx(req))
      expect(calls).toBe(2)
    })

    it('custom methods include POST', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60, methods: ['POST'] },
        handler: () => {
          calls++
          return Response.json({ calls })
        },
      })
      const req = new Request('https://x/api', { method: 'POST' })
      await route.handler(makeCtx(req))
      await route.handler(makeCtx(req))
      expect(calls).toBe(1)
    })
  })

  describe('happy path: miss → hit', () => {
    it('first request misses, second hits', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => {
          calls++
          return Response.json({ calls })
        },
      })
      const req = new Request('https://x/api')
      const r1 = await route.handler(makeCtx(req))
      const r2 = await route.handler(makeCtx(req))
      expect(calls).toBe(1)
      expect(await r1.json()).toEqual({ calls: 1 })
      expect(await r2.json()).toEqual({ calls: 1 })
    })

    it('emits X-Theo-Cache header in non-production', async () => {
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => Response.json({ ok: true }),
      })
      const req = new Request('https://x/api')
      const r1 = await route.handler(makeCtx(req))
      const r2 = await route.handler(makeCtx(req))
      expect(r1.headers.get('X-Theo-Cache')).toBe('MISS')
      expect(r2.headers.get('X-Theo-Cache')).toBe('HIT')
    })

    it('emits Cache-Control header derived from maxAge+swr', async () => {
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60, swr: 300 },
        handler: () => Response.json({ ok: true }),
      })
      const r = await route.handler(makeCtx(new Request('https://x/api')))
      expect(r.headers.get('cache-control')).toBe('s-maxage=60, stale-while-revalidate=300')
    })

    it('different query (non-tracking) produces different cache keys', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => {
          calls++
          return Response.json({ calls })
        },
      })
      await route.handler(makeCtx(new Request('https://x/api?id=1')))
      await route.handler(makeCtx(new Request('https://x/api?id=2')))
      expect(calls).toBe(2)
    })

    it('utm_source variations share a single cache entry', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => {
          calls++
          return Response.json({ calls })
        },
      })
      await route.handler(makeCtx(new Request('https://x/api?utm_source=email')))
      await route.handler(makeCtx(new Request('https://x/api?utm_source=tw')))
      expect(calls).toBe(1) // tracking params stripped → same key
    })
  })

  describe('SWR (stale-while-revalidate)', () => {
    it('returns stale + schedules background refresh', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 0.01, swr: 60 },
        handler: () => {
          calls++
          return Response.json({ calls })
        },
      })
      const req = new Request('https://x/api')
      await route.handler(makeCtx(req))
      await new Promise((r) => setTimeout(r, 50))
      const r = await route.handler(makeCtx(req))
      expect(r.headers.get('X-Theo-Cache')).toBe('STALE')
      expect(await r.json()).toEqual({ calls: 1 })
      await new Promise((r) => setTimeout(r, 50))
      expect(calls).toBe(2)
    })
  })

  describe('bypassWhen', () => {
    it('truthy result bypasses cache', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: {
          maxAge: 60,
          bypassWhen: (req) => req.headers.get('x-no-cache') === '1',
        },
        handler: () => {
          calls++
          return Response.json({ calls })
        },
      })
      const req = new Request('https://x/api', {
        headers: { 'x-no-cache': '1' },
      })
      await route.handler(makeCtx(req))
      await route.handler(makeCtx(req))
      expect(calls).toBe(2)
    })
  })

  describe('EC-2: varies cookie/set-cookie filter', () => {
    it('filters cookie + warns once per route', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60, varies: ['accept', 'cookie'] },
        handler: () => Response.json({ ok: true }),
      })
      // First call triggers warn (during config wrap? actually during construction)
      const calls = warnSpy.mock.calls.filter((c) => String(c[0] ?? '').includes('cookie'))
      expect(calls.length).toBe(1)
      await route.handler(makeCtx(new Request('https://x/api')))
      warnSpy.mockRestore()
    })
  })

  describe('D7 / EC-2 main: Set-Cookie auto-bypass', () => {
    it('does NOT cache response with Set-Cookie + warns once', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => {
          calls++
          return new Response(JSON.stringify({ calls }), {
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'session=abc',
            },
          })
        },
      })
      await route.handler(makeCtx(new Request('https://x/api')))
      await route.handler(makeCtx(new Request('https://x/api')))
      expect(calls).toBe(2)
      const setCookieWarns = warnSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('Set-Cookie'),
      )
      expect(setCookieWarns.length).toBe(1)
      warnSpy.mockRestore()
    })
  })

  describe('D9: status >= 400 not cached', () => {
    it('404 response is NOT cached by default', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => {
          calls++
          return new Response('not found', { status: 404 })
        },
      })
      await route.handler(makeCtx(new Request('https://x/api')))
      await route.handler(makeCtx(new Request('https://x/api')))
      expect(calls).toBe(2)
    })

    it('cacheErrors=true caches 404', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60, cacheErrors: true },
        handler: () => {
          calls++
          return new Response('not found', { status: 404 })
        },
      })
      await route.handler(makeCtx(new Request('https://x/api')))
      const r2 = await route.handler(makeCtx(new Request('https://x/api')))
      expect(calls).toBe(1)
      expect(r2.headers.get('X-Theo-Cache')).toBe('HIT')
    })
  })

  describe('EC-3: oversized response', () => {
    it('body > maxEntrySize bypasses cache + warns once', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      let calls = 0
      const bigBody = 'x'.repeat(1024)
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60, maxEntrySize: 100 },
        handler: () => {
          calls++
          return new Response(bigBody)
        },
      })
      await route.handler(makeCtx(new Request('https://x/api')))
      await route.handler(makeCtx(new Request('https://x/api')))
      expect(calls).toBe(2)
      const oversizedWarns = warnSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('exceeds maxEntrySize'),
      )
      expect(oversizedWarns.length).toBe(1)
      warnSpy.mockRestore()
    })

    it('body within maxEntrySize cached normally', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60, maxEntrySize: 1000 },
        handler: () => {
          calls++
          return new Response('small')
        },
      })
      await route.handler(makeCtx(new Request('https://x/api')))
      const r2 = await route.handler(makeCtx(new Request('https://x/api')))
      expect(calls).toBe(1)
      expect(r2.headers.get('X-Theo-Cache')).toBe('HIT')
    })
  })

  describe('SSE auto-detect', () => {
    it('text/event-stream NOT cached', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => {
          calls++
          return new Response('data: x\n\n', {
            headers: { 'content-type': 'text/event-stream' },
          })
        },
      })
      await route.handler(makeCtx(new Request('https://x/api')))
      await route.handler(makeCtx(new Request('https://x/api')))
      expect(calls).toBe(2)
    })

    it('EC-11: transfer-encoding chunked NOT cached', async () => {
      let calls = 0
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => {
          calls++
          return new Response('streamed', {
            headers: { 'transfer-encoding': 'chunked' },
          })
        },
      })
      await route.handler(makeCtx(new Request('https://x/api')))
      await route.handler(makeCtx(new Request('https://x/api')))
      expect(calls).toBe(2)
    })
  })

  describe('plain return values (auto-JSON)', () => {
    it('handler returning plain object is wrapped as Response.json', async () => {
      const route = defineCachedRoute(engine, {
        cache: { maxAge: 60 },
        handler: () => ({ hello: 'world' }),
      })
      const r = await route.handler(makeCtx(new Request('https://x/api')))
      expect(r.headers.get('content-type')).toContain('application/json')
      expect(await r.json()).toEqual({ hello: 'world' })
    })
  })
})
