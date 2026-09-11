/* eslint-disable security/detect-non-literal-fs-filename --
 * An instruction loader that walks a directory tree the caller names. The variable filename IS the
 * feature. Containment is enforced by `assertNoSymlinkEscape` on every resolved path — see the
 * docblock on why that check is a security control and not a nicety.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// Imported from the SDK directly, not from this package's own barrel: these files now LIVE in
// `@theokit/agents`, so `from '@theokit/agents'` would be a package self-reference (and a cycle
// through `src/index.ts`). The barrel re-exports the same SDK symbols for consumers; inside the
// package we reach the source.
import { assertNoSymlinkEscape } from '@theokit/sdk/path-safety'

import { splitFrontmatter } from './frontmatter.js'
import { expandInstructionImports } from './instruction-imports.js'

/**
 * M74 — load a tree of project instruction files, with explicit ceilings.
 *
 * ## Why `compileProjectContext` does not cover this
 *
 * It reads ONE fixed file through the SDK: no depth or file budget, no frontmatter, no cycle guard,
 * no truncation policy, no warning channel. A product that wants project-scoped instructions writes
 * roughly 720 lines of mechanism — all of it identical between products, none of it about their
 * domain.
 *
 * ## The containment check is a security control
 *
 * A symlink inside a project directory can point anywhere. Following one lets a repository the user
 * just cloned inject the contents of `~/.ssh/config`, or any other readable file, straight into the
 * model's system prompt. That is prompt injection with the filesystem as the vector, and every
 * consumer that writes this loader by hand reintroduces it.
 *
 * `assertNoSymlinkEscape` is the SDK's, crossed in M67. Composing it is what makes the check the
 * same one everywhere instead of four subtly different `realpath` comparisons.
 *
 * ## Failure is per FILE, not per tree
 *
 * A malformed frontmatter skips that file and warns. Failing the whole load would let one bad file
 * in a deep tree silently disable every instruction the user wrote — the loudest possible failure
 * producing the quietest possible outcome.
 */

/** One loaded instruction file. */
export interface InstructionBlock {
  /** Path relative to `cwd`, for messages a human can act on. */
  readonly path: string
  /** File body with the frontmatter removed. */
  readonly content: string
  /** `paths:` from the frontmatter — the scopes this block applies to. Empty means unscoped. */
  readonly scopes: readonly string[]
  /**
   * A `paths:` key was declared and nothing readable came out of it.
   *
   * Without this, that case is indistinguishable from a file that declared no scope: both yield
   * `scopes: []`. A consumer rendering the block would then apply a rule written for one subtree
   * EVERYWHERE — the one frontmatter failure with a consequence, and a silent one. Products with a
   * fail-closed policy drop the block on this flag instead of publishing it unscoped.
   */
  readonly scopesUnreadable: boolean
}

/**
 * Does a block's `paths:` scope cover this file?
 *
 * `scopes` shipped without this, and the gap was not cosmetic: the field's own docblock names the
 * consequence of getting it wrong — a rule written for one subtree applied EVERYWHERE, silently —
 * and then hands the decision to the product. Delegating the DECISION is deliberate and unchanged.
 * What was missing is the MEANS: no glob matcher existed anywhere in this package, so a consumer who
 * wanted to honour a scope had to invent the semantics, and two consumers would invent two.
 *
 * `scopesUnreadable` answers FALSE, whatever the path. That is the fail-closed half the flag was
 * invented for: a `paths:` that was declared and yielded nothing must not read as "no scope
 * declared", because those two are indistinguishable in `scopes` alone and only one of them is safe
 * to publish everywhere.
 *
 * ## What this supports, and what it refuses to guess
 *
 * `**` (crosses separators), `*` (does not), and `?` (one character) — the same three the SDK's own
 * rule activation implements. Brace expansion `{a,b}` and character classes `[abc]` are NOT
 * supported: a pattern using them matches literally and therefore almost certainly not at all.
 *
 * That is a deliberate floor rather than a step toward a glob library. Three wildcards are a dozen
 * lines; a dependency for them carries a transitive tree into a package whose direct dependencies
 * number three. If a caller needs the fuller grammar, that is a decision to make out loud — adding
 * it quietly here would leave two half-grammars in one ecosystem.
 */
export function blockAppliesTo(
  block: Pick<InstructionBlock, 'scopes' | 'scopesUnreadable'>,
  filePath: string,
): boolean {
  if (block.scopesUnreadable) return false
  if (block.scopes.length === 0) return true
  return block.scopes.some((scope) => globToRegExp(scope).test(filePath))
}

/**
 * A `**`/`*`/`?` glob as an anchored RegExp.
 *
 * Every other character is escaped, so a `.` in a pattern is a literal dot — without that,
 * `a.ts` would match `axts`, which is the kind of near-miss nobody reports because the rule still
 * *mostly* applies.
 *
 * Order matters: `**` is consumed before `*`, or the first star of a `**` would be rewritten as the
 * separator-respecting form and the pattern would stop crossing directories.
 */
function globToRegExp(scope: string): RegExp {
  let out = ''
  for (let i = 0; i < scope.length; i += 1) {
    const char = scope[i]
    if (char === '*') {
      if (scope[i + 1] === '*') {
        out += '.*'
        i += 1
        // `**/` should also match zero directories, so `a/**/b.ts` covers `a/b.ts`.
        if (scope[i + 1] === '/') i += 1
        continue
      }
      out += '[^/]*'
      continue
    }
    if (char === '?') {
      out += '[^/]'
      continue
    }
    out += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  // The pattern is BUILT here, not taken from the file: every character of `scope` that is not one
  // of the three wildcards is escaped above, so the only metacharacters in `out` are the `.*`,
  // `[^/]*` and `[^/]` this function emitted. There is no alternation and no nested quantifier, so
  // the catastrophic-backtracking shapes this rule exists to catch cannot be constructed from a
  // `paths:` value.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(`^${out}$`)
}

export interface InstructionTreeBudget {
  /** How deep below each root to descend. */
  readonly maxDepth: number
  /** How many files to load in total. */
  readonly maxFiles: number
  /** Total characters across all blocks. */
  readonly maxChars: number
}

export interface LoadInstructionTreeInput {
  readonly cwd: string
  /** Directories to walk, relative to `cwd` or absolute. Order is the caller's. */
  readonly roots: readonly string[]
  readonly budget: InstructionTreeBudget
  /**
   * Where a skipped file, a refused symlink or an exhausted budget is reported.
   *
   * A channel rather than a throw: none of these should stop a load, and none of them should be
   * silent either. Silence here is how a user's instruction file stops being read without anybody
   * noticing.
   */
  readonly onWarn?: (message: string) => void
  /**
   * Which files to load. Defaults to the conventional two.
   *
   * A list matches basenames exactly; a predicate answers the question a list cannot. A rules
   * DIRECTORY —, `.cursor/rules/`, `.theokit/rules/` — holds files the caller
   * cannot name in advance, because the user chooses the names. With only a list on offer, the
   * closest consumer wrote its own 112-line walk (budget, depth ceiling, cycle guard and all) to
   * ask `entry.endsWith('.md')`. The walk was ours; only the question was theirs.
   */
  readonly fileNames?: readonly string[] | ((entry: string) => boolean)
  /**
   * The order blocks come back in. Defaults to `'outward-in'`.
   *
   * `'outward-in'` reads every file at a level before descending: an instruction TREE means the
   * outer file states the general rule and the inner one refines it, so the composer needs the
   * general one first.
   *
   * `'lexicographic'` is one alphabetical pass, directories interleaved where their names fall. A
   * rules FOLDER means the opposite of a tree: the files are peers, and the contract its users
   * depend on is that the same directory assembles the same prompt on any machine.
   *
   * Both are deterministic. Only one is right per shape, and only the caller knows which shape it
   * is looking at — which is why offering the walk without offering the order left the capability
   * half-built.
   */
  readonly order?: 'outward-in' | 'lexicographic'
}

export interface InstructionTree {
  readonly blocks: readonly InstructionBlock[]
  /** True when a ceiling stopped the walk — the caller is seeing a partial tree. */
  readonly truncated: boolean
  readonly count: number
}

const DEFAULT_FILE_NAMES = ['THEO.md', 'AGENTS.md'] as const

/** Named, so the default is a decision a reader can see rather than an empty pair of braces. */
const IGNORE_WARNING = (): void => undefined

/**
 * Walk `roots` and load the instruction files found, stopping at the declared ceilings.
 *
 * Cycles are broken by INODE, not by path: a symlink loop produces infinitely many distinct paths
 * for the same file, so a path-keyed `seen` set never terminates. The inode is what identifies the
 * file the OS would actually read.
 */
export function loadInstructionTree(input: LoadInstructionTreeInput): InstructionTree {
  const warn = input.onWarn ?? IGNORE_WARNING
  const fileNames = input.fileNames ?? DEFAULT_FILE_NAMES
  // Normalised once, at the edge, so the hot path inside the walk is a single call either way.
  const accepts =
    typeof fileNames === 'function'
      ? fileNames
      : (entry: string): boolean => fileNames.includes(entry)
  const cwd = resolve(input.cwd)

  const blocks: InstructionBlock[] = []
  const seenInodes = new Set<string>()
  let chars = 0

  /**
   * Why the walk RETURNS its stop reason instead of setting a flag.
   *
   * Two earlier shapes both fought the type system rather than the design. `let truncated = false`
   * narrows to the literal `false`, and TypeScript does not track the mutation inside the recursive
   * closure — so every read reads as "always falsy", a correct statement about the types and a wrong
   * one about the program. Moving it onto an object silenced that in the workspace check and came
   * back under the per-file config the pre-commit hook uses, because the inference differs.
   *
   * The third answer stopped arguing: the walk returns whether it was cut short, and the caller
   * threads it. No shared mutable state, so nothing to narrow wrongly — and the recursion now says
   * out loud what it decided instead of leaving a flag behind for someone else to read.
   */

  /** @returns `true` when a ceiling stopped the walk — the caller must stop descending too. */
  const visit = (dir: string, depth: number): boolean => {
    if (depth > input.budget.maxDepth) {
      // Said, not just done. The file ceiling already announced itself and this one returned in
      // silence — and a budget that stops silently is indistinguishable from a directory that had
      // nothing left in it. The reader concludes their instruction file is missing and goes looking
      // for a typo in the filename, when the walk simply refused to descend that far.
      warn(`instruction budget: stopped at depth ${String(input.budget.maxDepth)}: ${dir}`)
      return false
    }

    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return false // unreadable directory — not an error, just nothing to load here
    }

    // Files in THIS directory before any subdirectory.
    //
    // A single alphabetical pass descended into `nested/` before reading the root's own `THEO.md`,
    // because `nested` sorts before `THEO`. That inverts the meaning of an instruction tree: the
    // outer file states the general rule and the inner one refines it, so loading the refinement
    // first hands the composer its blocks in the opposite of the order it needs. Two passes make the
    // outward-in order a property of the walk instead of an accident of file names.
    for (const { entry, path, stats } of walkOrder(dir, entries, input.order ?? 'outward-in')) {
      // Inode identity, not path identity — see the function docblock.
      const inode = `${String(stats.dev)}:${String(stats.ino)}`
      if (seenInodes.has(inode)) continue
      seenInodes.add(inode)

      if (stats.isDirectory()) {
        if (visit(path, depth + 1)) return true
        continue
      }
      if (!accepts(entry)) continue

      try {
        // Cast for the upstream `.d.ts` gap named in usetheokit/theokit-sdk#280 — the symbol is
        // re-exported by the barrel and never declared, so it arrives unresolved. It is real
        // (measured), and this is a security control: hiding the cast would hide the control.
        ;(assertNoSymlinkEscape as (p: string, rootDir: string) => void)(path, cwd)
      } catch {
        // The security control, and the one warning that must never be swallowed: a link out of the
        // tree is an attempt to read a file the project has no business reading.
        warn(`instruction file escapes the project root and was skipped: ${relative(cwd, path)}`)
        continue
      }

      if (blocks.length >= input.budget.maxFiles) {
        warn(`instruction budget: stopped at ${String(input.budget.maxFiles)} files`)
        return true
      }

      const parsed = parseInstructionFile(path, cwd, warn)
      if (parsed === undefined) continue

      if (chars + parsed.content.length > input.budget.maxChars) {
        warn(`instruction budget: stopped at ${String(input.budget.maxChars)} characters`)
        return true
      }
      chars += parsed.content.length
      blocks.push(parsed)
    }
    return false
  }

  let truncated = false
  for (const root of input.roots) {
    truncated = visit(resolve(cwd, root), 0)
    if (truncated) break
  }

  return { blocks, truncated, count: blocks.length }
}

/** One `readdir` entry that survived `stat`. */
interface WalkEntry {
  readonly entry: string
  readonly path: string
  readonly stats: Stats
}

/**
 * Stat every entry and return files first, then directories.
 *
 * Extracted from the walk so it stays readable AND under the complexity ceiling — the two-pass
 * ordering is a separable idea, and inlining it made `visit` do two jobs.
 *
 * An entry that vanishes between `readdir` and `stat` is dropped rather than reported: a concurrent
 * delete is not this loader's problem, and the file is genuinely not there to load.
 */
function walkOrder(
  dir: string,
  entries: readonly string[],
  order: 'outward-in' | 'lexicographic',
): WalkEntry[] {
  const found: WalkEntry[] = []
  for (const entry of [...entries].sort((a, b) => a.localeCompare(b))) {
    const path = join(dir, entry)
    try {
      found.push({ entry, path, stats: statSync(path) })
    } catch {
      continue
    }
  }

  // Alphabetical either way — the difference is only whether directories are held back.
  if (order === 'lexicographic') return found

  return [
    ...found.filter((item) => !item.stats.isDirectory()),
    ...found.filter((item) => item.stats.isDirectory()),
  ]
}

/**
 * Read one file, splitting frontmatter from body.
 *
 * Returns `undefined` — and warns — when the frontmatter OPENS and never closes. That file is
 * malformed in a way that makes its scoping unknowable, and guessing whether the rest is body or
 * metadata would feed either the wrong text or the wrong scope to the model. The rest of the tree
 * loads normally: failure is per file.
 *
 * The fence split itself lives in `frontmatter.ts` — the M76 command loader needs the same answer to
 * the same question, and that is one piece of knowledge, not two similar-looking functions (G12).
 * What stays here is which KEY this loader reads.
 */
function parseInstructionFile(
  path: string,
  cwd: string,
  warn: (message: string) => void,
): InstructionBlock | undefined {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }

  const rel = relative(cwd, path)
  const parsed = splitFrontmatter(raw)
  if (parsed === undefined) {
    warn(`instruction frontmatter never closes, file skipped: ${rel}`)
    return undefined
  }

  return {
    path: rel,
    // Imports expand AFTER the frontmatter split, so an `@ref` inside a frontmatter block is not one
    // — that block is metadata about the file, not content of the prompt.
    content: expandInstructionImports({
      text: parsed.body,
      filePath: path,
      rootDir: cwd,
      onWarn: warn,
    }),
    ...scopeOf(parsed.frontmatter, rel, warn),
  }
}

/** `scopes` plus whether a declared `paths:` produced nothing — the pair a caller needs to fail closed. */
function scopeOf(
  frontmatter: readonly string[],
  rel: string,
  warn: (message: string) => void,
): { scopes: readonly string[]; scopesUnreadable: boolean } {
  const scopes = parsePathsScope(frontmatter)
  const declared = frontmatter.some((line) => /^paths\s*:/.test(line))
  const scopesUnreadable = declared && scopes.length === 0
  if (scopesUnreadable) {
    warn(`instruction declares paths: but no scope could be read from it: ${rel}`)
  }
  return { scopes, scopesUnreadable }
}

/**
 * Extract `paths:` from frontmatter lines.
 *
 * Deliberately not a YAML parser: the only key this loader understands is `paths`, and pulling in a
 * parser to read one list would be a dependency for a feature nobody asked for (rung 4 → rung 1).
 * An unrecognised key is ignored rather than rejected — a product may put its own metadata there.
 */
function parsePathsScope(frontmatter: readonly string[]): string[] {
  const scopes: string[] = []
  let inPaths = false
  for (const line of frontmatter) {
    if (/^paths\s*:/.test(line)) {
      inPaths = true
      const inline = line.slice(line.indexOf(':') + 1).trim()
      if (inline.startsWith('[')) {
        // A list that never closes is not a list.
        //
        // `lastIndexOf(']')` returns -1 when the bracket never arrives, and `slice(1, -1)` then
        // quietly drops the final character: `paths: [unclosed` came back as the scope `unclose`.
        // That is worse than an empty list, because a scope that exists suppresses the
        // unreadable signal — the block looked correctly scoped to a path matching nothing, so the
        // rule stopped applying anywhere and nothing said so.
        const close = inline.lastIndexOf(']')
        if (close === -1) return []
        return inline
          .slice(1, close)
          .split(',')
          .map((item) => item.trim().replaceAll(/^["']|["']$/g, ''))
          .filter((item) => item.length > 0)
      }
      continue
    }
    if (!inPaths) continue
    // Bounded rather than `\\s*-\\s*(.+)`: an unbounded run of whitespace before and after the dash
    // is the shape that backtracks super-linearly on a long line of spaces.
    const item = /^ {0,32}- {0,32}(\S.*)$/.exec(line)
    if (item?.[1] === undefined) break // the list ended — a sibling key follows
    scopes.push(item[1].trim().replaceAll(/^["']|["']$/g, ''))
  }
  return scopes
}
