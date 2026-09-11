import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadOutputStyle, OutputStyleError } from '../../src/config/output-styles.js'

/**
 * A configured output style was read by nobody.
 *
 * Measured for B-022 against the parity reference: it loads `<cwd>/.claude/output-styles/*.md` and
 * `~/.claude/output-styles/*.md` with the project root winning, and honours the `outputStyle` key of
 * a `settings.json`. This layer read none of it —
 * a grep for `output-style`, `outputStyle` and `output_style` over every package source tree
 * returned **0 files** against a
 * control of **26** for `skills`, and the same query over the SDK's built output returned **0**
 * against a control of **22** for `SKILL.md`.
 *
 * The failure is the silent kind. An author writes a style, selects it, sees responses come back in
 * the ordinary voice, and has no way to tell "my style is wrong" from "nothing reads styles". The
 * DoD is written around exactly that: apply it, or refuse with a typed error that NAMES what could
 * not be read.
 *
 * ## What a style is here
 *
 * A markdown file whose body becomes a section of the system prompt. Its frontmatter carries
 * `description` and `keep-coding-instructions`; the second is the one with teeth, because a style
 * REPLACES the built-in task instructions by default, and a consumer who did not know that would
 * silently lose them.
 *
 * This module resolves and reads. Composing the section into the prompt is `composeInstructions`,
 * which already owns the budget and the drop report — a style that pushed the prompt over the
 * ceiling must be reported through the same path as every other source, not through a second one
 * invented here.
 */
function projectWith(
  files: Record<string, string>,
  home?: Record<string, string>,
): {
  cwd: string
  homeDir: string
} {
  const root = mkdtempSync(join(tmpdir(), 'theokit-output-style-'))
  const cwd = join(root, 'project')
  const homeDir = join(root, 'home')
  for (const [where, contents] of [
    [join(cwd, '.claude', 'output-styles'), files],
    [join(homeDir, '.claude', 'output-styles'), home ?? {}],
  ] as const) {
    mkdirSync(where, { recursive: true })
    for (const [name, body] of Object.entries(contents)) {
      writeFileSync(join(where, name), body)
    }
  }
  return { cwd, homeDir }
}

describe('a configured output style is applied', () => {
  it('reads the named style from the project directory', () => {
    const { cwd, homeDir } = projectWith({
      'teaching.md': '---\ndescription: explains reasoning\n---\n\nAdd a "Why this approach" note.',
    })

    const style = loadOutputStyle({ name: 'teaching', cwd, homeDir })

    expect(style?.name).toBe('teaching')
    expect(style?.content).toContain('Why this approach')
    expect(style?.description).toBe('explains reasoning')
  })

  it('lets the project win over the user directory, as the reference does', () => {
    const { cwd, homeDir } = projectWith(
      { 'review.md': '---\n---\nPROJECT VERSION' },
      { 'review.md': '---\n---\nUSER VERSION' },
    )

    expect(loadOutputStyle({ name: 'review', cwd, homeDir })?.content).toContain('PROJECT VERSION')
  })

  it('falls back to the user directory when the project has no such style', () => {
    const { cwd, homeDir } = projectWith({}, { 'personal.md': '---\n---\nUSER ONLY' })

    expect(loadOutputStyle({ name: 'personal', cwd, homeDir })?.content).toContain('USER ONLY')
  })

  it('reports keep-coding-instructions, because the default REPLACES the task instructions', () => {
    // The field with teeth. A consumer who does not know a style replaces the built-in coding
    // instructions loses them silently; carrying the flag is what lets the caller decide.
    const { cwd, homeDir } = projectWith({
      'additive.md': '---\nkeep-coding-instructions: true\n---\nExtra guidance.',
      'replacing.md': '---\n---\nReplaces everything.',
    })

    expect(loadOutputStyle({ name: 'additive', cwd, homeDir })?.keepCodingInstructions).toBe(true)
    expect(loadOutputStyle({ name: 'replacing', cwd, homeDir })?.keepCodingInstructions).toBe(false)
  })

  it('refuses a style that does not exist, naming where it looked', () => {
    // The DoD's second branch. Returning `undefined` would be indistinguishable from the state this
    // item exists to fix: a style configured, nothing applied, and no way to tell which.
    const { cwd, homeDir } = projectWith({ 'other.md': '---\n---\nx' })

    let thrown: unknown
    try {
      loadOutputStyle({ name: 'missing', cwd, homeDir })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(OutputStyleError)
    expect(String(thrown)).toContain('missing')
    expect(String(thrown), 'the refusal does not say where it looked').toContain('output-styles')
  })

  it('returns undefined when no style was requested', () => {
    // The control. A loader that threw on absence would make "I did not configure a style" an error,
    // which is the ordinary case.
    const { cwd, homeDir } = projectWith({})

    expect(loadOutputStyle({ name: undefined, cwd, homeDir })).toBeUndefined()
  })
})

/**
 * The simplest style anybody writes: a body and no frontmatter.
 *
 * This case was not in the first draft of this file, and `tsc` found it rather than a test —
 * `splitFrontmatter` returns `undefined` for a file with no `---` fence, and vitest never saw the
 * problem because esbuild strips types. A loader that treated that as a parse failure would refuse
 * the minimal style while accepting every more elaborate one.
 */
describe('a style with no frontmatter is still a style', () => {
  it('takes the whole file as the body and every key at its default', () => {
    const { cwd, homeDir } = projectWith({ 'plain.md': 'Just the instructions, no fence.' })

    const style = loadOutputStyle({ name: 'plain', cwd, homeDir })

    expect(style?.content).toBe('Just the instructions, no fence.')
    expect(style?.description).toBeUndefined()
    expect(
      style?.keepCodingInstructions,
      'the default REPLACES the coding instructions, so absence must not read as true',
    ).toBe(false)
  })
})
