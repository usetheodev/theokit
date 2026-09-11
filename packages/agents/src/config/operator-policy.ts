/**
 * The OPERATOR tier, as this package reads it.
 *
 * An operator who did not write the code can impose policy on it — the decision recorded in this
 * package's README under "Who decides policy". Hooks, MCP servers, permissions and skill execution
 * used to be values the PROGRAMMER passed at build time, which is defensible for a framework and
 * indefensible for anything an organisation deploys: the person answerable for what an agent may do
 * on a machine had no way to say so.
 *
 * ## Why this exists here AND in `@theokit/sdk`
 *
 * One FORMAT, two readers, and the reason is a release boundary rather than an oversight. The two
 * packages ship from separate repositories on separate versions — this one depends on a PUBLISHED
 * `@theokit/sdk` (`^4.52.1 || ^5.0.0`), so a symbol added to that package's source is not importable
 * here until it is released. A reader that could only work after somebody else cut a release would
 * be a control nobody can reach, which is the failure this whole tier exists to remove.
 *
 * What must not drift is the FILE and its meaning. The path and the key names are Claude Code's, so
 * an organisation writes one policy file and both layers honour it; a key this layer does not
 * enforce is reported rather than carried, exactly as the SDK's reader does.
 *
 * Nothing here is exported beyond `currentOperatorPolicy` and the test reset. The path resolver and
 * the file reader are steps of one answer, and exporting them would offer a second way to read the
 * policy that could disagree with the memoised one — which is the two-caches-of-one-file problem the
 * memo exists to prevent.
 *
 * @internal
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** What an operator may impose on THIS layer. */
export interface OperatorPolicy {
  /**
   * Refuse to execute the `` !`command` `` form in a skill or command body.
   *
   * A skill is a markdown file a repository can carry, and its body runs shell at expansion time.
   * Without this the only way to decline was to stop reading skills at all.
   */
  disableSkillShellExecution?: boolean
  /**
   * Servers from a project `.mcp.json` that may NOT start, by name.
   *
   * Deny wins over {@link OperatorPolicy.allowedMcpServers}. A server named in both is a
   * contradiction, and the safe reading of a contradiction is the restrictive one — resolving it the
   * other way would let an allow entry re-enable something an operator explicitly refused.
   */
  deniedMcpServers?: readonly string[]
  /**
   * When present, the ONLY servers from a project `.mcp.json` that may start.
   *
   * Absent means "no allow list", not "allow nothing": the file is the project's own declaration and
   * the default stays permissive by CHOICE, because refusing it outright would break every existing
   * consumer to protect against a file they wrote themselves. An empty ARRAY is a real decision and
   * refuses everything.
   */
  allowedMcpServers?: readonly string[]
  /**
   * B-069 — a command that prints a credential on stdout, re-run whenever one is needed.
   *
   * An operator whose tokens rotate had no seam at all: a long-running agent failed mid-run and the
   * only answer was a restart with a fresh environment variable. This is declared HERE rather than
   * on `defineAgent` for the reason B-065 records — the person answerable for what runs on a machine
   * is frequently not the person who wrote the code, and a command that mints a secret is the most
   * operator-shaped thing in the system.
   *
   * Run by {@link runCredentialHelper}, which bounds it with a timeout and refuses an empty result.
   */
  apiKeyHelper?: string
}

const KNOWN_KEYS = new Set<keyof OperatorPolicy>([
  'disableSkillShellExecution',
  'deniedMcpServers',
  'allowedMcpServers',
  'apiKeyHelper',
])

/** Keys whose value is a single command line. A non-string is refused rather than coerced. */
const STRING_KEYS = new Set<keyof OperatorPolicy>(['apiKeyHelper'])

/** Which keys are boolean and which are string lists — a value of the wrong shape is refused. */
const LIST_KEYS = new Set<keyof OperatorPolicy>(['deniedMcpServers', 'allowedMcpServers'])

/**
 * Where the platform keeps its managed settings — Claude Code's own paths, because the file is
 * Claude Code's format.
 *
 * `root` exists so the policy branch is testable: the real directories are platform-owned and a test
 * must not write to `/etc`. An untestable refusal is how a control becomes decoration.
 */
function operatorPolicyPath(root?: string): string {
  if (root !== undefined) return join(root, 'claude-code', 'managed-settings.json')
  if (process.platform === 'darwin') {
    return '/Library/Application Support/ClaudeCode/managed-settings.json'
  }
  if (process.platform === 'win32') {
    return join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'ClaudeCode', 'managed-settings.json')
  }
  return '/etc/claude-code/managed-settings.json'
}

/**
 * Read the deployed policy, or `{}` when none is.
 *
 * Absent is the ordinary case and not an error — most machines have no operator tier, and a reader
 * that failed without one would make the feature a prerequisite for running at all.
 *
 * A file that EXISTS and cannot be read is a different fact and is reported, because an organisation
 * that deployed a policy and got silence would believe it applied. That belief is what this tier
 * removes.
 */
function readOperatorPolicy(
  root: string | undefined,
  warn: (message: string) => void,
): OperatorPolicy {
  const path = operatorPolicyPath(root)
  const parsed = readPolicyDocument(path, warn)
  if (parsed === undefined) return {}

  const out: OperatorPolicy = {}
  for (const [key, value] of Object.entries(parsed)) {
    applyPolicyKey(out, key as keyof OperatorPolicy, value, path, warn)
  }
  return out
}

/**
 * The policy file as a JSON object, or `undefined` when there is none to apply.
 *
 * Split from the key loop because the two answer different questions — "is there a document?" and
 * "what does this key mean?" — and together they put the reader over this repository's
 * cognitive-complexity limit.
 *
 * An absent file is the ordinary case on a machine with no operator tier and is NOT reported; a file
 * that exists and cannot be used is the opposite, and an organisation that deployed a policy which
 * is not applying has to be told.
 */
function readPolicyDocument(
  path: string,
  warn: (message: string) => void,
): Record<string, unknown> | undefined {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is this runtime's own, built by `operatorPolicyPath` from a platform constant and an optional test root; it is never caller data
  if (!existsSync(path)) return undefined

  let parsed: unknown
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same path, existence-checked one line above
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    warn(
      `${path} could not be read as JSON (${(cause as Error).message}) — NO operator policy is being applied.`,
    )
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    warn(`${path} is not a JSON object — NO operator policy is being applied.`)
    return undefined
  }
  return parsed as Record<string, unknown>
}

/**
 * Apply ONE declared key, or report why it is not being applied.
 *
 * An unknown key is skipped in silence here, unlike its SDK counterpart: this layer enforces a
 * SUBSET, and the keys it does not read are read by the SDK's own reader over the same file.
 * Reporting them would tell an operator their policy is being ignored when the other half of the
 * runtime is applying it.
 */
function applyPolicyKey(
  out: OperatorPolicy,
  key: keyof OperatorPolicy,
  value: unknown,
  path: string,
  warn: (message: string) => void,
): void {
  if (!KNOWN_KEYS.has(key)) return
  if (LIST_KEYS.has(key)) {
    const list = readStringList(value, key, path, warn)
    if (list === undefined) return
    if (key === 'deniedMcpServers') out.deniedMcpServers = list
    if (key === 'allowedMcpServers') out.allowedMcpServers = list
    return
  }
  if (STRING_KEYS.has(key)) {
    // Not coerced. `String(['/bin/x'])` is `/bin/x` and `String({})` is `[object Object]`; both
    // would be RUN, and the second as a command that cannot exist. A declaration of the wrong shape
    // is an operator's mistake, and the only useful response is to name it.
    if (typeof value !== 'string' || value.trim().length === 0) {
      warn(
        `${path} declares "${key}" as ` +
          `${typeof value === 'string' ? 'an empty string' : typeof value}, ` +
          `not a command line — it is NOT being applied.`,
      )
      return
    }
    if (key === 'apiKeyHelper') out.apiKeyHelper = value.trim()
    return
  }
  if (typeof value !== 'boolean') {
    warn(`${path} declares "${key}" as ${typeof value}, not a boolean — it is NOT being applied.`)
    return
  }
  if (key === 'disableSkillShellExecution') out.disableSkillShellExecution = value
}

/**
 * A list of server names, or `undefined` with a reason.
 *
 * Coercing a bare string would make every character a server name; ignoring it silently would leave
 * the organisation believing a server is blocked.
 */
function readStringList(
  value: unknown,
  key: string,
  path: string,
  warn: (message: string) => void,
): readonly string[] | undefined {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value
  }
  warn(
    `${path} declares "${key}" as ` +
      `${Array.isArray(value) ? 'an array with a non-string entry' : typeof value}, ` +
      `not an array of strings — it is NOT being applied.`,
  )
  return undefined
}

/**
 * The policy in force, read once per process.
 *
 * Memoised because the alternative is an `existsSync` per guarded call, and a policy file does not
 * change under a running process in any way this layer could act on. One memo for the whole layer,
 * not one per consumer: two caches of one file are two answers waiting to disagree.
 */
let cached: OperatorPolicy | undefined
let rootOverride: string | undefined

export function currentOperatorPolicy(warn: (message: string) => void): OperatorPolicy {
  cached ??= readOperatorPolicy(rootOverride, warn)
  return cached
}

/**
 * Clear the memo, optionally pointing at a test-owned policy root.
 *
 * The real path is platform-owned (`/etc/claude-code/…`) and a test must not write there. Exported
 * with the `_` prefix this package uses for a test seam: hiding it would make every policy branch
 * untestable, and an untested refusal is how a control becomes decoration.
 */
export function _resetOperatorPolicyForTests(root?: string): void {
  cached = undefined
  rootOverride = root
}

/**
 * Whether a server declared in a project `.mcp.json` may start.
 *
 * Deny first: a server in both lists is refused. An allow list, once present, is EXHAUSTIVE —
 * anything unnamed is refused — while an absent one means "no allow list", not "allow nothing".
 */
export function mcpServerAdmitted(name: string, policy: OperatorPolicy): boolean {
  if (policy.deniedMcpServers?.includes(name) === true) return false
  if (policy.allowedMcpServers === undefined) return true
  return policy.allowedMcpServers.includes(name)
}
