# @theokit/react-query

## [0.2.0] - 2026-05-17

### Added

- Initial release. Extracted from `theokit/client` to provide an idiomatic install path (`pnpm add @theokit/react-query`) for projects that only need the React Query bridge.
- `stableQueryKey(path, options)` — deterministic queryKey derivation. EC-10: handles inline `{ query: { search: input } }` objects without triggering infinite refetch.
- `buildUseTheoQueryConfig(path, options, fetcher)` — returns `{ queryKey, queryFn }` to pass directly to `useQuery` from `@tanstack/react-query`.
- Peer deps: `react ^19`, `@tanstack/react-query ^5` (optional).
