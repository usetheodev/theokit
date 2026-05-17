/**
 * T4.1 — `useTheoQuery` hook (thin wrapper over @tanstack/react-query useQuery).
 *
 * Splits into two layers:
 *  - `buildUseTheoQueryInternals` — pure function returning { queryKey, queryFn }.
 *    Testable without React.
 *  - `useTheoQuery` — the actual hook. Imports useQuery dynamically so the
 *    package can be tested without forcing @tanstack/react-query as a hard dep.
 */

import {
  stableQueryKey,
  type FetchOptionsLike,
  type QueryKey,
} from './index.js'

export type FetcherFn<TResult = unknown> = (
  path: string,
  options: FetchOptionsLike,
) => Promise<TResult>

export interface UseTheoQueryInternals<TResult> {
  queryKey: QueryKey
  queryFn: () => Promise<TResult>
}

/**
 * Pure builder: returns the (queryKey, queryFn) pair you would pass to
 * `useQuery`. Useful for testing and SSR contexts where you don't want to
 * couple to React's rendering lifecycle.
 */
export function buildUseTheoQueryInternals<TResult>(
  path: string,
  options: FetchOptionsLike,
  fetcher: FetcherFn<TResult>,
): UseTheoQueryInternals<TResult> {
  return {
    queryKey: stableQueryKey(path, options),
    queryFn: () => fetcher(path, options),
  }
}

/**
 * `useTheoQuery(path, options, fetcher)` — one-liner hook for React components.
 *
 * Note: this file does NOT statically import `@tanstack/react-query` so the
 * package can be installed in projects that don't yet have the peer dep.
 * The hook is exported via a separate entry `./hook` that does the dynamic
 * import internally — keeps the core build dep-free.
 */
