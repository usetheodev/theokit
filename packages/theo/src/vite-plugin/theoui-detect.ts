/**
 * T2.1 — Detect `@usetheo/ui` presence in the user's project.
 *
 * Uses `require.resolve` with explicit `paths` instead of `existsSync` so
 * pnpm-hoist layouts (TheoUI at workspace root, app in `apps/<x>/`) still
 * detect correctly. Returns `{ enabled: false }` on any failure — never throws.
 */

/* eslint-disable security/detect-non-literal-fs-filename --
 * Reads `package.json` of `@usetheo/ui` resolved via `require.resolve`
 * from the user's project. Path comes from a controlled require resolution,
 * not HTTP input. Build-time tool.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const localRequire = createRequire(import.meta.url)

export type TheoUiTheme = 'violet-forge' | 'noir' | 'paper'
export type TheoUiFonts = 'bundled' | 'cdn'

export interface TheoUiConfig {
  theme: TheoUiTheme
  fonts: TheoUiFonts
}

export interface TheoUiDetectResult {
  enabled: boolean
  config: TheoUiConfig
}

/**
 * Raw user config shape (from theo.config.ts > ui field).
 * `false` = opt-out (force disabled); object = explicit config; undefined = default.
 */
export type RawTheoUiConfig = false | undefined | { theme?: TheoUiTheme; fonts?: TheoUiFonts }

/**
 * Resolve the TheoUI config with defaults applied.
 * `false` → returns disabled defaults (caller checks `enabled`).
 */
export function resolveTheoUiConfig(
  raw: { theme?: TheoUiTheme; fonts?: TheoUiFonts } | undefined,
): TheoUiConfig {
  return {
    theme: raw?.theme ?? 'violet-forge',
    fonts: raw?.fonts ?? 'bundled',
  }
}

/**
 * Detect whether `@usetheo/ui` is installed under `projectRoot` (or any
 * parent dir via Node module resolution — handles pnpm hoist).
 *
 * EC-1: uses `require.resolve` with `paths: [projectRoot]` not `existsSync`.
 * EC-5: corrupted installs (dir without an importable entry) fall through to disabled.
 * EC-9: theme validation happens in the Zod schema, not here.
 *
 * Note: we resolve a known subpath (`./styles.css`) instead of `./package.json`
 * or the root specifier because (a) `@usetheo/ui` declares `exports` with no
 * CJS entry, so `require.resolve('@usetheo/ui')` fails inside CJS contexts,
 * and (b) `./package.json` is not listed in `exports`. The `styles.css`
 * subpath IS exported and is exactly what entry-client imports — if it
 * resolves, the package is installed and usable.
 */
/** Resolver fn — abstracted so tests can stub Node's walk-up behavior. */
export type SubpathResolver = (specifier: string, projectRoot: string) => boolean

const defaultResolver: SubpathResolver = (specifier, projectRoot) => {
  try {
    localRequire.resolve(specifier, { paths: [projectRoot] })
    return true
  } catch {
    return false
  }
}

/** Reads `<projectRoot>/package.json` and returns whether `@usetheo/ui`
 *  is declared as a (dev)dependency. Conservative gate: pnpm hoist still
 *  works because pnpm rewrites the consumer's package.json to include the
 *  declared dep, even when the install lives at the workspace root. */
function isDeclaredInPackageJson(projectRoot: string): boolean {
  try {
    const raw = readFileSync(join(projectRoot, 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    // `||` is intentional — any truthy version string (including '0.0.0')
    // counts as a declaration. `??` would let '' fall through, but version
    // strings are never empty.
    return Boolean(
      pkg.dependencies?.['@usetheo/ui'] ??
      pkg.devDependencies?.['@usetheo/ui'] ??
      pkg.peerDependencies?.['@usetheo/ui'],
    )
  } catch {
    return false
  }
}

export function detectTheoUi(
  projectRoot: string,
  rawConfig: RawTheoUiConfig,
  resolver: SubpathResolver = defaultResolver,
): TheoUiDetectResult {
  const config = resolveTheoUiConfig(typeof rawConfig === 'object' ? rawConfig : undefined)

  // Explicit opt-out wins over detection
  if (rawConfig === false) {
    return { enabled: false, config }
  }

  // **Conservative gate** — require the dep to be DECLARED in the user's
  // package.json. Stops the monorepo workspace from being detected as
  // having TheoUI inside fixtures that never asked for it (and would
  // 500 on the import).
  if (!isDeclaredInPackageJson(projectRoot)) {
    return { enabled: false, config }
  }

  // EC-1 + EC-5: prefer a subpath that's guaranteed to be in `exports`.
  // Try several known subpaths; success on any one means the package is usable.
  const probes = ['@usetheo/ui/styles.css', '@usetheo/ui/fonts.css']
  for (const probe of probes) {
    if (resolver(probe, projectRoot)) {
      return { enabled: true, config }
    }
  }
  return { enabled: false, config }
}
