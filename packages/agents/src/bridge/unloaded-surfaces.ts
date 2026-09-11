/**
 * B-027 — `.claude/workflows/*.js`, found and deliberately not executed.
 *
 * The item's Definition of Done named the two acceptable answers: load the surface, or declare it
 * out of scope with a reason that is about THIS PRODUCT rather than about effort. It also supplied
 * the reason, and the reason holds:
 *
 *   "an executable JS file that orchestrates subagents is a different trust proposition from a
 *    markdown prompt, and that is a legitimate reason to refuse it"
 *
 * Every surface this layer does admit — `commands`, `hooks`, `plugins`, `skills`, `subagents`
 * (`setting-sources-gate.ts`) — is DATA. A workflow file is CODE. In the reference, a person chose
 * to start a CLI in a directory; here the directory is an argument to a library, so loading this
 * surface would make `cwd` an execution vector for every consumer of the package. That decision
 * belongs to the consumer, and a library that takes it on their behalf has taken it silently.
 *
 * ## What is refused, and what is not
 *
 * The ORCHESTRATION is supported: `@theokit/sdk` exports `Workflow`, `agentStep` and `createSquad`,
 * and composing many subagents from a script is typed and tested. What is refused is DISCOVERING
 * AND EXECUTING a file found on disk. The report says so, because a refusal that does not name the
 * supported path sends the reader to a changelog to find out whether the capability exists at all.
 *
 * ## Why this reports instead of staying silent
 *
 * Silence is the defect the whole backlog is about, in its third instance: the dropped `alwaysLoad`
 * in `mcp-file.ts`, the output style nothing read in B-022, and a `workflows/` directory whose
 * author sees no complaint and concludes it took effect. The cost of the report is one line.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Where the reference keeps workflow scripts, relative to a project root. */
const WORKFLOWS_DIR = join('.claude', 'workflows')

/** What a workflow script is named. `.mjs` and `.cjs` count — the refusal is about execution. */
const SCRIPT_SUFFIXES = ['.js', '.mjs', '.cjs'] as const

export interface ReportUnloadedSurfacesInput {
  /** Project root whose `.claude/` is inspected. */
  readonly cwd: string
  /** Where a report goes. Called once per unloaded surface that is actually present. */
  readonly onWarn: (warning: string) => void
}

/**
 * Report the `.claude` surfaces that are present on disk and deliberately not loaded.
 *
 * Says nothing when there is nothing to say: a reporter that fired on every project would be noise,
 * and noise is how a real report stops being read.
 */
export function reportUnloadedSurfaces(input: ReportUnloadedSurfacesInput): void {
  const dir = join(input.cwd, WORKFLOWS_DIR)
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is the caller's own project root joined with a fixed convention; no component comes from untrusted input
  if (!existsSync(dir)) return

  let scripts: readonly string[]
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same path, existence-checked above
    scripts = readdirSync(dir).filter((f) => SCRIPT_SUFFIXES.some((s) => f.endsWith(s)))
  } catch {
    // An unreadable directory is not a workflow anybody wrote, and refusing to start over a
    // permission error on a surface we do not load would be a worse outcome than staying quiet.
    return
  }
  if (scripts.length === 0) return

  input.onWarn(
    `${WORKFLOWS_DIR}: found ${String(scripts.length)} workflow script(s) — ` +
      `${[...scripts].sort((a, b) => a.localeCompare(b)).join(', ')} — which this runtime does NOT ` +
      `execute. Every configuration surface it loads is data (commands, hooks, plugins, skills, ` +
      `subagents); a workflow file is code, and executing JavaScript found under a caller-supplied ` +
      `directory is a trust decision that belongs to you rather than to this library. The ` +
      `orchestration itself is supported: build the same pipeline with Workflow / agentStep / ` +
      `createSquad from @theokit/sdk, which you import explicitly.`,
  )
}
