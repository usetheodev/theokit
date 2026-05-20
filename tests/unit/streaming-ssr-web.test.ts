import { describe, it, expect } from 'vitest'
import { generateEntryServer } from '../../packages/theo/src/router/entry-server.js'

describe('generateEntryServer — renderStreamingWeb (T2.3)', () => {
  it('exports renderStreamingWeb when streaming is enabled', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('export async function renderStreamingWeb')
  })

  it('renderStreamingWeb uses renderToReadableStream (Web API)', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('renderToReadableStream')
  })

  it('renderStreamingWeb returns a Response with ReadableStream body', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toMatch(/return new Response/)
    expect(out).toMatch(/text\/html/)
  })

  it('renderStreamingWeb honors request.signal abort (EC-8 — EC-11 in old plan)', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toMatch(/signal/)
  })

  it('single-shot mode does NOT export renderStreamingWeb', () => {
    const out = generateEntryServer({ streaming: false })
    expect(out).not.toContain('renderStreamingWeb')
  })

  it('default (no opts) does NOT export renderStreamingWeb', () => {
    const out = generateEntryServer()
    expect(out).not.toContain('renderStreamingWeb')
  })
})

describe('cf/bun/vercel adapters consume renderStreamingWeb when streaming on', () => {
  it('cloudflare template references renderStreamingWeb option', async () => {
    const { renderCloudflareWorkerEntry } =
      await import('../../packages/theo/src/adapters/cloudflare.js')
    const out = renderCloudflareWorkerEntry()
    // CF template must support routing GET non-API requests through the
    // streaming entry when available. Adapter detects via env-injected flag.
    expect(out).toMatch(/renderStreamingWeb|ssrStreaming/)
  })

  it('bun adapter mentions streaming branch when feature wired', async () => {
    const { renderBunEntry } = await import('../../packages/theo/src/adapters/bun.js')
    const out = renderBunEntry(3000)
    // Bun template should reference the streaming entry name when streaming
    // is part of the build output.
    expect(out).toMatch(/renderStreamingWeb|ssrStreaming|streaming/)
  })
})
