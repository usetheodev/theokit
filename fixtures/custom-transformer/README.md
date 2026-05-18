# custom-transformer

Demonstrates the pluggable `TheoTransformer` contract — what's needed to swap the serialization format.

## Built-in options (`theo.config.ts`)

```ts
serialization: 'superjson'  // default: handles Date, Map, Set, BigInt, RegExp
serialization: 'json'       // lightweight, plain JSON only
```

This fixture uses `superjson` and demonstrates that a `Date` instance round-trips natively from server handler to client component — `data.now instanceof Date === true`.

## Writing a custom transformer

The `TheoTransformer` interface (re-exported from `theokit/server`):

```ts
import type { TheoTransformer } from 'theokit/server'

export const myTransformer: TheoTransformer = {
  name: 'iso-date',
  serialize: (value) => /* string */,
  deserialize: (raw) => /* unknown */,
}
```

`./transformer.ts` ships a minimal example — `iso-date` — that preserves `Date` via an `__DATE__<iso>` marker. Custom transformers are wired via `resolveTransformer(myTransformer)` at the integration site; the `theo.config.ts` `serialization` field currently accepts only the two built-in strings (`'json' | 'superjson'`).

## Round-trip test

Server handler returns `{ now: new Date() }`. With `superjson`, the client receives a real `Date` (not a string). Plain `'json'` would lose the type — useful when you need a slimmer payload and don't carry Dates.

## Run

```bash
npx vitest run tests/unit/fixture-custom-transformer.test.ts
```
