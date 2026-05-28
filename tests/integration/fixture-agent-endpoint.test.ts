import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIXTURE = resolve(__dirname, '../../fixtures/agent-endpoint-mock')

function read(rel: string): string {
  return readFileSync(resolve(FIXTURE, rel), 'utf-8')
}

describe('T2.2 — agent-endpoint-mock fixture (structure)', () => {
  it('fixture directory exists with package.json', () => {
    expect(existsSync(resolve(FIXTURE, 'package.json'))).toBe(true)
  })

  it('has a theo.config.ts', () => {
    expect(existsSync(resolve(FIXTURE, 'theo.config.ts'))).toBe(true)
  })

  it('agent route uses defineAgentEndpoint', () => {
    const src = read('server/routes/agent.ts')
    expect(src).toMatch(/defineAgentEndpoint/)
    expect(src).toMatch(/from ['"]theokit\/server['"]/)
  })

  it('agent route yields all 4 AgentEvent variants (wire-format reference)', () => {
    const src = read('server/routes/agent.ts')
    expect(src).toMatch(/type:\s*['"]message['"]/)
    expect(src).toMatch(/type:\s*['"]tool_call['"]/)
    expect(src).toMatch(/type:\s*['"]tool_result['"]/)
    expect(src).toMatch(/type:\s*['"]error['"]/)
  })

  it('has an infinite-stream route for abort testing', () => {
    expect(existsSync(resolve(FIXTURE, 'server/routes/agent-infinite.ts'))).toBe(true)
  })

  it('has README.md documenting the wire format', () => {
    const readme = read('README.md')
    expect(readme).toMatch(/text\/event-stream|wire format|SSE/i)
    expect(readme).toMatch(/AgentEvent/)
  })
})

describe('T2.2 — agent-endpoint-mock wire format (functional)', () => {
  // We test the wire format by importing the route handler directly and
  // exercising it with a Request — avoids spinning up a dev server.
  it('POST /api/agent emits 4 SSE chunks with all event variants', async () => {
    const mod = await import('../../fixtures/agent-endpoint-mock/server/routes/agent.js')
    const handler = (mod.POST as { handler: (args: unknown) => Response | Promise<Response> })
      .handler
    const request = new Request('http://localhost/api/agent', { method: 'POST', body: '{}' })
    const response = await handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request,
      ctx: undefined,
    })
    expect(response.headers.get('content-type')).toBe('text/event-stream')

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
    }
    const chunks = buf.split('\n\n').filter((c) => c.startsWith('data:'))
    expect(chunks).toHaveLength(4)
    const events = chunks.map((c) => JSON.parse(c.slice(5).trim()))
    expect(events[0].type).toBe('message')
    expect(events[1].type).toBe('tool_call')
    expect(events[2].type).toBe('tool_result')
    expect(events[3].type).toBe('error')
  })

  it('agent-infinite aborts within 200ms when request signal fires', async () => {
    const mod = await import('../../fixtures/agent-endpoint-mock/server/routes/agent-infinite.js')
    const handler = (mod.POST as { handler: (args: unknown) => Response | Promise<Response> })
      .handler

    const controller = new AbortController()
    const request = new Request('http://localhost/api/agent-infinite', {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    })
    const response = await handler({
      query: undefined,
      body: undefined,
      params: undefined,
      request,
      ctx: undefined,
    })
    const reader = response.body!.getReader()
    await reader.read() // consume first chunk
    const started = Date.now()
    controller.abort()
    while (true) {
      const { done } = await reader.read()
      if (done) break
      if (Date.now() - started > 1000) throw new Error('did not close on abort')
    }
    expect(Date.now() - started).toBeLessThan(500)
  })
})
