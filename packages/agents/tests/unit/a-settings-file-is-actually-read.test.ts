import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveOutputStyle } from '../../src/config/output-styles.js'
import { loadSettings } from '../../src/config/settings-file.js'

/**
 * The settings layers were declared and no file was ever opened.
 *
 * `settings-layers.ts` publishes the precedence stack — `user` 10, `project-shared` 20,
 * `project-local` 30, `command-line` 40, `managed` 50 — and that is ALL it does. Measured
 * 2026-09-11 across both repositories, with `loadMcpJson` (5 files) and an invented term (0) as
 * controls:
 *
 * | probe | @theokit/agents | @theokit/sdk dist |
 * |---|---|---|
 * | `settings.local.json` | 1 — a COMMENT on line 51 | 0 |
 * | `outputStyle` | 0 | 0 |
 * | `permissions` | 0 | 13 (the SDK's own) |
 * | `settings.json` | 5 — none of them reading VALUES | 3, of which 2 are sourcemaps |
 *
 * So three of the features this parity work is measured against were unreachable for one shared
 * reason: nothing read values out of a settings file. `settings.local.json` had a precedence and no
 * reader; `outputStyle` had a loader — shipped in this same batch — with no caller and no source for
 * its `name`; the session `env` had neither.
 *
 * ## Why this module is small
 *
 * `LayeredConfig` already folds layers, verifies their order, and reports provenance per key. Adding
 * a second fold here would give two answers to "which layer wins", which is the defect that module
 * exists to remove. What was missing was the part nobody had written: opening the three files that
 * correspond to the declared layers.
 *
 * ## What it does NOT do
 *
 * It does not enumerate the reference's settings keys. The brief is the same MECHANISMS, not every
 * configuration — so the schema passes unknown keys through untouched, and only the keys this layer
 * can actually act on are typed. A reader that dropped what it did not recognise would silently
 * discard an operator's configuration, which is the failure this whole batch is about.
 */
function projectWith(files: { user?: unknown; shared?: unknown; local?: unknown }): {
  cwd: string
  homeDir: string
} {
  const root = mkdtempSync(join(tmpdir(), 'theokit-settings-'))
  const cwd = join(root, 'project')
  const homeDir = join(root, 'home')
  mkdirSync(join(cwd, '.claude'), { recursive: true })
  mkdirSync(join(homeDir, '.claude'), { recursive: true })
  if (files.user !== undefined)
    writeFileSync(join(homeDir, '.claude', 'settings.json'), JSON.stringify(files.user))
  if (files.shared !== undefined)
    writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify(files.shared))
  if (files.local !== undefined)
    writeFileSync(join(cwd, '.claude', 'settings.local.json'), JSON.stringify(files.local))
  return { cwd, homeDir }
}

describe('a settings file is actually read', () => {
  it('reads `outputStyle`, which had a loader and no source', () => {
    const { cwd, homeDir } = projectWith({ shared: { outputStyle: 'teaching' } })

    expect(loadSettings({ cwd, homeDir }).values.outputStyle).toBe('teaching')
  })

  it('reads `env`, so a project can set session variables', () => {
    const { cwd, homeDir } = projectWith({ shared: { env: { API_BASE: 'https://x.test' } } })

    expect(loadSettings({ cwd, homeDir }).values.env).toEqual({ API_BASE: 'https://x.test' })
  })

  it('opens settings.local.json, which had a precedence and no reader', () => {
    // The layer was declared at precedence 30 and nothing ever opened the file. A stack that
    // positions a file nobody reads is a stack that lies about what overrides what.
    const { cwd, homeDir } = projectWith({ local: { outputStyle: 'personal' } })

    expect(loadSettings({ cwd, homeDir }).values.outputStyle).toBe('personal')
  })

  it('honours the DECLARED precedence: local beats shared beats user', () => {
    // The whole point of the stack. Asserting all three at once because the bug this guards against
    // is an ordering one, and a pair cannot show an ordering.
    const { cwd, homeDir } = projectWith({
      user: { outputStyle: 'from-user', model: 'user-model' },
      shared: { outputStyle: 'from-shared' },
      local: { outputStyle: 'from-local' },
    })

    const settings = loadSettings({ cwd, homeDir })

    expect(settings.values.outputStyle).toBe('from-local')
    // And a key only the lowest layer set still survives — folding is not replacement.
    expect(settings.values.model).toBe('user-model')
  })

  it('passes through a key it does not know, instead of dropping it', () => {
    // The brief is the same MECHANISMS, not every configuration. A reader that discarded what it
    // did not recognise would silently throw away an operator's config — the failure this batch is
    // about, committed by the module written to fix it.
    const { cwd, homeDir } = projectWith({ shared: { somethingTheFormatAdvertises: 42 } })

    expect(loadSettings({ cwd, homeDir }).values.somethingTheFormatAdvertises).toBe(42)
  })

  it('says which layers contributed nothing', () => {
    // `declaredButSilent` is how "a config file nobody is reading" stops being invisible. Here the
    // absence is legitimate — the files do not exist — and naming it is still the point.
    const { cwd, homeDir } = projectWith({ shared: { outputStyle: 'x' } })

    const report = loadSettings({ cwd, homeDir }).precedenceReport

    expect(report.measured).toContain('project-shared')
    expect(report.declaredButSilent).toContain('user')
    expect(report.declaredButSilent).toContain('project-local')
  })

  it('returns empty values when no settings file exists at all', () => {
    // The control. Most projects have none, and a reader that failed without one would make the
    // feature a prerequisite for running.
    const root = mkdtempSync(join(tmpdir(), 'theokit-settings-none-'))

    expect(loadSettings({ cwd: root, homeDir: root }).values).toEqual({})
  })

  it('reports a malformed file instead of failing the run or swallowing it', () => {
    // A file that EXISTS and cannot be parsed is a different fact from one that is absent. Silence
    // would leave an author believing their settings applied; throwing would make one stray comma
    // in a user-level file break every project on the machine.
    const warnings: string[] = []
    const { cwd, homeDir } = projectWith({ shared: { outputStyle: 'kept' } })
    writeFileSync(join(cwd, '.claude', 'settings.local.json'), '{ not json')

    const settings = loadSettings({ cwd, homeDir, onWarn: (w) => warnings.push(w) })

    expect(settings.values.outputStyle, 'one bad file discarded the good ones').toBe('kept')
    expect(warnings.join('\n')).toMatch(/settings\.local\.json/)
  })
})

/**
 * The documented path works end to end: name a style in settings, get the style.
 *
 * `loadSettings` reads the key and `loadOutputStyle` reads the file, and until this existed nothing
 * joined them — a consumer had to find both modules and know that one feeds the other. Two halves of
 * one mechanism, each individually correct and jointly unreachable, is the same defect as a
 * capability with no caller; it just takes two files to make.
 */
describe('a style named in settings is the style that loads', () => {
  it('resolves the configured style from the project settings', () => {
    const { cwd, homeDir } = projectWith({ shared: { outputStyle: 'teaching' } })
    mkdirSync(join(cwd, '.claude', 'output-styles'), { recursive: true })
    writeFileSync(
      join(cwd, '.claude', 'output-styles', 'teaching.md'),
      '---\ndescription: d\n---\nAdd a "Why this approach" note.',
    )

    expect(resolveOutputStyle({ cwd, homeDir })?.content).toContain('Why this approach')
  })

  it('returns undefined when settings name no style', () => {
    // The control. Not configuring a style is the ordinary case, not an error.
    const { cwd, homeDir } = projectWith({ shared: {} })

    expect(resolveOutputStyle({ cwd, homeDir })).toBeUndefined()
  })

  it('still REFUSES a named style with no file, rather than returning undefined', () => {
    // The composition must not soften the loader's refusal. Returning `undefined` here would put
    // back exactly the silence B-022 removed: configured, not applied, no way to tell which.
    const { cwd, homeDir } = projectWith({ shared: { outputStyle: 'missing' } })

    expect(() => resolveOutputStyle({ cwd, homeDir })).toThrow(/missing/)
  })
})
