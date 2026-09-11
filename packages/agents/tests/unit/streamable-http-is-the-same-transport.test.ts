import { describe, expect, it, vi } from 'vitest'

import { parseMcpJsonForTests } from '../../src/bridge/mcp-file.js'

/**
 * `"type": "streamable-http"` was refused, and it names the transport this runtime already speaks.
 *
 * The MCP specification renamed the HTTP transport to "Streamable HTTP", and a `.mcp.json` written
 * against the current spec says so. `validateRemote` accepted `"http"` and `"sse"` and refused
 * anything else, so a server declared with the spec's own current name was dropped with a message
 * about a field the author had written correctly.
 *
 * ## Why an alias and not a third type
 *
 * They are one transport under two names. Forwarding `streamable-http` downstream as a distinct
 * value would ask every consumer of the parsed config to learn the synonym too — and the SDK's own
 * `McpServerConfig` does not carry it. Normalising at the boundary is what keeps one vocabulary
 * inside: the parser accepts what the author wrote and hands on what the runtime speaks.
 */
const warn = vi.fn()

describe('streamable-http is the same transport under the spec name', () => {
  it('accepts it', () => {
    const servers = parseMcpJsonForTests(
      { mcpServers: { api: { url: 'https://x.test/mcp', type: 'streamable-http' } } },
      '/p/.mcp.json',
      warn,
    )
    expect(
      Object.keys(servers),
      "a server declared with the spec's own current transport name was dropped",
    ).toEqual(['api'])
  })

  it('normalises it to the name the runtime speaks', () => {
    const servers = parseMcpJsonForTests(
      { mcpServers: { api: { url: 'https://x.test/mcp', type: 'streamable-http' } } },
      '/p/.mcp.json',
      warn,
    )
    expect(
      (servers.api as Record<string, unknown>).type,
      'the synonym travelled downstream, so every consumer has to learn it too',
    ).toBe('http')
  })

  it('still accepts the two names it always did', () => {
    // The control. An alias that replaced the existing vocabulary would break every config already
    // written against it.
    for (const type of ['http', 'sse']) {
      const servers = parseMcpJsonForTests(
        { mcpServers: { api: { url: 'https://x.test/mcp', type } } },
        '/p/.mcp.json',
        warn,
      )
      expect((servers.api as Record<string, unknown>).type, type).toBe(type)
    }
  })

  it('still refuses a transport it does not speak', () => {
    // The second control. Accepting the alias must not turn the check into a pass-through: an
    // invented transport is still an error, and a silent one would be worse than the refusal this
    // started as.
    const servers = parseMcpJsonForTests(
      { mcpServers: { api: { url: 'https://x.test/mcp', type: 'carrier-pigeon' } } },
      '/p/.mcp.json',
      warn,
    )
    expect(Object.keys(servers)).toEqual([])
  })
})
