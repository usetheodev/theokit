---
'theokit': patch
---

Consolidate `theokit/react-query` as a subpath of the canonical `theokit` package.

Previously the React Query bridge lived in two places:
- `theokit/client` (canonical implementation)
- A separate `packages/theokit-react-query/` package that was set to publish as `@theokit/react-query@0.2.0` but never made it to the registry (scope didn't exist).

The split duplicated code and forced consumers to manage an extra npm dependency for what is naturally a subpath of TheoKit. The standalone package has been removed from the monorepo.

**New surface:**

```ts
import {
  stableQueryKey,
  buildUseTheoQueryConfig,
} from 'theokit/react-query'
```

Aliases `buildUseTheoQueryInternals`, `FetcherFn`, and `UseTheoQueryInternals` are re-exported under the same subpath to preserve the names that pre-release builds of the standalone package exposed.

This is a purely additive change — `theokit/client` continues to expose the same primitives. No code needs to change for existing users.
