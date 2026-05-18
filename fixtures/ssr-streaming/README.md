# ssr-streaming

Demonstrates streaming SSR via `renderToPipeableStream`. The shell of the page (header, Suspense fallback markup) flushes immediately; the deferred `SlowFeed` component arrives in a later chunk after its 200ms work resolves.

## Config

```ts
// theo.config.ts
export default defineConfig({
  ssr: true,
  ssrStreaming: true,
})
```

When both flags are on, the framework uses `renderToPipeableStream` and sets `Transfer-Encoding: chunked` on the response. `onShellReady` fires as soon as the static markup is ready, and Suspense boundaries flush progressively as their work resolves.

## Client abort

If the client disconnects mid-stream, the framework calls `stream.abort()` on the pipeable so the server stops doing useless work. See EC-11 in `docs/plans/cross-domain-uplift-plan.md`.

## Run

```bash
npx vitest run tests/unit/fixture-ssr-streaming.test.ts
```
