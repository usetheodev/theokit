/* eslint-disable security/detect-non-literal-fs-filename --
 * A loader that reads `.theokit/commands/` from directories the caller names. The variable filename
 * IS the feature. No HTTP input reaches here — the paths come from the framework's own convention
 * resolution, and the project directory is gated on the M68/M73 trust decision.
 */
import { type Stats, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

import type { ResolvedCompatSource } from '../bridge/setting-sources-gate.js'
import { reportUnloadedSurfaces } from '../bridge/unloaded-surfaces.js'

/**
 * The narrowed half of `ResolvedCompatSource`, split out because the union's other half is the
 * string literal `'claude-code'` — and `string | 'claude-code'` collapses to `string`, which would
 * make the object arm unreachable to the type system.
 *
 * Its `kind` is that one literal today, so the loader below does not re-check it. A second foreign
 * dialect would widen it, and would have to revisit `COMPAT_COMMANDS_DIR` in the same breath: the
 * directory this reads is `.claude/`, not "whichever dialect asked".
 */
type NarrowedCompatSource = Exclude<ResolvedCompatSource, string>

import { frontmatterValue, splitFrontmatter } from './frontmatter.js'

/**
 * M76 — load custom commands from `.theokit/commands/`.
 *
 * ## Why this gap was worse than a missing feature
 *
 * The framework OWNS the `.theokit/` convention and already loads `skills/`, `agents/` and
 * `hooks.json` from it. `commands/` — the one directory every product-facing agent surface wants —
 * had no loader at all. So a consumer wrote markdown-with-frontmatter scanning **against the
 * framework's own directory**: reimplementing the reading of a convention the framework defines.
 *
 * A convention with a hole in it is worse than no convention. It teaches the reader that `.theokit/`
 * is the framework's, then makes them write the loader themselves for one subdirectory, and their
 * loader inevitably disagrees with ours about frontmatter, precedence and trust.
 *
 * ## Trust, and why project commands are gated
 *
 * A command is a prompt the user can invoke by name. A project-level one comes from the working
 * directory — which, for an agent pointed at a repository the user just cloned, is
 * attacker-controlled content. Same decision as M68: `projectTrusted` false means project commands
 * do not load. User-level commands under `homeDir` need no gate — that is the operator's own
 * machine.
 *
 * ## Warns, never decides
 *
 * On a name collision this loader REPORTS and moves on. Which command wins when a custom one shadows
 * a builtin is the product's router to decide (M83) — it is the only layer that knows what its
 * builtins are. A loader that silently dropped one would make that decision invisibly, on behalf of
 * a product it cannot see.
 */

/** One command loaded from disk. */
export interface CustomCommand {
  /** Invocation name, derived from the file name without its extension. */
  readonly name: string
  /** One-line summary from `description:` in the frontmatter, when present. */
  readonly description?: string
  /** The prompt body, frontmatter removed. */
  readonly body: string
  /** Which layer it came from. `project` beats `user` — see {@link loadCustomCommands}. */
  readonly source: 'project' | 'user'
  /** Absolute path, for messages a human can act on. */
  readonly path: string
  /**
   * The frontmatter lines, verbatim — read your own keys with {@link frontmatterValue}.
   *
   * This loader knows two keys (`description`, and the fence). A product's commands declare more,
   * and the sets do not agree: the closest consumer reads `model`, `agent`, `subtask` and `hints`,
   * while Claude Code's custom commands declare `model` and `argument-hint`. Two vocabularies
   * already, and neither is the framework's to adopt.
   *
   * Carrying the lines is what stops that from forcing a second loader. Measured: the consumer
   * wrote 122 lines — the same directories, the same trust gate, the same precedence — because the
   * result gave it nowhere to read its own keys from.
   */
  readonly frontmatter: readonly string[]
}

export interface LoadCustomCommandsInput {
  /** Project root. Its `.theokit/commands/` is read only when `projectTrusted`. */
  readonly projectDir?: string
  /** Operator home. Its `.theokit/commands/` needs no trust gate. */
  readonly homeDir?: string
  /**
   * Whether the project directory is trusted (M68/M73).
   *
   * REQUIRED, like `approved` on the hook engine and for the same reason: an optional security gate
   * is a gate somebody forgets, and forgetting this one loads prompts written by whoever wrote the
   * repository.
   */
  readonly projectTrusted: boolean
  /** Names the product already uses, so a shadow can be reported rather than discovered later. */
  /**
   * Foreign dialects whose command directory the caller wants read, in the SDK's `compatSources`
   * vocabulary. `['claude-code']` adds `<projectDir>/.claude/commands/`.
   *
   * Declaration AND trust, exactly as `resolveCompatSources` requires for the other surfaces: a
   * command is a prompt that runs on the operator's behalf, and this directory is usually written
   * for a different product and arrives with the repository.
   */
  readonly compatSources?: readonly (string | NarrowedCompatSource)[]
  readonly builtinNames?: readonly string[]
  /** Where a shadow, a duplicate, or a malformed file is reported. */
  readonly onWarn?: (message: string) => void
}

export interface CustomCommandsResult {
  /** Loaded commands, project-level first. Names are unique — see the precedence note. */
  readonly commands: readonly CustomCommand[]
  /** Names that also exist as builtins. Reported, never resolved here. */
  readonly shadowedBuiltins: readonly string[]
}

const COMMANDS_DIR = join('.theokit', 'commands')

/**
 * The foreign dialect's command directory, read only when the caller DECLARES it.
 *
 * Three surfaces already reach `<cwd>/.claude/` when a consumer declares it — rules, skills and
 * subagents, through the SDK's `compatSources`. Commands are loaded here instead, and were the one
 * surface that never learned about it: the file sat on disk, the name never appeared, and nothing
 * said why. A partial dialect is worse than none, because whoever watched the other three work has
 * no reason to suspect the fourth.
 */
const COMPAT_COMMANDS_DIR = join('.claude', 'commands')

/** The compat source that names the dialect above; the SDK's own vocabulary, not a second one. */
const CLAUDE_CODE_SOURCE = 'claude-code'
const IGNORE_WARNING = (): void => undefined

/**
 * Does the caller's declaration reach the foreign COMMANDS directory?
 *
 * Two shapes, because `#686` let a consumer narrow the root: the bare source name grants every
 * surface it feeds, and the narrowed form grants only the ones it names. Testing membership with
 * `includes(CLAUDE_CODE_SOURCE)` — which is what this did until #704 — reads the narrowed form as
 * *not declared*, because an object is not that string. The directory then went unread with no
 * message, which is the exact silence the docblock above says this code exists to remove.
 */
function declaresCommands(sources: LoadCustomCommandsInput['compatSources']): boolean {
  return (
    sources?.some((source) =>
      typeof source === 'string'
        ? source === CLAUDE_CODE_SOURCE
        : source.import.includes('commands'),
    ) === true
  )
}

/**
 * Load `.theokit/commands/*.md` from the project and the user, project winning.
 *
 * Precedence is project-over-user because the project is the more specific scope: a repository that
 * ships a `review` command means *its* review, and having the operator's generic one silently take
 * precedence would make the repository's own configuration the weaker statement.
 */
/**
 * The project directories to read, in precedence order — foreign first, native last.
 *
 * Last write wins the map, so a project's own `.theokit/commands/` keeps its name against a
 * same-named command from another product's directory. The foreign root appears only when the
 * caller DECLARED it; reading it unasked is the behaviour `usetheokit/theokit-sdk#524` removed
 * from every other surface.
 *
 * Separate from the loop because the two callers below — the trusted path and the refusal that has
 * to COUNT what it skipped — must agree on the answer, and because a list is easier to be right
 * about than a branch repeated twice.
 */
/**
 * Does the caller declare the foreign dialect AT ALL — bare or narrowed?
 *
 * Deliberately broader than `declaresCommands`, and the difference is the point. That predicate asks
 * whether the COMMANDS directory was granted; this one asks whether the consumer opted into the
 * dialect, because `workflows` is not a `CompatSurface` and can never appear in a narrowed `import`
 * list. Reusing the narrower predicate would report the unloaded surface only to consumers who
 * happened to ask for commands, which is the arbitrary half of a silence rather than its removal.
 */
function declaresClaudeCode(sources: LoadCustomCommandsInput['compatSources']): boolean {
  return (
    sources?.some(
      (source) =>
        // The narrowed form IS a declaration of this dialect by construction — its `kind` is the one
        // literal, which is why `declaresCommands` does not re-check it either and why the
        // `NarrowedCompatSource` docblock says a second dialect must revisit both. Comparing it here
        // would be a runtime check the type already makes, and `no-unnecessary-condition` is right
        // about that: the type is not lying, there is exactly one dialect.
        typeof source !== 'string' || source === CLAUDE_CODE_SOURCE,
    ) === true
  )
}

function projectCommandDirs(input: LoadCustomCommandsInput): string[] {
  if (input.projectDir === undefined) return []
  const dirs: string[] = []
  if (declaresCommands(input.compatSources)) {
    dirs.push(join(input.projectDir, COMPAT_COMMANDS_DIR))
  }
  dirs.push(join(input.projectDir, COMMANDS_DIR))
  return dirs
}

/**
 * Fold the project's commands into `loaded`, or explain why none were.
 *
 * Its own function because the trusted and untrusted paths are two different jobs — merging, and
 * COUNTING what was refused — and reading them inside the orchestrator put five levels of nesting
 * between the reader and either one.
 */
function mergeProjectCommands(
  input: LoadCustomCommandsInput,
  loaded: Map<string, CustomCommand>,
  warn: (message: string) => void,
): void {
  const dirs = projectCommandDirs(input)
  if (dirs.length === 0) return

  if (!input.projectTrusted) {
    // The foreign root is counted too: a declared `.claude/commands/` skipped for want of trust
    // must say so, or the operator reads the same silence this whole change removed.
    const pending = dirs.flatMap((dir) => readCommandsDir(dir, 'project', IGNORE_WARNING))
    if (pending.length > 0) {
      warn(
        `${String(pending.length)} project command(s) found but the directory is not trusted — ` +
          `none were loaded. A command is a prompt that runs on your behalf.`,
      )
    }
    return
  }

  for (const command of dirs.flatMap((dir) => readCommandsDir(dir, 'project', warn))) {
    const shadowed = loaded.get(command.name)
    if (shadowed?.source === 'user') {
      warn(`project command "${command.name}" overrides the user-level one at ${shadowed.path}.`)
    }
    loaded.set(command.name, command)
  }
}

export function loadCustomCommands(input: LoadCustomCommandsInput): CustomCommandsResult {
  const warn = input.onWarn ?? IGNORE_WARNING
  const loaded = new Map<string, CustomCommand>()

  // B-027 — the surfaces of this dialect that are present and deliberately NOT loaded. Reported
  // here because this is where a consumer opts into `.claude/`, and the docblock on
  // COMPAT_COMMANDS_DIR above already says why it matters: a partial dialect is worse than none,
  // since whoever watched the other surfaces work has no reason to suspect the missing one.
  //
  // Before the trust branch on purpose: "we did not run your workflows" holds either way, and the
  // consumer auditing an untrusted repository is the one most entitled to know what is in it.
  if (input.projectDir !== undefined && declaresClaudeCode(input.compatSources)) {
    reportUnloadedSurfaces({ cwd: input.projectDir, onWarn: warn })
  }

  // User first, project second: the later write wins the map, which is the precedence.
  if (input.homeDir !== undefined) {
    for (const command of readCommandsDir(join(input.homeDir, COMMANDS_DIR), 'user', warn)) {
      loaded.set(command.name, command)
    }
  }

  mergeProjectCommands(input, loaded, warn)

  const builtins = new Set(input.builtinNames ?? [])
  const shadowedBuiltins = [...loaded.keys()].filter((name) => builtins.has(name))
  for (const name of shadowedBuiltins) {
    warn(
      `custom command "${name}" has the same name as a builtin. This loader does not choose ` +
        `between them — the router decides, because only it knows what its builtins do.`,
    )
  }

  return {
    // Project first in the returned order, matching the precedence a reader would expect.
    commands: [...loaded.values()].sort(byProjectThenName),
    shadowedBuiltins,
  }
}

/** Project before user, then alphabetical — the order the precedence rule implies. */
function byProjectThenName(a: CustomCommand, b: CustomCommand): number {
  if (a.source !== b.source) return a.source === 'project' ? -1 : 1
  return a.name.localeCompare(b.name)
}

/**
 * Read one commands directory, subdirectories included.
 *
 * It used to stop at `!statSync(path).isFile()`, so a namespaced command was not unsupported — it
 * was INVISIBLE. No warning, no error: the file sits there and the command does not exist.
 *
 * Namespacing is not one product's idea. Claude Code reads
 * as a namespaced command, and the closest consumer names nested files by their relative path for
 * the same reason a flat directory stops scaling past a dozen commands.
 *
 * The name is the path relative to the root, extension removed. How it is RENDERED —
 * `frontend:component`, `frontend/component` — is the product's, and the two known products already
 * disagree, so the framework does not choose.
 *
 * A missing directory is not an error — it is a machine with no commands.
 */
function readCommandsDir(
  dir: string,
  source: CustomCommand['source'],
  warn: (message: string) => void,
  root: string = dir,
): CustomCommand[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }

  // Sorted so the load order is the same on every machine — `readdir` order is filesystem-defined,
  // and a warning that appears in a different order per run is a warning nobody can diff. Sorting
  // in place is safe: `entries` is the array `readdirSync` just minted for us, held by nobody else.
  entries.sort((a, b) => a.localeCompare(b))

  const commands: CustomCommand[] = []
  for (const entry of entries) {
    const path = join(dir, entry)
    let stats: Stats
    try {
      stats = statSync(path)
    } catch {
      continue // vanished between readdir and stat
    }

    if (stats.isDirectory()) {
      commands.push(...readCommandsDir(path, source, warn, root))
      continue
    }
    if (!stats.isFile() || extname(entry) !== '.md') continue

    const command = parseCommandFile(path, relative(root, path), source, warn)
    if (command !== undefined) commands.push(command)
  }
  return commands
}

/**
 * Parse one command file.
 *
 * A file whose frontmatter never closes is SKIPPED with a warning, exactly as the instruction tree
 * does: one malformed file must not disable every command the user wrote.
 */
function parseCommandFile(
  path: string,
  entry: string,
  source: CustomCommand['source'],
  warn: (message: string) => void,
): CustomCommand | undefined {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }

  const parsed = splitFrontmatter(raw)
  if (parsed === undefined) {
    warn(`command frontmatter never closes, file skipped: ${path}`)
    return undefined
  }

  const description = frontmatterValue(parsed.frontmatter, 'description')
  return {
    // `entry` is the path RELATIVE to the commands root, so a nested file keeps its namespace.
    // `basename` would flatten `frontend/component.md` to `component` and let two namespaces
    // silently collide on one name.
    name: entry.slice(0, -extname(entry).length),
    ...(description !== undefined && { description }),
    body: parsed.body,
    source,
    path,
    frontmatter: parsed.frontmatter,
  }
}
