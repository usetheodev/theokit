# define-integration

Demonstrates `defineTheoIntegration` — the build-time integration system (Astro Integrations pattern). The `banner` integration adds a virtual module that the app consumes:

```ts
import bannerText from 'virtual:integration:banner/text'
```

## Virtual module prefix invariant

Every virtual module added by an integration MUST start with `virtual:integration:<name>/`. Anything else throws `IntegrationVirtualModulePrefixError` at the `theo:config:setup` hook. This is enforced by `createIntegrationRegistry` and prevents collisions with `/@theo/*` internals.

## API

```ts
import { defineTheoIntegration } from 'theokit/vite-plugin'

export default defineTheoIntegration({
  name: 'my-integration',
  hooks: {
    'theo:config:setup': (ctx) => {
      ctx.addVirtualModule?.('virtual:integration:my-integration/data', 'export default 42')
    },
    'theo:build:start': () => { /* ... */ },
    'theo:build:done': () => { /* ... */ },
    'theo:dev:start': () => { /* ... */ },
  },
})
```

## Status (alpha)

Integration wiring through `theo.config.ts` is not yet plumbed into the Zod config schema; for alpha, integrations are registered at the Vite plugin construction site (`theoPlugin({ integrations: [banner] })`). Once stabilized, the config schema will accept an `integrations` array directly.

## Run the test

```bash
npx vitest run tests/unit/fixture-define-integration.test.ts
```
