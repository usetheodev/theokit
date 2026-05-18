import { defineConfig } from 'theokit'

// The `serialization` field accepts the strings 'json' | 'superjson'.
// For a *custom* TheoTransformer, see transformer.ts and the README —
// custom transformers are supplied programmatically via `resolveTransformer`
// at the integration site.
export default defineConfig({
  serialization: 'superjson',
})
