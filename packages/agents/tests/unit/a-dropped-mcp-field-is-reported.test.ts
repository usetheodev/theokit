import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadMcpJson } from '../../src/bridge/mcp-file.js'

/**
 * A field this layer does not carry is REPORTED, never dropped.
 *
 * `buildEntry` assembles each server from a fixed set of keys — `command`, `args`, `env`, `cwd` for
 * stdio; `url`, `type`, `headers`, `auth`, `requestTimeoutMs` for remote. Anything else fell off the
 * end in silence. Measured (B-071): `alwaysLoad` is declared by the reference format, allowlisted
 * away here, and nothing said so.
 *
 * That is the same shape B-032 closed for hooks, and it is worth restating why it matters more than
 * the individual field. An author who writes `alwaysLoad: true` and sees the server start has been
 * told, by the absence of any complaint, that the setting took effect. A refusal that names the field
 * costs one line and removes the entire class of belief.
 *
 * ## `alwaysLoad` specifically
 *
 * It marks a server whose tools are loaded into context eagerly rather than discovered on demand —
 * which only means something where TOOL SEARCH exists, and tool search does not exist here (measured
 * 0/0 in the same sweep). So the field has no counterpart to be "always" relative to, and honouring
 * it would mean inventing a behaviour and shipping it under the reference's name. It is refused, and
 * the refusal says which capability it depends on, so a reader lands on the reason rather than on a
 * changelog.
 */
function projectWith(entry: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'theokit-mcp-dropped-'))
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { probe: entry } }))
  return dir
}

describe('an MCP field this layer does not carry is reported', () => {
  it('reports alwaysLoad instead of dropping it, and names what it depends on', () => {
    const warnings: string[] = []
    const cwd = projectWith({ command: 'node', args: ['s.js'], alwaysLoad: true })

    const servers = loadMcpJson(cwd, { env: {}, onWarn: (w) => warnings.push(w) })

    expect(servers.probe, 'the server itself must still start').toBeDefined()
    const said = warnings.join('\n')
    expect(said, 'alwaysLoad was dropped in silence').toContain('alwaysLoad')
    expect(said, 'the report does not say which capability it needs').toMatch(/tool search/i)
  })

  it('reports an unrecognised field generally, not just the one that was measured', () => {
    // Naming only `alwaysLoad` would fix the instance and leave the class. The next field the format
    // gains would fall off the same edge, in the same silence.
    const warnings: string[] = []
    const cwd = projectWith({ command: 'node', somethingTheFormatAdvertises: 1 })

    loadMcpJson(cwd, { env: {}, onWarn: (w) => warnings.push(w) })

    expect(warnings.join('\n')).toContain('somethingTheFormatAdvertises')
  })

  it('says nothing about the fields it DOES carry', () => {
    // The control. A reporter that warned about everything would be noise, and noise is how a real
    // report stops being read.
    const warnings: string[] = []
    const cwd = projectWith({ command: 'node', args: ['s.js'], env: { A: 'b' }, cwd: '/tmp' })

    loadMcpJson(cwd, { env: {}, onWarn: (w) => warnings.push(w) })

    expect(warnings, `warned about carried fields: ${warnings.join(' | ')}`).toEqual([])
  })

  it('says nothing about the remote fields it carries either', () => {
    const warnings: string[] = []
    const cwd = projectWith({
      url: 'https://example.com/mcp',
      type: 'http',
      headers: { A: 'b' },
      requestTimeoutMs: 1_000,
    })

    loadMcpJson(cwd, { env: {}, onWarn: (w) => warnings.push(w) })

    expect(warnings, `warned about carried fields: ${warnings.join(' | ')}`).toEqual([])
  })
})
