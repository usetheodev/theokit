/**
 * B-028 — `.claude/agent-memory/`, the per-subagent memory a `memory:` frontmatter key promises.
 *
 * Measured 2026-09-12 with controls (`loadMcpJson` 6 files here, an invented term 0): `agent-memory`
 * returns 0 files in this package, and the 7 hits in `@theokit/sdk@5.5.0` — the version the
 * downstream product runs — are the internal module names `local-agent-memory.ts`,
 * `local-agent-memory-direct.ts` and `local-agent-memory-provider.ts`. The SDK's `MemorySettings` is
 * a different feature: a vector store with embeddings and `scope: "agent" | "user" | "team"`.
 *
 * So a subagent whose frontmatter said `memory: project` began every run with nothing while its own
 * definition said otherwise.
 *
 * ## What this module owns
 *
 * It RESOLVES the root for a scope and READS `MEMORY.md` under the documented caps. Writing is the
 * subagent's, and composing the text into a system prompt belongs to whoever builds the prompt —
 * inventing a second composition path here would give one failure two vocabularies, the same reason
 * `output-styles.ts` stops at reading.
 *
 * ## Why an unknown scope THROWS
 *
 * The three roots differ in who can see the notes: `project` is committed and shared with the team,
 * `local` is deliberately kept out of version control, `user` crosses projects. Falling back to
 * `project` on an unrecognised value would publish, on the next commit, notes somebody wrote
 * expecting privacy. There is no safe default among three answers that differ in exactly that way.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { TheokitAgentError } from '@theokit/sdk/errors'

/** Lines of `MEMORY.md` loaded, matching the reference. */
export const MEMORY_LINE_CAP = 200
/** Bytes loaded, matching the reference. Applied with the line cap, not instead of it. */
export const MEMORY_BYTE_CAP = 25_000

/** Where a subagent's memory lives. The values a `memory:` frontmatter key may take. */
export type AgentMemoryScope = 'project' | 'local' | 'user'

const ROOTS: Readonly<Record<AgentMemoryScope, readonly [base: 'cwd' | 'home', dir: string]>> = {
  project: ['cwd', 'agent-memory'],
  local: ['cwd', 'agent-memory-local'],
  user: ['home', 'agent-memory'],
}

/** A memory root could not be resolved. Typed, per `error-handling.md` § 2. */
export class AgentMemoryError extends TheokitAgentError {
  override readonly name = 'AgentMemoryError'

  constructor(message: string) {
    // Not retryable: a scope that is unrecognised on this call is unrecognised on the next, and a
    // name that escapes the root still escapes it. Retrying re-asks a settled question.
    super(`[@theokit/agents] ${message}`, { code: 'agent_memory_unresolved', isRetryable: false })
  }
}

export interface ResolveAgentMemoryInput {
  /** The subagent's name — the directory it owns under the root. */
  readonly agent: string
  /**
   * Which root, from the subagent's `memory:` frontmatter.
   *
   * Typed as the union WIDENED with `string`, because that is what the boundary actually carries: the
   * value is read out of a markdown file nobody type-checked. Declaring it as the narrow union would
   * make the refusal below unreachable to the type system and reachable in production — the shape
   * where a lint is right about the type and wrong about the world.
   */
  readonly scope: AgentMemoryScope | (string & {})
  /** Project root, for `project` and `local`. */
  readonly cwd: string
  /** Home directory, required for `user`. */
  readonly homeDir?: string
}

export interface AgentMemory {
  /** The directory this subagent reads and writes. Resolves even when nothing is written yet. */
  readonly root: string
  /** `MEMORY.md`, under both caps. Absent when the subagent has written none. */
  readonly memory?: string
  /** Whether a cap bit. Reported because silent truncation is the silence this surface removes. */
  readonly truncated: boolean
}

/**
 * A name may only ever be one directory under the root.
 *
 * The value comes from a subagent definition that usually arrives with the repository, so `../` in
 * it is a project reaching outside the directory this surface is confined to.
 */
function assertContained(root: string, agent: string): void {
  const full = resolve(root, agent)
  if (!full.startsWith(resolve(root) + '/')) {
    throw new AgentMemoryError(
      `subagent name "${agent}" does not resolve to a directory inside the memory root. A name ` +
        `is one directory, and this one escapes — it is refused rather than normalised, because a ` +
        `normalised path is a different directory than the author wrote.`,
    )
  }
}

/** Apply both caps, and say whether either bit. */
function capped(raw: string): { text: string; truncated: boolean } {
  const lines = raw.split('\n')
  let text = lines.slice(0, MEMORY_LINE_CAP).join('\n')
  let truncated = lines.length > MEMORY_LINE_CAP

  if (Buffer.byteLength(text, 'utf8') > MEMORY_BYTE_CAP) {
    // Sliced on BYTES rather than characters, because the cap the reference states is a byte cap —
    // then trimmed back to a whole character so a multi-byte one is never cut in half.
    text = Buffer.from(text, 'utf8').subarray(0, MEMORY_BYTE_CAP).toString('utf8')
    if (text.endsWith('�')) text = text.slice(0, -1)
    truncated = true
  }
  return { text, truncated }
}

/**
 * The memory root for a subagent, and what it has written there.
 *
 * @throws AgentMemoryError on a scope the reference does not define, on a name that would escape the
 * root, or on `user` scope with no home directory.
 */
/**
 * Is this one of the three the reference defines?
 *
 * `Object.hasOwn` rather than `in`, and the difference is a real hole: `in` walks the prototype, so
 * `memory: constructor` would index a function and resolve a root nobody declared. A cast would have
 * hidden both the check and the hole from the type system, which is why there is none.
 */
function isScope(value: string): value is AgentMemoryScope {
  return Object.hasOwn(ROOTS, value)
}

export function resolveAgentMemory(input: ResolveAgentMemoryInput): AgentMemory {
  if (!isScope(input.scope)) {
    throw new AgentMemoryError(
      `memory scope "${input.scope}" is not one of: ${Object.keys(ROOTS).join(', ')}. It ` +
        `is refused rather than defaulted, because the three differ in WHO CAN SEE the notes — ` +
        `\`project\` is committed, \`local\` is kept out of version control, \`user\` crosses ` +
        `projects — and guessing would publish something somebody wrote expecting privacy.`,
    )
  }
  const [base, dir] = ROOTS[input.scope]

  const baseDir = base === 'home' ? input.homeDir : input.cwd
  if (baseDir === undefined) {
    throw new AgentMemoryError(
      `memory scope "user" needs a home directory and none was given. Falling back to the project ` +
        `would write cross-project notes into one repository, which is the opposite of what the ` +
        `scope asks for.`,
    )
  }

  const memoryRoot = join(baseDir, '.claude', dir)
  assertContained(memoryRoot, input.agent)
  const root = join(memoryRoot, input.agent)
  const file = join(root, 'MEMORY.md')

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is the caller's own project/home root, a fixed convention, and an agent name proven contained above
  if (!existsSync(file)) return { root, truncated: false }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- same path, existence-checked on the line above
  const { text, truncated } = capped(readFileSync(file, 'utf8'))
  return { root, memory: text, truncated }
}
