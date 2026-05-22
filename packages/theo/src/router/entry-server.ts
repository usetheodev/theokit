export interface EntryServerOptions {
  /** When true, emit a streaming entry using onShellReady + signal cleanup.
   *  When false (default), emit the legacy single-shot onAllReady entry. */
  streaming?: boolean
  /**
   * TheoUI config — when present, the SSR React tree wraps StaticRouterProvider
   * in <TheoUIProvider> + <Suspense> to MATCH the client entry exactly. Without
   * this, hydration falls back silently because the trees differ — button
   * onClick handlers never get attached and the page looks dead.
   *
   * EC-2 (CSS): the SSR entry never imports CSS. Only the React tree is
   * mirrored — the CSS stays client-only.
   */
  theoUi?: { theme?: 'violet-forge' | 'noir' | 'paper' }
}

export function generateEntryServer(options: EntryServerOptions = {}): string {
  if (options.streaming) {
    return generateStreamingEntry(options)
  }
  return generateSingleShotEntry(options)
}

/**
 * Build the React element tree the server renders. Must mirror the client
 * tree shape from `generateEntryClient` — same wrapper components, same
 * order — or hydration silently falls back to client-only render.
 */
function buildAppTreeJs(options: EntryServerOptions): string {
  const theme = options.theoUi?.theme ?? 'violet-forge'
  // T4.1 — pass options.nonce to StaticRouterProvider so its internal
  // hydration data script (`<script>window.__staticRouterHydrationData
  // = ...</script>`) carries the nonce attribute. Without this, CSP
  // enforce mode (without 'unsafe-inline') blocks the hydration script
  // → React falls back to client-only render → button onClick handlers
  // never attach → page looks dead. The nonce option to
  // renderToPipeableStream covers React-emitted scripts but NOT the
  // hydration script which is emitted by react-router itself.
  if (options.theoUi) {
    return [
      `React.createElement(TheoUIProvider, { theme: { defaultTheme: '${theme}' } },`,
      `      React.createElement(Suspense, { fallback: null },`,
      `        React.createElement(StaticRouterProvider, { router, context, nonce: options.nonce })`,
      `      )`,
      `    )`,
    ].join('\n')
  }
  return `React.createElement(Suspense, { fallback: null },\n      React.createElement(StaticRouterProvider, { router, context, nonce: options.nonce })\n    )`
}

function generateSingleShotEntry(options: EntryServerOptions): string {
  const theoUiImport = options.theoUi ? `import { TheoUIProvider } from '@usetheo/ui'\n` : ''
  const appTree = buildAppTreeJs(options)
  return [
    `import React, { Suspense } from 'react'`,
    `import { renderToPipeableStream } from 'react-dom/server'`,
    `import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'`,
    `import { PassThrough } from 'node:stream'`,
    `import { routes } from '/@theo/route-manifest'`,
    theoUiImport,
    `export async function render(url, options = {}) {`,
    `  const handler = createStaticHandler(routes)`,
    `  const request = new Request('http://localhost' + url)`,
    `  const context = await handler.query(request)`,
    ``,
    `  if (context instanceof Response) {`,
    `    return { redirect: context }`,
    `  }`,
    ``,
    `  const router = createStaticRouter(handler.dataRoutes, context)`,
    `  const app = ${appTree}`,
    ``,
    `  return new Promise((resolve, reject) => {`,
    `    let html = ''`,
    `    let piped = false`,
    `    const passthrough = new PassThrough()`,
    `    passthrough.on('data', (chunk) => { html += chunk.toString() })`,
    `    passthrough.on('end', () => { resolve(html) })`,
    `    passthrough.on('error', reject)`,
    ``,
    `    // T3.1 — Pipe on onShellReady (Next.js pattern). Calling pipe()`,
    `    // twice throws "React currently only supports piping to one`,
    `    // writable stream". The \`piped\` flag is a belt-and-suspenders`,
    `    // guard if onShellReady fires unexpectedly more than once.`,
    `    // T4.1 — Forward options.nonce to React so every <script> tag`,
    `    // React emits (StaticRouterProvider hydration data + Suspense`,
    `    // boundary scripts) carries the nonce attribute. Required for`,
    `    // 0.3.0 strict CSP without 'unsafe-inline'. EC-12.`,
    `    const { pipe } = renderToPipeableStream(app, {`,
    `      nonce: options.nonce,`,
    `      onShellReady() { if (!piped) { piped = true; pipe(passthrough) } },`,
    `      onShellError(err) { reject(err) },`,
    `      onError(err) { console.error('[SSR Error]', err) },`,
    `    })`,
    `  })`,
    `}`,
  ].join('\n')
}

// Generated-code fragments — extracted so the parent emitter stays under
// the max-lines-per-function ceiling.
function streamingWebRenderer(appTree: string): string[] {
  return [
    `// T2.3 — Web Standards streaming entry for edge runtimes (Cloudflare,`,
    `// Bun, Deno, Vercel Edge). Uses renderToReadableStream and returns a`,
    `// Response with the stream as body. Honors request.signal for client`,
    `// disconnect cleanup.`,
    `export async function renderStreamingWeb(request, options = {}) {`,
    `  const handler = createStaticHandler(routes)`,
    `  const url = new URL(request.url)`,
    `  const context = await handler.query(request)`,
    ``,
    `  if (context instanceof Response) {`,
    `    return context`,
    `  }`,
    ``,
    `  const router = createStaticRouter(handler.dataRoutes, context)`,
    `  const app = ${appTree}`,
    ``,
    `  const stream = await renderToReadableStream(app, {`,
    `    signal: request.signal,`,
    `    nonce: options.nonce,`,
    `    onError(err) { console.error('[SSR Web Stream Error]', err) },`,
    `  })`,
    `  return new Response(stream, {`,
    `    status: 200,`,
    `    headers: {`,
    `      'Content-Type': 'text/html; charset=utf-8',`,
    `      'Transfer-Encoding': 'chunked',`,
    `    },`,
    `  })`,
    `}`,
  ]
}

function streamingNodeRenderer(appTree: string): string[] {
  return [
    `// T6.1 — Node streaming SSR entry (opt-in via theo.config.ts > ssrStreaming: true)`,
    `// Flushes the shell as soon as it's ready, then streams Suspense boundaries.`,
    `// EC-11: respects request.signal for client-disconnect cleanup.`,
    `export async function renderStreaming(url, response, options = {}) {`,
    `  const handler = createStaticHandler(routes)`,
    `  const request = new Request('http://localhost' + url, { signal: options.signal })`,
    `  const context = await handler.query(request)`,
    ``,
    `  if (context instanceof Response) {`,
    `    return { redirect: context }`,
    `  }`,
    ``,
    `  const router = createStaticRouter(handler.dataRoutes, context)`,
    `  const app = ${appTree}`,
    ``,
    `  return new Promise((resolve, reject) => {`,
    `    let didError = false`,
    `    const stream = renderToPipeableStream(app, {`,
    `      nonce: options.nonce,`,
    `      onShellReady() {`,
    `        response.statusCode = didError ? 500 : 200`,
    `        response.setHeader('Content-Type', 'text/html; charset=utf-8')`,
    `        response.setHeader('Transfer-Encoding', 'chunked')`,
    `        stream.pipe(response)`,
    `        resolve({ streaming: true })`,
    `      },`,
    `      onShellError(err) { reject(err) },`,
    `      onError(err) {`,
    `        didError = true`,
    `        console.error('[SSR Stream Error]', err)`,
    `      },`,
    `    })`,
    ``,
    `    // EC-11: client disconnect cleanup`,
    `    if (options.signal) {`,
    `      options.signal.addEventListener('abort', () => { stream.abort() })`,
    `    }`,
    `  })`,
    `}`,
  ]
}

function backCompatRenderer(appTree: string): string[] {
  return [
    `// Backward compatibility: keep the single-shot render export available so`,
    `// callers that always used 'render()' don't break when streaming is on.`,
    `export async function render(url, options = {}) {`,
    `  const handler = createStaticHandler(routes)`,
    `  const request = new Request('http://localhost' + url)`,
    `  const context = await handler.query(request)`,
    ``,
    `  if (context instanceof Response) {`,
    `    return { redirect: context }`,
    `  }`,
    ``,
    `  const router = createStaticRouter(handler.dataRoutes, context)`,
    `  const app = ${appTree}`,
    ``,
    `  const { PassThrough } = await import('node:stream')`,
    `  return new Promise((resolve, reject) => {`,
    `    let html = ''`,
    `    let piped = false`,
    `    const passthrough = new PassThrough()`,
    `    passthrough.on('data', (chunk) => { html += chunk.toString() })`,
    `    passthrough.on('end', () => { resolve(html) })`,
    `    passthrough.on('error', reject)`,
    ``,
    `    // T3.1 — pipe on onShellReady (Next.js pattern). T4.1 — nonce.`,
    `    const { pipe } = renderToPipeableStream(app, {`,
    `      nonce: options.nonce,`,
    `      onShellReady() { if (!piped) { piped = true; pipe(passthrough) } },`,
    `      onShellError(err) { reject(err) },`,
    `      onError(err) { console.error('[SSR Error]', err) },`,
    `    })`,
    `  })`,
    `}`,
  ]
}

function generateStreamingEntry(options: EntryServerOptions): string {
  const theoUiImport = options.theoUi ? `import { TheoUIProvider } from '@usetheo/ui'\n` : ''
  const appTree = buildAppTreeJs(options)
  return [
    `import React, { Suspense } from 'react'`,
    `import { renderToPipeableStream, renderToReadableStream } from 'react-dom/server'`,
    `import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router'`,
    `import { routes } from '/@theo/route-manifest'`,
    theoUiImport,
    ``,
    ...streamingWebRenderer(appTree),
    ``,
    ...streamingNodeRenderer(appTree),
    ``,
    ...backCompatRenderer(appTree),
  ].join('\n')
}
