# Router — System Context

> Baseline snapshot — Phase 0 of cross-domain-uplift-plan. Captures `packages/theo/src/router/` state **before** Phase 6 streaming SSR.

## Scope

The `router` domain turns `app/*` files (React components) into a renderable route tree, generates the client entry that ships to the browser, and provides the SSR entry when `config.ssr === true`. It is the smallest meaningful domain (6 files, ~314 LOC) — most of the routing complexity is delegated to React Router v7.

## Public surface (`packages/theo/src/router/index.ts`)

- `scanRoutes(appDir): RouteNode` — walks `app/`, produces tree with `page`, `layout`, `loading`, `error`, `not-found` per segment
- `generateRouteManifest(tree): string` — emits the RR7 route config as TS source
- `generateEntryClient(tree, config): string` — emits the client entry module (string-emitted)
- `isRouteFile(path): boolean` — predicate for what counts as a route file

## Internal files

| File | Role |
|---|---|
| `scan.ts` | Reads disk, builds `RouteNode` tree |
| `types.ts` | `RouteNode` type definitions |
| `generate.ts` | Code emission for entry-client and route manifest |
| `entry.ts` | Browser hydration entry template |
| `entry-server.ts` | SSR entry template (used when `config.ssr === true`) |
| `index.ts` | Re-exports |

## Delegation to React Router v7

The router does **not** implement matching, navigation, layouts, or boundaries. Those are RR7's job. TheoKit's router only:

1. Discovers files on disk
2. Emits an RR7-shaped route config tree
3. Wires `loading.tsx`/`error.tsx`/`not-found.tsx` as RR7's `HydrateFallback`/`ErrorBoundary` patterns
4. Provides the SSR pipeline glue (only single-shot `renderToString` today — streaming is what T6.1 adds)

## SSR today (single-shot)

```
incoming Request
   ↓
adapter or theokit start
   ↓
entry-server.ts (template) → renderToString(<RouterProvider />)
   ↓
single HTML chunk
   ↓
Response with full body
```

No Suspense flushing, no progressive HTML. T6.1 adds the `renderToPipeableStream` (Node) / `renderToReadableStream` (Workers/Bun) branches gated by `config.ssr.streaming`.

## Coupling

- `vite-plugin/index.ts` consumes `scanRoutes` + `generateEntryClient` + `generateRouteManifest` via virtual modules (`/@theo/entry-client`, `/@theo/route-manifest`)
- `cli/commands/dev.ts` and `cli/commands/build.ts` drive the Vite plugin, indirectly driving the router
- `core/validate-structure.ts` validates the presence of `app/` before the router runs

## Strengths

- Tiny surface area — leverage RR7's maturity rather than reinvent
- File-based routing with layouts, errors, not-found out of the box
- Manifest is generated, not hand-maintained

## Limitations (motivating Phase 6)

- **No streaming SSR.** Single-shot `renderToString` only.
- **No route groups, parallel routes, intercepting routes.** Explicit non-goal — these are RR7's territory.
- **No `generateStaticParams` equivalent.** Static adapter (T1.5) will introduce `static-paths.ts` convention for `[id]` and `[...slug]`.

## C1 — Context diagram

```mermaid
flowchart LR
    AppDir[(app/ on disk)] -->|scanRoutes| Tree[RouteNode tree]
    Tree -->|generateRouteManifest| Manifest[virtual:/@theo/route-manifest]
    Tree -->|generateEntryClient| ClientEntry[virtual:/@theo/entry-client]
    Manifest --> Vite[vite-plugin]
    ClientEntry --> Vite
    Vite --> Bundle[.theo/client/ bundle]
    Bundle --> Browser[browser hydration via RR7]
```
