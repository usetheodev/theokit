import { describe, it, expect } from 'vitest'
import { generateEntryServer } from '../../packages/theo/src/router/entry-server.js'

describe('generateEntryServer — default (single-shot)', () => {
  it('emits a render function using onAllReady (non-streaming)', () => {
    const out = generateEntryServer()
    expect(out).toContain('onAllReady')
    expect(out).toContain('export async function render')
  })

  it('does not include streaming-specific exports when streaming is off', () => {
    const out = generateEntryServer({ streaming: false })
    expect(out).not.toContain('export async function renderStreaming')
  })

  it('treats omitted options as non-streaming', () => {
    const out = generateEntryServer()
    expect(out).not.toContain('renderStreaming')
  })
})

describe('generateEntryServer — streaming (T6.1)', () => {
  it('exports renderStreaming when streaming is enabled', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('export async function renderStreaming')
  })

  it('uses onShellReady (progressive flush) when streaming', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('onShellReady')
  })

  it('still exports render for backward compatibility', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('export async function render')
  })

  it('wires request.signal abort listener (EC-11 client disconnect)', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('signal.addEventListener')
    expect(out).toContain('stream.abort')
  })

  it('sets chunked transfer encoding header for streaming responses', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('Transfer-Encoding')
    expect(out).toContain('chunked')
  })

  it('handles shell errors via onShellError rejection', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('onShellError')
  })

  it('logs non-shell errors via onError without failing the stream', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('onError')
    expect(out).toContain('SSR Stream Error')
  })

  it('treats post-shell errors as 500 via didError flag', () => {
    const out = generateEntryServer({ streaming: true })
    expect(out).toContain('didError')
  })
})
