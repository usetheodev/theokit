/**
 * B-069 — the operator-supplied command that mints or refreshes a credential.
 *
 * The reference format names four of these — `apiKeyHelper`, `awsAuthRefresh`, `gcpAuthRefresh`,
 * `otelHeadersHelper` — and measurement found zero of them here, against a control of 31 occurrences
 * of the word `hooks`. The consequence is not subtle: an agent holding a token that rotates fails
 * mid-run, and the only available answer was to restart the process with a fresh environment
 * variable. A helper is the seam that makes the credential re-fetchable instead of frozen at boot.
 *
 * ## Why the OPERATOR declares it
 *
 * Per B-065, and it is the whole reason this is not a `defineAgent({ apiKeyHelper })` argument: the
 * person answerable for what runs on a machine is often not the person who wrote the code. A
 * credential helper names a command that executes on the operator's box and produces a secret — the
 * most operator-shaped thing in the system — so it lives in the tier a project cannot widen,
 * alongside `disableSkillShellExecution` and the MCP gates.
 *
 * Putting it in the code would hand the mechanism to the half of the system the operator is
 * protecting themselves from.
 *
 * ## One helper, not four
 *
 * `apiKeyHelper` is implemented; the other three are not, and the absence is stated rather than
 * implied. `awsAuthRefresh` and `gcpAuthRefresh` refresh an ambient cloud session rather than
 * returning a value — their contract is a side effect on the environment, which is a different shape
 * and a different blast radius. `otelHeadersHelper` supplies headers for a telemetry exporter, which
 * this layer does not own (the SDK does; see `TelemetrySettings`). Implementing one shape well is
 * worth more than four stubs, and a reader who greps for the other three finds this paragraph rather
 * than silence.
 */
import { execFile } from 'node:child_process'

import { currentOperatorPolicy } from '../config/operator-policy.js'
import { ConfigurationError } from '../errors.js'

/** How long a helper may take before the run is abandoned. */
const DEFAULT_TIMEOUT_MS = 10_000

export interface RunCredentialHelperOptions {
  /**
   * Milliseconds before the helper is killed and the call fails.
   *
   * A helper that hangs stalls every request that needs the credential, and "the agent is slow" is
   * the hardest symptom to trace back to a command in a policy file. Defaults to 10 s, which is
   * generous for minting a token and short enough to name the cause.
   */
  readonly timeoutMs?: number
  /** Working directory for the helper. Defaults to the process's own. */
  readonly cwd?: string
}

/**
 * Run an operator-declared credential helper and return what it printed.
 *
 * @throws ConfigurationError — the command failed, timed out, or produced no credential. The message
 * names the COMMAND and what happened, and never contains the helper's output: a failure is read
 * from logs, issue trackers and screenshots, which is precisely where a secret must not appear.
 */
export async function runCredentialHelper(
  command: string,
  options: RunCredentialHelperOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const printed = await new Promise<string>((resolve, reject) => {
    // Executing an OS command, deliberately, and the lint is right to ask.
    //
    // `shell: true` because the declaration is a COMMAND LINE — an operator writes
    // `aws-vault exec prod -- print-key`, not an argv array.
    //
    // The command is NOT caller data. The only production caller is `resolveOperatorApiKey` below,
    // which reads it from the operator policy file (`/etc/claude-code/managed-settings.json`, or the
    // platform equivalent). That file is the tier above the project by construction: an attacker who
    // can write it already owns the machine, and refusing to execute it would refuse the only thing
    // this feature exists to do.
    // eslint-disable-next-line sonarjs/os-command -- justified immediately above
    execFile(
      command,
      [],
      { shell: true, timeout: timeoutMs, cwd: options.cwd, encoding: 'utf8' },
      // `stderr` is deliberately NOT a parameter. A helper commonly echoes context that includes the
      // credential, and anything named here is one careless template literal away from a log.
      (error, stdout) => {
        if (error === null) {
          resolve(stdout)
          return
        }
        // `killed` is how Node reports the timeout, and it is worth its own message: "timed out"
        // sends the reader to the helper, while a bare exit code sends them to its source.
        if (error.killed === true) {
          reject(
            new ConfigurationError(
              `the credential helper "${command}" timed out after ${timeoutMs}ms and was killed. ` +
                `It is declared in the operator policy; a helper that cannot finish in that budget ` +
                `blocks every request that needs the credential.`,
              { code: 'credential_helper_timeout' },
            ),
          )
          return
        }
        const code = typeof error.code === 'number' ? error.code : 'a non-zero status'
        reject(
          new ConfigurationError(
            `the credential helper "${command}" exited ${code}. It is declared in the operator ` +
              `policy. Its output is not reproduced here, because a helper's stdout is a secret.`,
            { code: 'credential_helper_failed' },
          ),
        )
      },
    )
  })

  const credential = printed.trim()
  if (credential.length === 0) {
    throw new ConfigurationError(
      `the credential helper "${command}" printed nothing. A helper's stdout IS the credential, so ` +
        `an empty run produces no credential — returning the empty string would surface later as a ` +
        `401 whose message says nothing about this command.`,
      { code: 'credential_helper_empty' },
    )
  }
  return credential
}

/**
 * The credential an operator's `apiKeyHelper` produces, or `undefined` when none is declared.
 *
 * This — not {@link runCredentialHelper} — is what a consumer calls, and the narrowing is the point.
 * A function taking an arbitrary command string puts the choice of WHAT to execute in the caller's
 * hands, which is exactly the decision the operator tier exists to take away from them. Here the
 * command can only come from the policy file, so "this runs an operator-declared command" is a
 * property of the code rather than a promise in a docblock.
 *
 * `runCredentialHelper` stays exported for the tests that exercise its failure modes directly; a
 * runner whose timeout and redaction could not be tested in isolation would be a guard nobody can
 * check.
 */
export async function resolveOperatorApiKey(
  warn: (message: string) => void,
  options: RunCredentialHelperOptions = {},
): Promise<string | undefined> {
  const { apiKeyHelper } = currentOperatorPolicy(warn)
  if (apiKeyHelper === undefined) return undefined
  return runCredentialHelper(apiKeyHelper, options)
}
