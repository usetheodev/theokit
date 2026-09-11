/**
 * B-022 — `.claude/output-styles/*.md`, the section of the system prompt an author writes.
 *
 * Measured against the parity reference: it loads `<cwd>/.claude/output-styles/` and
 * `~/.claude/output-styles/` with the project winning, and honours the `outputStyle` key of a
 * `settings.json`. This layer read none of it — a grep for `output-style`, `outputStyle` and
 * `output_style` over every package source tree returned 0 files, against a control of 26 for
 * `skills`.
 *
 * The failure is the silent kind that this whole backlog is about. An author writes a style, selects
 * it, gets ordinary responses back, and cannot tell "my style is wrong" from "nothing reads styles".
 *
 * ## What this module owns, and what it does not
 *
 * It RESOLVES a style by name and READS it. Composing the text into the prompt belongs to
 * `composeInstructions`, which already carries the character budget and the drop report — a style
 * that pushes the prompt past the ceiling has to be reported through the same path as every other
 * source. Inventing a second report here would give the same failure two vocabularies.
 *
 * ## Why an absent style THROWS
 *
 * Returning `undefined` for "you asked for `teaching` and there is no `teaching.md`" would reproduce
 * the exact state this item exists to remove: something configured, nothing applied, no way to tell
 * which. An absent REQUEST is different and returns `undefined` — not configuring a style is the
 * ordinary case, not an error.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TheokitAgentError } from '@theokit/sdk/errors'

import { splitFrontmatter, frontmatterValue } from './frontmatter.js'

/** Where styles live, under a project root or a home directory. */
const OUTPUT_STYLES_DIR = join('.claude', 'output-styles')

/**
 * A style was named and could not be read.
 *
 * Typed, and carrying the directories it searched, because the whole point of the refusal is that
 * the author learns WHICH lookup failed. `error-handling.md` § 2: fail fast, fail clear.
 */
export class OutputStyleError extends TheokitAgentError {
  override readonly name = 'OutputStyleError'

  constructor(message: string) {
    // Not retryable: a style file that is absent on this call is absent on the next one. Retrying
    // re-asks a question whose answer cannot have changed, and the repository's error taxonomy makes
    // that judgement explicit rather than leaving it to `isTransientError` to guess.
    super(`[@theokit/agents] ${message}`, {
      code: 'output_style_not_found',
      isRetryable: false,
    })
  }
}

export interface OutputStyle {
  /** The filename without `.md` — what `outputStyle` in settings refers to. */
  readonly name: string
  /** The body, which becomes a section of the system prompt. */
  readonly content: string
  /** The `description` frontmatter key, when present. */
  readonly description?: string
  /**
   * `keep-coding-instructions: true` in frontmatter.
   *
   * The field with teeth. A style REPLACES the built-in software-engineering instructions by
   * default, so a consumer who does not know that loses them without being told. Carried here so
   * the decision belongs to the caller rather than to whoever wrote the style file.
   */
  readonly keepCodingInstructions: boolean
}

export interface LoadOutputStyleInput {
  /** The style to load, from `settings.json`'s `outputStyle`. `undefined` means none was asked for. */
  readonly name: string | undefined
  /** Project root. Its `.claude/output-styles/` wins over the home directory's. */
  readonly cwd: string
  /** Home directory, for styles that apply across every project. Omit to search the project only. */
  readonly homeDir?: string
}

/**
 * The named style, or `undefined` when none was requested.
 *
 * @throws OutputStyleError when a style IS named and no file backs it, listing the directories that
 * were searched.
 */
export function loadOutputStyle(input: LoadOutputStyleInput): OutputStyle | undefined {
  if (input.name === undefined) return undefined

  // Project first: the reference resolves the project root ahead of the home directory, and the
  // order is the precedence. Searched rather than merged — a style is one document, and two files
  // with one name are a choice, not a composition.
  const searched = [
    join(input.cwd, OUTPUT_STYLES_DIR),
    ...(input.homeDir === undefined ? [] : [join(input.homeDir, OUTPUT_STYLES_DIR)]),
  ]

  for (const dir of searched) {
    const path = join(dir, `${input.name}.md`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is built from the caller's own project/home root and a fixed convention; the basename is the style NAME from settings, which is why it is validated below rather than interpolated blindly
    if (!existsSync(path)) continue
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same path, existence-checked on the line above
    const raw = readFileSync(path, 'utf8')
    // `undefined` means the file carries NO frontmatter, which is a legitimate style — a body with
    // no keys is the simplest one somebody can write. Treating it as a parse failure would refuse
    // the minimal case, so the whole file becomes the body and every key takes its default.
    const parsed = splitFrontmatter(raw)
    const body = parsed === undefined ? raw : parsed.body
    const description =
      parsed === undefined ? undefined : frontmatterValue(parsed.frontmatter, 'description')
    return {
      name: input.name,
      content: body.trim(),
      ...(description === undefined ? {} : { description }),
      keepCodingInstructions:
        parsed !== undefined &&
        frontmatterValue(parsed.frontmatter, 'keep-coding-instructions') === 'true',
    }
  }

  throw new OutputStyleError(
    `output style "${input.name}" is configured and no file backs it. Looked for ` +
      `${input.name}.md in: ${searched.join(', ')}. A style that cannot be read is not applied, ` +
      `and a silent fallback would be indistinguishable from a style that had no effect.`,
  )
}
