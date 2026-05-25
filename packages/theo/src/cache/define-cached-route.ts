import type { z } from 'zod'

import type { RouteConfig } from '../server/define/define-route.js'

import { getCacheControlHeader } from './cache-control-header.js'
import type { CacheEngine, CacheStatus } from './cache-engine.js'
import { THEO_T_PREFIX } from './constants.js'
import { deriveKey } from './key-derivation.js'
import type { CacheEntry } from './storage-adapter.js'
import { validateExpire, validateMaxAge, validateTags } from './validation.js'

/** Default 10 MB cap per cached route entry (EC-3). */
export const DEFAULT_MAX_ENTRY_SIZE = 10 * 1024 * 1024
const VARIES_IGNORED = new Set(['cookie', 'set-cookie'])

export interface RouteCacheOptions {
  maxAge?: number
  swr?: number
  tags?: string[]
  varies?: string[]
  getKey?: (req: Request) => string | Promise<string>
  bypassWhen?: (req: Request) => boolean | Promise<boolean>
  cacheVersion?: string
  cacheErrors?: boolean
  methods?: string[]
  cacheable?: (response: Response) => boolean
  /** Max body bytes (EC-3); default DEFAULT_MAX_ENTRY_SIZE. */
  maxEntrySize?: number
}

export interface CachedRouteConfig<
  TQuery extends z.ZodType = z.ZodUndefined,
  TBody extends z.ZodType = z.ZodUndefined,
  TParams extends z.ZodType = z.ZodUndefined,
  TCtx = unknown,
> extends Omit<RouteConfig<TQuery, TBody, TParams, TCtx>, 'handler'> {
  cache: RouteCacheOptions
  handler: (ctx: {
    query: z.infer<TQuery>
    body: z.infer<TBody>
    params: z.infer<TParams>
    request: Request
    ctx: TCtx
  }) => unknown
}

interface RouteCacheValue {
  body: string
  status: number
  headers: [string, string][]
}

const setCookieWarnedRoutes = new WeakSet()
const variesCookieWarnedRoutes = new WeakSet()
const oversizedWarnedRoutes = new WeakSet()

/**
 * Wrap a `RouteConfig` with cache-aware handler logic.
 *
 * Architecture: wraps the user `handler` so cache lookup happens AT
 * handler-invocation time, AFTER router middleware (auth/csrf/etc) ran.
 * This structurally satisfies EC-4 (cache-after-auth) without modifying
 * the router internals.
 *
 * Algorithm per request:
 * 1. Method check + bypassWhen + maxAge=0 → call handler raw
 * 2. Derive key (path + sortedQuery + varies, prefix by method)
 * 3. Cache lookup → HIT/STALE return cached Response
 * 4. Miss → run handler, check cacheability (Set-Cookie / status / size / SSE / streaming)
 * 5. Cacheable → write entry + return Response with X-Theo-Cache: MISS (dev)
 * 6. Not cacheable → return original Response unchanged
 *
 * Concurrent dedupe is INTENTIONALLY NOT used for routes — Response objects
 * cannot be safely shared across concurrent callers (body is single-use stream).
 * Each request that misses runs the handler independently.
 */
export function defineCachedRoute<
  TQuery extends z.ZodType = z.ZodUndefined,
  TBody extends z.ZodType = z.ZodUndefined,
  TParams extends z.ZodType = z.ZodUndefined,
  TCtx = unknown,
>(
  engine: CacheEngine,
  config: CachedRouteConfig<TQuery, TBody, TParams, TCtx>,
): RouteConfig<TQuery, TBody, TParams, TCtx, Response> {
  const { cache, handler, ...rest } = config

  const maxAge = validateMaxAge(cache.maxAge, 'defineCachedRoute')
  const swr = validateExpire(cache.swr, maxAge, 'defineCachedRoute')
  if (cache.cacheVersion !== undefined && cache.cacheVersion === '') {
    throw new Error('defineCachedRoute: cacheVersion must be non-empty if provided')
  }
  // EC-19: maxEntrySize validation
  const maxEntrySize = cache.maxEntrySize ?? DEFAULT_MAX_ENTRY_SIZE
  if (!Number.isFinite(maxEntrySize) || maxEntrySize < 0) {
    throw new Error(
      `Invalid maxEntrySize "${String(cache.maxEntrySize)}" in defineCachedRoute, must be a non-negative finite number`,
    )
  }
  const methods = new Set((cache.methods ?? ['GET', 'HEAD']).map((m) => m.toUpperCase()))
  const baseTags = validateTags(cache.tags ?? [], 'defineCachedRoute').valid

  // EC-2: filter cookie/set-cookie from varies + warn-once per route
  const variesRaw = cache.varies ?? []
  const variesLower = variesRaw.map((v) => v.toLowerCase())
  const hadCookieVary = variesLower.some((v) => VARIES_IGNORED.has(v))
  const safeVaries = variesLower.filter((v) => !VARIES_IGNORED.has(v))
  if (hadCookieVary && !variesCookieWarnedRoutes.has(config)) {
    variesCookieWarnedRoutes.add(config)
    console.warn(
      `[theokit:cache] defineCachedRoute: 'cookie'/'set-cookie' removed from varies — they fragment cache to zero hit rate (EC-2)`,
    )
  }

  const wrappedHandler = async (ctx: {
    query: z.infer<TQuery>
    body: z.infer<TBody>
    params: z.infer<TParams>
    request: Request
    ctx: TCtx
  }): Promise<Response> => {
    // TheoKit's dispatcher may pass a Node IncomingMessage (not a Web Request).
    // Normalize to a Web Request so deriveKey / bypassWhen / URL parsing work uniformly.
    const webRequest = toWebRequest(ctx.request)

    if (!methods.has(webRequest.method.toUpperCase())) {
      return invokeHandlerAsResponse(handler, ctx)
    }
    if (cache.bypassWhen && (await cache.bypassWhen(webRequest))) {
      return invokeHandlerAsResponse(handler, ctx)
    }
    if (maxAge === 0) {
      return invokeHandlerAsResponse(handler, ctx)
    }

    const key = await deriveKey(webRequest, {
      prefix: 'route:' + webRequest.method.toUpperCase(),
      varies: safeVaries,
      getKey: cache.getKey,
    })

    // ---- Cache lookup (T4.2 DRY — delegates to engine canonical) ----
    const cached = await engine.tryReadCached<RouteCacheValue>(key, {
      cacheVersion: cache.cacheVersion,
    })

    // T4.3 — build options bag once; pass to all helpers (≤ 4 params each).
    const routeCacheCtx: RouteCacheCtx = {
      engine,
      key,
      cache,
      routeConfig: config,
      maxEntrySize,
      maxAge,
      swr,
      baseTags,
      webRequest,
    }

    if (cached) {
      if (cached.status === 'hit') {
        return buildResponseFromCache(cached.value, 'hit', maxAge, swr)
      }
      // Only 'stale' remains (engine never returns 'miss' from tryReadCached).
      // Stale: schedule background refresh + return stale immediately.
      scheduleRouteRevalidate(routeCacheCtx, handler, ctx)
      return buildResponseFromCache(cached.value, 'stale', maxAge, swr)
    }

    // ---- Miss: run handler ----
    const response = await invokeHandlerAsResponse(handler, ctx)
    return persistAndReturn(routeCacheCtx, response)
  }

  return {
    ...rest,
    handler: wrappedHandler,
  }
}

// T4.2 (PV-5 DRY): tryReadCacheEntry was removed — duplicated the engine's
// canonical tryReadCached (staleness check, version check, JSON parse,
// clock-skew clamp). Route wrapper now delegates to `engine.tryReadCached`.

/**
 * T4.3 options-bag context (PV-6 — Clean Code consensus ≤ 4 params).
 * Collapses 10/11 positional params of `persistAndReturn` and
 * `scheduleRouteRevalidate` to 2 params each (ctx + payload).
 *
 * Some fields are derived from `cache` config (EC-22 documented redundancy) —
 * the trade-off is O(1) construction per request for vastly simpler call
 * sites and safer additions of new fields without reordering args.
 */
interface RouteCacheCtx {
  engine: CacheEngine
  key: string
  cache: RouteCacheOptions
  routeConfig: object
  maxEntrySize: number
  maxAge: number
  swr: number | undefined
  baseTags: string[]
  webRequest: Request
}

function buildRouteCacheEntry(value: RouteCacheValue, ctx: RouteCacheCtx): CacheEntry {
  const pathTag = THEO_T_PREFIX + new URL(ctx.webRequest.url).pathname
  return {
    body: JSON.stringify(value),
    status: 200,
    headers: [],
    storedAt: Date.now(),
    maxAge: ctx.maxAge,
    swr: ctx.swr ?? ctx.maxAge * 60,
    tags: [...ctx.baseTags, pathTag],
    cacheVersion: ctx.cache.cacheVersion,
  }
}

async function persistAndReturn(ctx: RouteCacheCtx, response: Response): Promise<Response> {
  const cacheableResult = await tryCacheResponse(
    response,
    ctx.cache,
    ctx.routeConfig,
    ctx.maxEntrySize,
  )
  if (!cacheableResult) {
    // Not cached — return original response unchanged
    return response
  }
  await ctx.engine.set(ctx.key, buildRouteCacheEntry(cacheableResult, ctx))
  return buildResponseFromCache(cacheableResult, 'miss', ctx.maxAge, ctx.swr)
}

function scheduleRouteRevalidate<THandlerCtx>(
  ctx: RouteCacheCtx,
  handler: (handlerCtx: THandlerCtx) => unknown,
  handlerCtx: THandlerCtx,
): void {
  void (async () => {
    try {
      const response = await invokeHandlerAsResponse(handler, handlerCtx)
      const result = await tryCacheResponse(response, ctx.cache, ctx.routeConfig, ctx.maxEntrySize)
      if (!result) return
      await ctx.engine.set(ctx.key, buildRouteCacheEntry(result, ctx))
    } catch {
      // Stale entry remains; future request retries on its own stale-check
    }
  })()
}

/**
 * Type for Node.js IncomingMessage (subset we read).
 * Avoids a direct `node:http` import which would block edge runtimes.
 */
interface NodeLikeRequest {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
  socket?: { encrypted?: boolean }
}

/**
 * Adapt either a Web Request or a Node IncomingMessage to a Web Request.
 * TheoKit's runtime dispatch may pass either depending on the adapter.
 */

// Node IncomingMessage) inside one function so the call sites stay shape-blind.
function toWebRequest(req: Request | NodeLikeRequest): Request {
  // Web Request fast-path
  if (typeof (req as Request).clone === 'function' && (req as Request).headers instanceof Headers) {
    return req as Request
  }
  const node = req as NodeLikeRequest
  const host = (typeof node.headers.host === 'string' ? node.headers.host : null) ?? 'localhost'
  const protocol = node.socket?.encrypted ? 'https' : 'http'
  const path = node.url ?? '/'
  const url = path.startsWith('http') ? path : `${protocol}://${host}${path}`
  const headers = new Headers()
  for (const [k, v] of Object.entries(node.headers)) {
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item)
    } else if (typeof v === 'string') {
      headers.set(k, v)
    }
  }
  return new Request(url, {
    method: (node.method ?? 'GET').toUpperCase(),
    headers,
  })
}

async function invokeHandlerAsResponse<TCtx>(
  handler: (ctx: TCtx) => unknown,
  ctx: TCtx,
): Promise<Response> {
  const raw = await handler(ctx)
  if (raw instanceof Response) return raw
  return Response.json(raw)
}

/**
 * Decide whether `response` is cacheable. Returns serialized form on yes; undefined on no.
 * Order matters: cheap checks first, body read last (only for cacheable candidates).
 */
async function tryCacheResponse(
  response: Response,
  cache: RouteCacheOptions,
  routeConfig: object,
  maxEntrySize: number,
): Promise<RouteCacheValue | undefined> {
  // D7 / EC-2: Set-Cookie auto-bypass
  if (response.headers.has('set-cookie')) {
    if (!setCookieWarnedRoutes.has(routeConfig)) {
      setCookieWarnedRoutes.add(routeConfig)
      console.warn('[theokit:cache] response has Set-Cookie — skipping cache write (D7)')
    }
    return undefined
  }
  // SSE
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) return undefined
  // EC-11: chunked streaming (transfer-encoding: chunked OR no content-length on a
  // user-constructed Response — i.e., a Response built from a ReadableStream that
  // wasn't via Response.json/text helpers). We detect via the explicit
  // transfer-encoding header since Response.json() also uses a ReadableStream
  // body internally and we don't want to refuse those.
  if (response.headers.get('transfer-encoding')?.toLowerCase() === 'chunked') {
    return undefined
  }
  // D9: status >= 400 not cached unless opt-in
  if (response.status >= 400 && !cache.cacheErrors) return undefined
  // Custom predicate (overrides built-ins)
  if (cache.cacheable && !cache.cacheable(response)) return undefined

  // Read body (clone to preserve the response for downstream)
  const text = await response.clone().text()

  // EC-3: oversized bypass
  if (text.length > maxEntrySize) {
    if (!oversizedWarnedRoutes.has(routeConfig)) {
      oversizedWarnedRoutes.add(routeConfig)
      console.warn(
        `[theokit:cache] response body ${text.length} bytes exceeds maxEntrySize ${maxEntrySize}; skipping cache (EC-3)`,
      )
    }
    return undefined
  }

  const headers: [string, string][] = []
  response.headers.forEach((v, k) => {
    if (k.toLowerCase() === 'set-cookie') return // defense-in-depth
    headers.push([k, v])
  })
  return { body: text, status: response.status, headers }
}

function buildResponseFromCache(
  value: RouteCacheValue,
  status: CacheStatus,
  maxAge: number,
  swr: number | undefined,
): Response {
  const headers = new Headers(value.headers)
  if (!headers.has('cache-control')) {
    headers.set('cache-control', getCacheControlHeader({ maxAge, swr: swr ?? maxAge * 60 }))
  }
  if (process.env.NODE_ENV !== 'production') {
    let cacheStatusHeader: 'HIT' | 'STALE' | 'MISS' = 'MISS'
    if (status === 'hit') cacheStatusHeader = 'HIT'
    else if (status === 'stale') cacheStatusHeader = 'STALE'
    headers.set('X-Theo-Cache', cacheStatusHeader)
  }
  return new Response(value.body, { status: value.status, headers })
}
