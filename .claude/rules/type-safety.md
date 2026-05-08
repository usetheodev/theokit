---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "server/**/*.ts"
---

# Type Safety Rules

## Zod is the Single Source of Truth

- Schema defined ONCE in Zod
- TypeScript types derived via `z.infer<typeof schema>`
- Runtime validation from the same schema
- OpenAPI generated from the same schema
- Client types inferred from the same schema
- NEVER duplicate a type that exists as Zod schema

## Prohibited Patterns

- `any` in production code (tests OK with moderation)
- `@ts-ignore` or `@ts-expect-error` in production
- Manual interface/type that duplicates a Zod schema
- `as` type assertions (use type guards or narrow properly)
- Generic `Error` instead of typed `TheoError`

## Required Patterns

- `strict: true` in all tsconfig.json files
- `z.infer<>` for deriving types from schemas
- `expectTypeOf` in type tests
- Discriminated unions for error handling
- Explicit return types on public API functions

## Type Flow

```
Zod Schema → defineRoute/defineAction
    ↓
Handler (input typed from schema)
    ↓
OpenAPI Spec (generated from schema)
    ↓
Typed Client (inferred from schema)
    ↓
React Component (autocomplete works)
```

## Type Tests

Every public API contract needs a type test:

```typescript
import { expectTypeOf } from 'vitest'

test('defineRoute infers body type from Zod schema', () => {
  // ...
})
```
