/**
 * `theokit/react-query` — React Query adapter primitives for TheoKit.
 *
 * Same shape as `theokit/server`, `theokit/client`, `theokit/vite-plugin`:
 * a subpath of the canonical `theokit` package, not a separate npm package.
 *
 * Use when you want to drive TheoKit-typed routes through `@tanstack/react-query`.
 * The peer dep `@tanstack/react-query` is intentionally NOT a hard import here
 * so this subpath can be loaded in projects that don't have the peer yet.
 *
 * Example:
 *
 *   import { useQuery } from '@tanstack/react-query'
 *   import { buildUseTheoQueryConfig } from 'theokit/react-query'
 *   import { theoFetch } from 'theokit/client'
 *   import type { GET } from '../../server/routes/users'
 *
 *   function useUsers(search: string) {
 *     return useQuery(
 *       buildUseTheoQueryConfig(
 *         '/api/users',
 *         { query: { search } },
 *         (path, opts) => theoFetch<typeof GET>(path, opts as never),
 *       ),
 *     )
 *   }
 */

// Canonical implementation lives in `client/react-query-adapter.ts`.
// Re-export so consumers can import from a dedicated subpath.
export {
  stableQueryKey,
  buildUseTheoQueryConfig,
} from '../client/react-query-adapter.js'

export type {
  Fetcher,
  FetchOptionsLike,
  QueryKey,
  UseTheoQueryConfig,
} from '../client/react-query-adapter.js'

// Aliases — preserve the names the (never-published) standalone package used,
// so anyone who tried the pre-release surface can keep their imports.
export {
  buildUseTheoQueryConfig as buildUseTheoQueryInternals,
} from '../client/react-query-adapter.js'

export type {
  Fetcher as FetcherFn,
  UseTheoQueryConfig as UseTheoQueryInternals,
} from '../client/react-query-adapter.js'
