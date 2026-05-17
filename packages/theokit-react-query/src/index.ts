/**
 * `@theokit/react-query` — React Query adapter primitives for TheoKit.
 *
 * Designed to be peer-dep with `@tanstack/react-query`. Stable queryKey
 * derivation (EC-10) prevents inline-object infinite-refetch bugs.
 *
 * The core primitives are re-exported from the canonical implementation in
 * `theokit/client` so a single source of truth remains; this package is the
 * idiomatic install path (`pnpm add @theokit/react-query`) and lets the
 * dependency graph stay explicit when only the React Query bridge is needed.
 */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']'
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const pairs = keys.map(
    (k) =>
      JSON.stringify(k) +
      ':' +
      stableStringify((value as Record<string, unknown>)[k]),
  )
  return '{' + pairs.join(',') + '}'
}

export interface FetchOptionsLike {
  query?: unknown
  body?: unknown
  params?: unknown
}

export type QueryKey = readonly unknown[]

/**
 * Produce a deterministic queryKey that is equal across calls when the
 * logical content of query/body/params is equal, regardless of property
 * order or inline-object identity (EC-10).
 */
export function stableQueryKey(
  path: string,
  options: FetchOptionsLike,
): QueryKey {
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

/**
 * Build the `{ queryKey, queryFn }` config to pass to `useQuery` from
 * `@tanstack/react-query`. The supplied `fetcher` is invoked with `path`
 * and `options` — typically a wrapper around `theoFetch` from `theokit/client`.
 */
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

// T4.1 — useTheoQuery internals (testable without React)
export {
  buildUseTheoQueryInternals,
  type FetcherFn,
  type UseTheoQueryInternals,
} from './use-theo-query.js'
