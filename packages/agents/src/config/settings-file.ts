/**
 * Read the settings files the declared layers correspond to.
 *
 * `settings-layers.ts` publishes the precedence stack and opens no file. Measured 2026-09-11 with
 * controls (`loadMcpJson` 5 files, an invented term 0): `settings.local.json` appeared once in this
 * package, as a COMMENT; `outputStyle` appeared zero times in either this package or the SDK's built
 * output. Three parity features were unreachable for one shared reason — nothing read values out of
 * a settings file.
 *
 * ## What this adds, and what it deliberately reuses
 *
 * It opens the three files that correspond to real layers and hands them to {@link LayeredConfig},
 * which already folds, verifies ordering and reports provenance. Re-deriving the fold here would
 * give two answers to "which layer wins" — the defect that module exists to remove.
 *
 * `command-line` and `managed` are absent on purpose. The first is not a file; the second is the
 * operator policy, which `operator-policy.ts` reads from a platform-owned path with its own refusal
 * semantics. Reading it twice, in two vocabularies, is how two answers to one question start.
 *
 * ## Unknown keys survive
 *
 * The brief is the same MECHANISMS, not every configuration, so the schema passes unrecognised keys
 * through untouched. A reader that dropped what it did not recognise would silently discard an
 * operator's configuration — the failure this batch of work is about, committed by the module
 * written to close it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { LayeredConfig } from './layered-config.js'
import type { ConfigLayer, PrecedenceReport } from './layered-config.js'
import { SETTINGS_LAYERS } from './settings-layers.js'

/**
 * The keys this layer can act on today, plus everything else untouched.
 *
 * Typed narrowly on purpose: a key is listed here when something in this package reads it, not
 * because the reference documents it. Declaring a field the code ignores would publish a control
 * that does nothing, which is the shape every item in this batch had.
 */
const SETTINGS_SCHEMA = z.looseObject({
  /** Selects a file under `.claude/output-styles/`. Consumed by `loadOutputStyle`. */
  outputStyle: z.string().optional(),
  /** Environment variables for the session. */
  env: z.record(z.string(), z.string()).optional(),
  /**
   * Tool permissions, as `settings-permissions.ts` translates them into `PermissionRule[]`.
   *
   * Typed here rather than left to the passthrough because the passthrough yields `unknown`, and a
   * consumer would have to cast to reach it — a cast is where a wrong shape stops being checked. The
   * SAFETY of this key depends on the translator seeing what the operator actually wrote.
   */
  permissions: z
    .object({
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      ask: z.array(z.string()).optional(),
    })
    .loose()
    .optional(),
})

export type Settings = z.infer<typeof SETTINGS_SCHEMA>

export interface LoadSettingsInput {
  /** Project root. Its `.claude/settings.json` and `.claude/settings.local.json` are read. */
  readonly cwd: string
  /** Home directory, for the user-level file. Omit to read the project only. */
  readonly homeDir?: string
  /** Where a file that exists and cannot be parsed is reported. */
  readonly onWarn?: (message: string) => void
}

export interface LoadSettingsResult {
  readonly values: Settings
  /** Which layer each resolved key came from. */
  readonly provenancePerKey: Readonly<Record<string, string>>
  /** Which declared layers contributed nothing — a file nobody is reading is named, not hidden. */
  readonly precedenceReport: PrecedenceReport
}

const IGNORE_WARNING = (): void => undefined

/**
 * Which declared layer maps to which file.
 *
 * The order written here is NOT the order used: the chain is sorted by the precedence
 * `SETTINGS_LAYERS` declares, so this list is a mapping and nothing more. Written that way
 * deliberately — with the list already in ascending order, omitting the precedence produced an
 * identical fold, so a mutation removing it turned no test red. It is an equivalent mutation today
 * and would stop being one the moment somebody reorders either list. Sorting makes the declared
 * stack the single thing that decides, so the two cannot drift into disagreeing.
 */
const FILE_LAYERS = [
  { layer: 'user', dir: 'home', file: 'settings.json' },
  { layer: 'project-shared', dir: 'cwd', file: 'settings.json' },
  { layer: 'project-local', dir: 'cwd', file: 'settings.local.json' },
] as const

/**
 * One layer's values, or `{}` when the file is absent or unreadable.
 *
 * An ABSENT file is the ordinary case and is silent — most projects have none. A file that EXISTS
 * and cannot be parsed is a different fact and is reported, because an author who wrote settings and
 * got silence would believe they applied. It does not throw: one stray comma in a user-level file
 * would otherwise break every project on the machine.
 */
function readLayer(path: string, warn: (message: string) => void): Record<string, unknown> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- built from the caller's own project/home root and a fixed filename; no component is untrusted input
  if (!existsSync(path)) return {}
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same path, existence-checked above
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      warn(`${path} is not a JSON object — it is NOT being applied.`)
      return {}
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    warn(`${path} could not be parsed (${(error as Error).message}) — it is NOT being applied.`)
    return {}
  }
}

/**
 * The settings as the declared layers resolve them.
 *
 * Never throws for a missing or malformed file; see {@link readLayer}.
 */
export function loadSettings(input: LoadSettingsInput): LoadSettingsResult {
  const warn = input.onWarn ?? IGNORE_WARNING

  const layers: ConfigLayer[] = FILE_LAYERS.flatMap((entry) => {
    const root = entry.dir === 'home' ? input.homeDir : input.cwd
    if (root === undefined) return []
    const declared = SETTINGS_LAYERS.find((l) => l.layer === entry.layer)
    // Unreachable while `FILE_LAYERS` names only declared layers, and asserted rather than assumed:
    // a layer read with no declared precedence would fold in array order and silently invent a
    // stack. `verifyLayerOrdering` cannot catch that, because the chain would look consistent.
    if (declared === undefined) return []
    return [
      {
        layer: entry.layer,
        precedence: declared.precedence,
        values: readLayer(join(root, '.claude', entry.file), warn),
      },
    ]
  })

  // Sorted by the DECLARED precedence rather than trusting how `FILE_LAYERS` happens to be written.
  // `LayeredConfig.resolve` refuses a chain that is out of order, so an unsorted list would turn a
  // reordering of `SETTINGS_LAYERS` into a thrown error at startup instead of a correct fold.
  const ordered = [...layers].sort((a, b) => (a.precedence ?? 0) - (b.precedence ?? 0))
  const resolved = LayeredConfig.resolve({ layers: ordered, schema: SETTINGS_SCHEMA })
  return {
    values: resolved.value,
    provenancePerKey: resolved.provenancePerKey,
    precedenceReport: resolved.precedenceReport,
  }
}
