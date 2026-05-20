/**
 * T5.3 — React Query adapter primitives.
 *
 * Exposes:
 *  - `stableQueryKey(path, options)` — produces a deterministic queryKey
 *    that is equal across calls when the logical content of query/body is
 *    equal, regardless of property order or inline-object identity. Solves
 *    EC-10 (inline-object → infinite refetch).
 *  - `buildUseTheoQueryConfig(path, options, fetcher)` — produces the
 *    `{ queryKey, queryFn }` pair that consumers pass to `useQuery` from
 *    `@tanstack/react-query`.
 *
 * The canonical implementation lives here in `theokit/client`. The
 * dedicated subpath `theokit/react-query` re-exports this surface so
 * consumers who only need the React Query bridge can import from a
 * clearly named entry point — same shape as `theokit/server`,
 * `theokit/vite-plugin`, etc. No separate npm package.
 */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']'
  }
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b))
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]),
  )
  return '{' + pairs.join(',') + '}'
}

export interface FetchOptionsLike {
  query?: unknown
  body?: unknown
  params?: unknown
}

export type QueryKey = readonly unknown[]

export function stableQueryKey(path: string, options: FetchOptionsLike): QueryKey {
  const key: unknown[] = [path]
  if (options.query !== undefined) {
    key.push({ kind: 'query', payload: stableStringify(options.query) })
  }
  if (options.body !== undefined) {
    key.push({ kind: 'body', payload: stableStringify(options.body) })
  }
  if (options.params !== undefined) {
    key.push({ kind: 'params', payload: stableStringify(options.params) })
  }
  return key
}

export type Fetcher<TResult = unknown> = (
  path: string,
  options: FetchOptionsLike,
) => Promise<TResult>

export interface UseTheoQueryConfig<TResult = unknown> {
  queryKey: QueryKey
  queryFn: () => Promise<TResult>
}

export function buildUseTheoQueryConfig<TResult = unknown>(
  path: string,
  options: FetchOptionsLike,
  fetcher: Fetcher<TResult>,
): UseTheoQueryConfig<TResult> {
  return {
    queryKey: stableQueryKey(path, options),
    queryFn: () => fetcher(path, options),
  }
}
