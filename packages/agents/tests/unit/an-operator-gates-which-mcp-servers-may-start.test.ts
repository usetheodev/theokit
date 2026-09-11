import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { loadMcpJson } from '../../src/bridge/mcp-file.js'
import { _resetOperatorPolicyForTests } from '../../src/config/operator-policy.js'

/**
 * `.mcp.json` was read from the working directory and nothing decided which of its servers may run.
 *
 * Measured: `allowedMcpServers`, `deniedMcpServers`, `allowManagedMcpServersOnly`,
 * `enabledMcpjsonServers`, `disabledMcpjsonServers` and `enableAllProjectMcpServers` all returned 0
 * files, against a control of 31 on the word `hooks`, while `loadMcpJson` does read
 * `<cwd>/.mcp.json`.
 *
 * The loader shipped and the gate did not, which is worse than having neither: a consumer who wanted
 * the convenience of the file inherited the exposure without being offered the control.
 *
 * ## The default, decided rather than inherited
 *
 * Today's default is "every server in the file starts", by ABSENCE. It stays "every server", by
 * CHOICE — the file is the project's own declaration, and refusing it by default would break every
 * existing consumer to protect against a file they wrote themselves.
 *
 * What changes is that an operator can now narrow it. `deniedMcpServers` removes named servers;
 * `allowedMcpServers`, once present, makes the list exhaustive — anything unnamed is refused. Deny
 * wins over allow, because a rule that says "no" and a rule that says "yes" about the same server
 * are a contradiction, and the safe reading of a contradiction is the restrictive one.
 *
 * ## One trust vocabulary
 *
 * This composes with the operator tier rather than introducing a second grammar: the same
 * `managed-settings.json`, the same "the project cannot switch it off" precedence, the same
 * report-never-carry rule for keys this layer does not enforce. `TrustPosture` stays what it is —
 * the gate over whether a DIRECTORY's config is read at all; this is the gate over which servers
 * inside an admitted file may start.
 */
function projectWith(servers: string[], policy: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'theokit-mcp-gate-'))
  const policyRoot = mkdtempSync(join(tmpdir(), 'theokit-mcp-policy-'))
  onTestFinished(() => {
    _resetOperatorPolicyForTests()
  })
  writeFileSync(
    join(dir, '.mcp.json'),
    JSON.stringify({
      mcpServers: Object.fromEntries(
        servers.map((name) => [name, { command: 'node', args: [`${name}.js`] }]),
      ),
    }),
  )
  mkdirSync(join(policyRoot, 'claude-code'), { recursive: true })
  writeFileSync(join(policyRoot, 'claude-code', 'managed-settings.json'), JSON.stringify(policy))
  _resetOperatorPolicyForTests(policyRoot)
  return dir
}

describe('an operator gates which MCP servers may start', () => {
  it('starts every declared server when no policy narrows it', () => {
    // The control, and the decided default. The file is the project's own declaration; refusing it
    // by default would break every existing consumer to protect against something they wrote.
    const dir = projectWith(['github', 'postgres'], {})
    expect(Object.keys(loadMcpJson(dir)).sort((a, b) => a.localeCompare(b))).toEqual([
      'github',
      'postgres',
    ])
  })

  it('refuses a denied server', () => {
    const warn = vi.fn()
    const dir = projectWith(['github', 'postgres'], { deniedMcpServers: ['postgres'] })

    expect(
      Object.keys(loadMcpJson(dir, { onWarn: warn })),
      'the operator denied this server and it started anyway',
    ).toEqual(['github'])
    expect(warn.mock.calls.map((c) => String(c[0])).join('')).toContain('postgres')
  })

  it('makes an allow list exhaustive', () => {
    const dir = projectWith(['github', 'postgres'], { allowedMcpServers: ['github'] })
    expect(
      Object.keys(loadMcpJson(dir, { onWarn: vi.fn() })),
      'a server the operator never named started anyway',
    ).toEqual(['github'])
  })

  it('lets deny win over allow', () => {
    // A server named in both is a contradiction, and the safe reading of a contradiction is the
    // restrictive one. Resolving it the other way would let an allow entry re-enable something an
    // operator explicitly refused.
    const dir = projectWith(['github'], {
      allowedMcpServers: ['github'],
      deniedMcpServers: ['github'],
    })
    expect(Object.keys(loadMcpJson(dir, { onWarn: vi.fn() }))).toEqual([])
  })

  it('reports a policy value it cannot read, and applies nothing from it', () => {
    // `"deniedMcpServers": "postgres"` — a string, not an array. Coercing it would make every
    // single-character substring a server name; ignoring it silently would leave the organisation
    // believing a server is blocked.
    const warn = vi.fn()
    const dir = projectWith(['github', 'postgres'], { deniedMcpServers: 'postgres' })

    expect(
      Object.keys(loadMcpJson(dir, { onWarn: warn })).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['github', 'postgres'])
    expect(warn.mock.calls.map((c) => String(c[0])).join('')).toContain('deniedMcpServers')
  })
})
