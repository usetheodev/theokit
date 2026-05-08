---
paths:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "packages/router/**/*.ts"
---

# Frontend Rules

## File-System Routing

- `page.tsx` defines a route — filesystem = routing
- `layout.tsx` wraps pages and nested layouts
- `loading.tsx` provides Suspense fallback
- `error.tsx` provides error boundary
- `not-found.tsx` provides 404 handling
- `[param]` for dynamic segments
- `[...catchAll]` for catch-all routes
- `(group)` for layout groups (no URL segment)

## Server/Client Boundary

- Components are SERVER by default
- `"use client"` for opt-in client components
- Client components cannot import server-only modules
- Server components cannot use browser APIs (window, document)

## Data Loading

- Pages receive data via props from loaders or server components
- No direct database access in `app/` — use server routes or actions
- Client-side fetching via typed client

## Layouts

- Layouts persist between navigations (don't re-mount)
- Layouts receive `children` as prop
- Root layout (`app/layout.tsx`) wraps entire app
- Nested layouts compose automatically

## Metadata

- Export `metadata` object from `page.tsx` for static metadata
- Export `generateMetadata()` for dynamic metadata
- Metadata merges with parent layouts
