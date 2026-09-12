/**
 * Translate a settings `permissions` block into rules the SDK's engine evaluates.
 *
 * The SDK ships `PermissionEngine(rules, { defaultAction })` and it is a CODE surface: you construct
 * it with `PermissionRule[]`. What was missing was the path from the FILE to those rules. Measured
 * 2026-09-11: `permissions` appears in 13 SDK files, and the SDK reads `settings.json` in three, of
 * which two are sourcemaps and the third describes the hooks shape. An operator writing
 * `{ "permissions": { "deny": ["Bash(curl:*)"] } }` got a file nothing translated.
 *
 * ## Partial fidelity would be worse than absence
 *
 * A `deny` that silently fails to match is a control the operator believes is in force — strictly
 * more dangerous than no rule, because without one they would have written the guard themselves. So
 * every entry this module cannot render faithfully is RETURNED as unsupported, with a reason, and
 * excluded from the rules. Nothing is quietly turned into a matcher that does not bite.
 *
 * ## What it deliberately does not attempt
 *
 * The reference's specifier language is larger than this: path globs with `~` expansion, per-tool
 * argument names, and matching semantics that differ by tool. Implementing a lookalike would produce
 * rules that match *almost* the right calls, which is the failure above. Two forms are translated —
 * a bare tool name, and `Tool(prefix:*)` / `Tool(exact)` — and everything else is reported.
 */
import type { PermissionAction, PermissionRule } from '@theokit/sdk'

/** An entry that was understood well enough to refuse, but not well enough to translate. */
export interface UnsupportedPermissionEntry {
  /** The entry as written, so the operator can find it in their file. */
  readonly entry: string
  /** Why it was not translated. */
  readonly reason: string
}

export interface PermissionTranslation {
  readonly rules: readonly PermissionRule[]
  readonly unsupported: readonly UnsupportedPermissionEntry[]
}

/** The `permissions` block as a settings file may carry it. */
export interface PermissionsBlock {
  readonly allow?: readonly string[]
  readonly deny?: readonly string[]
  readonly ask?: readonly string[]
}

/**
 * Emission order, and therefore precedence.
 *
 * `PermissionEngine` is first-match-wins, so the order rules are emitted in IS the precedence.
 * Deny first: an operator whose file lists `allow` above `deny` reads their own file top to bottom
 * and has no reason to expect the `allow` to win. Following file order would make the safest
 * intention the easiest to defeat by accident.
 */
const ACTIONS: readonly PermissionAction[] = ['deny', 'ask', 'allow']

/** Longest a tool name may be. No tool is named in more; longer is reported, never matched. */
const MAX_TOOL = 64
/** Longest a specifier may be, for the same reason. */
const MAX_SPEC = 512

/**
 * Split `Tool` or `Tool(specifier)` without a regular expression.
 *
 * This was one combined pattern, and `security/detect-unsafe-regex` kept flagging it even after both
 * parts were length-bounded — `safe-regex` is conservative about bounded repetition. The input comes
 * out of a `.claude/settings.json`, which arrives with the clone, so suppressing a ReDoS warning on a
 * file somebody else wrote was the wrong half of the trade. String operations answer the same
 * question, cannot backtrack at all, and read more plainly than the pattern they replace.
 */
function splitEntry(entry: string): { tool: string; spec?: string } | undefined {
  const open = entry.indexOf('(')
  if (open === -1) return isToolName(entry) ? { tool: entry } : undefined
  if (!entry.endsWith(')')) return undefined
  const tool = entry.slice(0, open)
  const spec = entry.slice(open + 1, -1)
  if (!isToolName(tool) || spec.length > MAX_SPEC || spec.includes(')')) return undefined
  return { tool, spec }
}

/** A tool name: a letter or underscore, then word characters or hyphens. */
function isToolName(value: string): boolean {
  // Length first, so the pattern only ever sees a bounded string. Spreading the value to check it
  // character by character was the first attempt and is wrong for a different reason than ReDoS:
  // `[...value]` splits surrogate pairs, so a name with an astral character would be judged on its
  // halves. One anchored pattern over a bounded input has neither problem.
  if (value.length === 0 || value.length > MAX_TOOL) return false
  return /^[A-Za-z_][\w-]*$/.test(value)
}

/** Characters that mean something in the reference's specifier language and nothing here. */
const UNTRANSLATABLE = /[*?[\]{}~]/

/** Escape a literal for use inside a RegExp. */
function escapeRegExp(literal: string): string {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

/**
 * One entry as a rule, or the reason it could not be one.
 *
 * The argument is matched on `command` because that is the field the SDK's own docblock uses in its
 * worked example (`{ tool: "shell", args: { command: /rm\s+-rf/ } }`). A specifier for a tool whose
 * argument is named something else would therefore not match — which is exactly why anything beyond
 * the two plain forms is reported rather than translated.
 */
function translate(
  entry: string,
  action: PermissionAction,
): PermissionRule | UnsupportedPermissionEntry {
  const parsed = splitEntry(entry.trim())
  if (parsed === undefined) {
    return { entry, reason: 'not of the form `Tool` or `Tool(specifier)`.' }
  }

  const { tool, spec } = parsed
  if (spec === undefined) return { tool, action }
  if (spec.length === 0) {
    return { entry, reason: 'has an empty specifier — write `Tool` if you meant the whole tool.' }
  }

  // A trailing `:*` is the reference's prefix form and is the one wildcard shape translated here.
  const prefix = spec.endsWith(':*') ? spec.slice(0, -2) : undefined
  const literal = prefix ?? spec
  if (UNTRANSLATABLE.test(literal)) {
    return {
      entry,
      reason:
        'uses glob or path syntax this runtime does not translate. It is NOT being applied — a ' +
        'rule that matched almost the right calls would be worse than none, because you would ' +
        'believe a control is in force. Express it in code with `PermissionRule` instead.',
    }
  }

  return {
    tool,
    // Anchored at the start either way: unanchored, `Bash(ls)` would also deny `please ls`. The
    // prefix form stays open at the end, which is what `:*` means; the exact form closes with `$`
    // so `Bash(ls)` does not deny `ls-everything`.
    args: {
      // Built from the operator's own specifier, and escaped before it gets here so no metacharacter
      // of theirs survives into the pattern. `splitEntry` has already bounded its length, so the compiled
      // pattern is linear in a value this module controls the size of.
      // eslint-disable-next-line security/detect-non-literal-regexp -- the literal is escaped by `escapeRegExp` and length-bounded by `splitEntry`; the whole point of the module is to turn operator text into a matcher
      command: new RegExp(`^${escapeRegExp(literal)}${prefix === undefined ? '$' : ''}`),
    },
    action,
  }
}

function isRule(value: PermissionRule | UnsupportedPermissionEntry): value is PermissionRule {
  return 'tool' in value
}

/**
 * The rules a `permissions` block means, and the entries that could not be rendered.
 *
 * An absent or empty block yields nothing and reports nothing: most projects declare no permissions,
 * and a translator that warned there would be noise in every one of them.
 */
export function permissionRulesFromSettings(
  block: PermissionsBlock | undefined,
): PermissionTranslation {
  if (block === undefined) return { rules: [], unsupported: [] }

  const rules: PermissionRule[] = []
  const unsupported: UnsupportedPermissionEntry[] = []

  // Unknown keys are reported rather than ignored: a block declaring `sometimes: [...]` is an
  // operator expressing an intention, and silence would let them believe it was applied.
  for (const key of Object.keys(block)) {
    if (!ACTIONS.includes(key as PermissionAction)) {
      unsupported.push({
        entry: key,
        reason: `is not a permission action. Expected one of: ${ACTIONS.join(', ')}.`,
      })
    }
  }

  for (const action of ACTIONS) {
    for (const entry of block[action] ?? []) {
      const translated = translate(entry, action)
      if (isRule(translated)) rules.push(translated)
      else unsupported.push(translated)
    }
  }

  return { rules, unsupported }
}
