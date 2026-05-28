/* eslint-disable security/detect-non-literal-fs-filename --
 * Build-time tool. Read-only filesystem walks under cwd + node_modules
 * to resolve consumer-side optional deps. Paths are derived from the
 * CLI-controlled cwd and a fixed package name list.
 */
/**
 * `integrateUseTheoUI(cwd, opts)` — auto-chains the Vite plugins needed
 * for `@usetheo/ui` styling when the consumer has the dep declared.
 *
 * Algorithm (D3 + D5 of the plan):
 *   1. opts.enabled === false → return [].
 *   2. detectPackage('@usetheo/ui') — if absent, return [].
 *   3. opts.consumerTailwindConfig or opts.consumerPostcssConfig set →
 *      log info + return []. Consumer-in-control wins (D3).
 *   4. detectPackage('@tailwindcss/vite') — if absent, log warn + return [].
 *   5. Dynamic-import both. Type-check default exports (EC-5). Type-check
 *      return shapes (EC-6). If any guard fails, log + return [].
 *   6. Return [tailwindcssPlugin(), useTheoUIPlugin()].
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Plugin } from 'vite'

import { detectPackage } from './auto-detect.js'

export interface IntegrateUiOptions {
  /** When `false`, disable auto-config regardless of detection. Default: true. */
  enabled?: boolean
  /** Path to the consumer's tailwind.config.* (any extension), if present. D3 deferral. */
  consumerTailwindConfig?: string
  /** Path to the consumer's postcss.config.* (any extension), if present. D3 deferral. */
  consumerPostcssConfig?: string
}

/**
 * Resolve a bare specifier to an absolute file URL by walking up from the
 * consumer's `cwd`, scanning `node_modules` directly. Works for ESM-only
 * packages that don't expose a `require` condition (createRequire fails
 * on those). Reads the resolved package.json's `exports."."` field to
 * find the entry. Returns the file:// URL or null if not resolvable.
 */
function resolveConsumerImport(name: string, cwd: string): string | null {
  let dir = cwd
  for (let i = 0; i < 10; i++) {
    const pkgDir = join(dir, 'node_modules', ...name.split('/'))
    const pkgJsonPath = join(pkgDir, 'package.json')
    if (existsSync(pkgJsonPath)) {
      try {
        const raw = readFileSync(pkgJsonPath, 'utf-8')
        const pkg = JSON.parse(raw) as {
          exports?: { '.'?: { import?: string; default?: string } | string }
          main?: string
          module?: string
        }
        let entry: string | undefined
        const dotExport = pkg.exports?.['.']
        if (typeof dotExport === 'string') entry = dotExport
        else if (dotExport && typeof dotExport === 'object') {
          entry = dotExport.import ?? dotExport.default
        }
        entry ??= pkg.module ?? pkg.main
        if (!entry) return null
        // Strip leading ./ then join.
        const cleaned = entry.replace(/^\.\//, '')
        return pathToFileURL(join(pkgDir, cleaned)).href
      } catch {
        return null
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function isValidPlugin(value: unknown): value is Plugin {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return false
  // Vite Plugin shape: object with a `name: string` field at minimum.
  if (!('name' in value)) return false
  return typeof (value as Record<string, unknown>).name === 'string'
}

/**
 * Normalize a Vite plugin factory return value into a flat Plugin[].
 *
 * Background: Tailwind v3 returned a single Plugin from its factory.
 * Tailwind v4 (`@tailwindcss/vite@4.x`) returns an ARRAY of 3 plugins
 * (`@tailwindcss/vite:scan` + `:generate:serve` + `:generate:build`).
 * The EC-6 single-Plugin guard rejected the v4 array shape and silently
 * skipped chain integration, causing 0 utilities generated in the
 * consumer's CSS. This normalizer accepts both shapes.
 */
function normalizePluginReturn(value: unknown): Plugin[] | null {
  if (Array.isArray(value)) {
    const result: Plugin[] = []
    for (const entry of value) {
      if (!isValidPlugin(entry)) return null
      result.push(entry)
    }
    return result.length > 0 ? result : null
  }
  if (isValidPlugin(value)) return [value]
  return null
}

/** Test-only side-door so EC-6 shape guard can be unit-tested directly. */
export const _isValidPluginForTest = isValidPlugin
/** Test-only side-door for the v3/v4 normalizer. */
export const _normalizePluginReturnForTest = normalizePluginReturn

// eslint-disable-next-line complexity -- canonical auto-config gate (5 detection branches + 2 import guards + 2 shape guards); flattening to micro-helpers would hide the linear contract
export async function integrateUseTheoUI(
  cwd: string,
  opts?: IntegrateUiOptions,
): Promise<Plugin[]> {
  if (opts?.enabled === false) return []

  const uiDetect = detectPackage('@usetheo/ui', cwd)
  if (!uiDetect.installed) return []

  // D3 — consumer's manual config wins
  if (opts?.consumerTailwindConfig || opts?.consumerPostcssConfig) {
    // eslint-disable-next-line no-console -- one-line transparency hint; goal is to surface the override path
    console.info(
      `[theokit] Detected your tailwind.config / postcss.config — skipping auto-config. Extend with \`import preset from '@usetheo/ui/preset'\` to apply UI theme.`,
    )
    return []
  }

  const tailwindDetect = detectPackage('@tailwindcss/vite', cwd)
  if (!tailwindDetect.installed) {
    console.warn(
      `[theokit] @usetheo/ui detected but @tailwindcss/vite is not installed. Run \`pnpm add -D @tailwindcss/vite\` to enable styling.`,
    )
    return []
  }

  // Explicit chain: @tailwindcss/vite FIRST + @usetheo/ui/vite-plugin
  // with `{ tailwind: false }` (avoids double-add of @tailwindcss/vite).
  //
  // Why resolve via filesystem then import by URL: this module runs from
  // theokit's own dist/, so `await import('@tailwindcss/vite')` would
  // try to resolve from theokit's node_modules — where the consumer's
  // optional deps don't exist. Resolving from the consumer's cwd
  // gives the correct path.
  const tailwindUrl = resolveConsumerImport('@tailwindcss/vite', cwd)
  if (!tailwindUrl) {
    console.warn(
      `[theokit] @tailwindcss/vite installed but its package entry was not resolvable from ${cwd}. Skipping auto-config.`,
    )
    return []
  }
  let tailwindMod: { default?: unknown }
  let uiMod: { default?: unknown }
  try {
    tailwindMod = (await import(tailwindUrl)) as { default?: unknown }
  } catch (err) {
    console.warn(
      `[theokit] @tailwindcss/vite dynamic import failed (${(err as Error).message}). Skipping auto-config.`,
    )
    return []
  }
  // For @usetheo/ui/vite-plugin, resolve via package + subpath:
  // node_modules/@usetheo/ui/dist/vite-plugin.js
  const uiPkgInstalled = detectPackage('@usetheo/ui', cwd)
  const uiPkgDir = uiPkgInstalled.resolvedPath
    ? uiPkgInstalled.resolvedPath.replace(/[\\/]package\.json$/, '')
    : null
  const uiPluginPath = uiPkgDir ? join(uiPkgDir, 'dist', 'vite-plugin.js') : null
  if (!uiPluginPath || !existsSync(uiPluginPath)) {
    console.warn(
      `[theokit] @usetheo/ui/vite-plugin entry not found at ${String(uiPluginPath)}. Skipping auto-config.`,
    )
    return []
  }
  try {
    uiMod = (await import(pathToFileURL(uiPluginPath).href)) as { default?: unknown }
  } catch (err) {
    console.warn(
      `[theokit] @usetheo/ui/vite-plugin dynamic import failed (${(err as Error).message}). Skipping auto-config.`,
    )
    return []
  }

  if (typeof tailwindMod.default !== 'function') {
    console.warn(
      `[theokit] @tailwindcss/vite does not expose a default-export function. Skipping auto-config.`,
    )
    return []
  }
  if (typeof uiMod.default !== 'function') {
    console.warn(
      `[theokit] @usetheo/ui/vite-plugin does not expose a default-export function. Skipping auto-config.`,
    )
    return []
  }

  let tailwindPlugin: unknown
  let uiPlugin: unknown
  try {
    tailwindPlugin = (tailwindMod.default as () => unknown)()
  } catch (err) {
    console.warn(`[theokit] @tailwindcss/vite() threw: ${(err as Error).message}`)
    return []
  }
  try {
    // Pass { tailwind: false } so the UI plugin skips its internal
    // @tailwindcss/vite chain (we already added it above).
    uiPlugin = (uiMod.default as (opts?: { tailwind?: boolean }) => unknown)({
      tailwind: false,
    })
  } catch (err) {
    console.warn(`[theokit] @usetheo/ui/vite-plugin() threw: ${(err as Error).message}`)
    return []
  }

  const tailwindPlugins = normalizePluginReturn(tailwindPlugin)
  if (tailwindPlugins === null) {
    console.warn(
      `[theokit] @tailwindcss/vite returned unexpected shape. Skipping auto-config.`,
    )
    return []
  }
  const uiPlugins = normalizePluginReturn(uiPlugin)
  if (uiPlugins === null) {
    console.warn(
      `[theokit] @usetheo/ui/vite-plugin returned unexpected shape. Skipping auto-config.`,
    )
    return []
  }

  return [...tailwindPlugins, ...uiPlugins]
}
