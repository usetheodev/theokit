import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadMcpJson } from '../../src/bridge/mcp-file.js'

/**
 * `${VAR}` reached the server as eleven literal characters.
 *
 * `.mcp.json` is committed, so the specification's only way to keep a credential OUT of it is a
 * named reference: `"env": { "API_KEY": "${API_KEY}" }`. Nothing expanded it, and `isStringRecord`
 * accepts the placeholder as a perfectly valid string — so the entry validated, the server started,
 * and it authenticated with the text `${API_KEY}`. The failure surfaces as a remote auth error with
 * no path back to the config line.
 *
 * ## Why this does not loosen the posture this module already takes
 *
 * `buildEntry`'s docblock refuses `envPolicy` deliberately: "A file committed to the repository is no
 * place to loosen a process-level defence." A named reference is the opposite of that. `envPolicy:
 * "all"` hands the server the WHOLE environment from a committed file; `${API_KEY}` names one
 * variable the host already chose to set. Refusing expansion does not protect the secret — it pushes
 * the author to paste the literal value into the file, which is the outcome the posture exists to
 * prevent.
 *
 * The environment is INJECTED rather than read from `process.env`, matching how the rest of this
 * package reads env (`diagnostic-sink.ts`, `transcript-root-hint.ts`): a test can then prove the
 * expansion without mutating the process it runs in.
 */
function projectWith(mcp: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'theokit-mcp-env-'))
  writeFileSync(join(dir, '.mcp.json'), JSON.stringify(mcp))
  return dir
}

describe('an env reference in .mcp.json expands', () => {
  it('test_a_named_reference_resolves_from_the_injected_environment', () => {
    const dir = projectWith({
      mcpServers: { notion: { command: 'npx', env: { NOTION_TOKEN: '${NOTION_TOKEN}' } } },
    })
    const map = loadMcpJson(dir, { env: { NOTION_TOKEN: 'secret-value' } })
    const entry = map.notion as { env?: Record<string, string> }
    expect(
      entry.env?.NOTION_TOKEN,
      'the placeholder reached the server as literal text, so it authenticated with "${NOTION_TOKEN}"',
    ).toBe('secret-value')
  })

  it('test_a_reference_with_no_value_is_reported_rather_than_forwarded', () => {
    const warnings: string[] = []
    const dir = projectWith({
      mcpServers: { notion: { command: 'npx', env: { NOTION_TOKEN: '${MISSING}' } } },
    })
    loadMcpJson(dir, { env: {}, onWarn: (w) => warnings.push(w) })
    expect(
      warnings.join('\n'),
      'an unset reference must name itself — otherwise the failure surfaces at the remote end',
    ).toMatch(/MISSING/)
  })

  it('test_a_plain_value_is_untouched', () => {
    // The control. A fix that rewrote every string would satisfy the tests above and corrupt configs.
    const dir = projectWith({
      mcpServers: { notion: { command: 'npx', env: { MODE: 'production' } } },
    })
    const map = loadMcpJson(dir, { env: { MODE: 'ignored' } })
    const entry = map.notion as { env?: Record<string, string> }
    expect(entry.env?.MODE).toBe('production')
  })
})
