import { mkdirSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'

import {
  _resetOperatorPolicyForTests,
  currentOperatorPolicy,
} from '../../src/config/operator-policy.js'
import { runCredentialHelper } from '../../src/auth/credential-helper.js'

/**
 * An operator whose credentials rotate had no seam to refresh them.
 *
 * Measured (B-069): `apiKeyHelper`, `awsAuthRefresh`, `gcpAuthRefresh` and `otelHeadersHelper` all
 * returned 0 occurrences against a control of 31 on the word `hooks`. Each names the same shape in
 * the reference format — an operator-supplied command that MINTS or REFRESHES a credential — and
 * none of them existed here. A long-running agent on a rotating token fails mid-run, and the only
 * available answer was to restart it with a fresh environment variable.
 *
 * ## Why this is an operator declaration and not a constructor argument
 *
 * B-065 decided it: the person answerable for what an agent may do on a machine is frequently not
 * the person who wrote the code. A credential helper is exactly that kind of thing — it names a
 * command that runs on the operator's box and produces a secret — so it belongs in the tier a
 * project cannot widen, alongside `disableSkillShellExecution` and the MCP gates.
 *
 * Offering it as a `defineAgent({ apiKeyHelper })` argument would have put the mechanism in the hands
 * of the code, which is the half of the system the operator is protecting themselves from.
 *
 * ## What the helper is NOT allowed to be
 *
 * Two refusals are pinned below, and both are about the same thing: a helper is a credential source,
 * not an escape hatch.
 *
 * A helper that hangs stalls the agent, so it runs under a timeout and a breach is a typed failure
 * rather than a silent wait — the same lesson the ReDoS in `permission-floors.ts` taught one layer
 * down, where making a guard reachable made its cost matter.
 *
 * A helper that prints nothing has not produced a credential, and returning the empty string would
 * hand a caller an "API key" of `''` that fails later as a 401 whose message says nothing about the
 * helper. The failure names the command and what it did.
 */
function policyDir(policy: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'theokit-cred-helper-'))
  // `operatorPolicyPath` builds `<root>/claude-code/managed-settings.json` under a test root —
  // the `/etc` prefix belongs to the real Linux path, not to the seam.
  const dir = join(root, 'claude-code')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'managed-settings.json'), JSON.stringify(policy))
  _resetOperatorPolicyForTests(root)
  onTestFinished(() => _resetOperatorPolicyForTests())
  return root
}

function scriptPrinting(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'theokit-cred-script-'))
  const path = join(dir, 'helper.sh')
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

describe('an operator can declare a credential helper', () => {
  it('reads apiKeyHelper from the operator policy', () => {
    policyDir({ apiKeyHelper: '/usr/local/bin/mint-key' })
    const policy = currentOperatorPolicy(() => {})
    expect(policy.apiKeyHelper).toBe('/usr/local/bin/mint-key')
  })

  it('refuses a helper declared as something other than a string, and says so', () => {
    const warnings: string[] = []
    policyDir({ apiKeyHelper: ['/usr/local/bin/mint-key'] })
    const policy = currentOperatorPolicy((m) => warnings.push(m))
    expect(policy.apiKeyHelper, 'an array was carried as if it were a command').toBeUndefined()
    expect(warnings.join('\n')).toContain('apiKeyHelper')
  })

  it('runs the helper and returns what it printed, trimmed', async () => {
    const script = scriptPrinting('echo "sk-ant-from-helper"')
    await expect(runCredentialHelper(script)).resolves.toBe('sk-ant-from-helper')
  })

  it('fails with a typed error naming the command when the helper prints nothing', async () => {
    const script = scriptPrinting('exit 0')
    await expect(runCredentialHelper(script)).rejects.toThrow(/printed nothing/i)
    await expect(runCredentialHelper(script)).rejects.toThrow(script)
  })

  it('fails with a typed error when the helper exits non-zero', async () => {
    const script = scriptPrinting('echo "boom" >&2; exit 3')
    await expect(runCredentialHelper(script)).rejects.toThrow(/exit(ed)? 3/i)
  })

  it('does not wait forever on a helper that hangs', async () => {
    const script = scriptPrinting('sleep 30')
    const started = Date.now()
    await expect(runCredentialHelper(script, { timeoutMs: 300 })).rejects.toThrow(/timed out/i)
    // The control on the control: a rejection that arrived because the script exited instantly
    // would prove nothing about the timeout. `sleep 30` cannot finish inside the budget.
    expect(Date.now() - started, 'returned too fast to have exercised the timeout').toBeLessThan(
      5_000,
    )
  })

  it('never puts the credential in the error text', async () => {
    // A helper that prints a key AND fails must not leak it through the failure path — the error is
    // read by logs, issue trackers and screenshots, which is exactly where a secret must not be.
    const script = scriptPrinting('echo "sk-ant-SECRET-VALUE"; exit 4')
    await expect(runCredentialHelper(script)).rejects.toThrow(/exit(ed)? 4/i)
    await expect(runCredentialHelper(script)).rejects.not.toThrow(/SECRET-VALUE/)
  })
})

/**
 * The door, pinned.
 *
 * B-067 shipped a named settings stack that compiled, was tested, and was exported from nothing — so
 * the disagreement it existed to fix would have survived it intact. A test importing a module is not
 * a consumer; the export is. This case exists so the same omission cannot happen twice in one slice.
 */
describe('the helper is reachable from @theokit/agents/auth', () => {
  it('exports resolveOperatorApiKey, and NOT the raw command runner', async () => {
    const auth = await import('../../src/auth-entry.js')
    expect(auth.resolveOperatorApiKey, 'the operator tier is unreachable').toBeTypeOf('function')
    expect(
      'runCredentialHelper' in auth,
      'the arbitrary-command runner reached the public surface — a caller could choose what executes',
    ).toBe(false)
  })

  it('returns undefined when no operator declared a helper', async () => {
    // The ordinary case on a machine with no operator tier: absence is not an error, and a caller
    // must be able to tell "nothing declared" from "declared and failed".
    const { resolveOperatorApiKey } = await import('../../src/auth-entry.js')
    policyDir({})
    await expect(resolveOperatorApiKey(() => {})).resolves.toBeUndefined()
  })

  it('returns what the declared helper printed', async () => {
    const { resolveOperatorApiKey } = await import('../../src/auth-entry.js')
    const script = scriptPrinting('echo "sk-ant-via-policy"')
    policyDir({ apiKeyHelper: script })
    await expect(resolveOperatorApiKey(() => {})).resolves.toBe('sk-ant-via-policy')
  })
})
