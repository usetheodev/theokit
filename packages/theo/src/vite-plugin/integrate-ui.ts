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

function isValidPlugin(value: unknown): value is Plugin {
  if (value === null || typeof value !== 'object') return false
  // Vite Plugin shape: object with a `name: string` field at minimum.
  if (!('name' in value)) return false
  return typeof (value as Record<string, unknown>).name === 'string'
}

/** Test-only side-door so EC-6 shape guard can be unit-tested directly. */
export const _isValidPluginForTest = isValidPlugin

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

  // Dynamic-import via a string variable — these are CONSUMER-side optional
  // deps, not TheoKit's. The variable indirection skips TS module resolution
  // at compile time; the runtime import works when the consumer has them.
  const tailwindSpecifier = '@tailwindcss/vite'
  const uiSpecifier = '@usetheo/ui/vite-plugin'
  let tailwindMod: { default?: unknown }
  let uiMod: { default?: unknown }
  try {
    tailwindMod = (await import(tailwindSpecifier)) as { default?: unknown }
  } catch {
    console.warn(
      `[theokit] @tailwindcss/vite import failed despite being declared — skipping auto-config.`,
    )
    return []
  }
  try {
    uiMod = (await import(uiSpecifier)) as { default?: unknown }
  } catch {
    console.warn(
      `[theokit] @usetheo/ui/vite-plugin import failed (perhaps not yet shipped in your installed version) — skipping auto-config.`,
    )
    return []
  }

  // EC-5 — default-export validation
  if (typeof tailwindMod.default !== 'function') {
    console.warn(
      `[theokit] @tailwindcss/vite does not expose a default-export function. Got: ${typeof tailwindMod.default}. Skipping auto-config.`,
    )
    return []
  }
  if (typeof uiMod.default !== 'function') {
    console.warn(
      `[theokit] @usetheo/ui/vite-plugin does not expose a default-export function. Expected: \`export default function (opts) => Plugin\`. Got: ${typeof uiMod.default}. Skipping auto-config.`,
    )
    return []
  }

  // Invoke + EC-6 return-shape validation
  let tailwindPlugin: unknown
  let uiPlugin: unknown
  try {
    tailwindPlugin = (tailwindMod.default as () => unknown)()
  } catch (err) {
    console.warn(`[theokit] @tailwindcss/vite() threw: ${(err as Error).message}`)
    return []
  }
  try {
    uiPlugin = (uiMod.default as () => unknown)()
  } catch (err) {
    console.warn(`[theokit] @usetheo/ui/vite-plugin() threw: ${(err as Error).message}`)
    return []
  }

  if (!isValidPlugin(tailwindPlugin)) {
    console.warn(
      `[theokit] @tailwindcss/vite returned unexpected shape (expected single Plugin object with .name). Skipping auto-config.`,
    )
    return []
  }
  if (!isValidPlugin(uiPlugin)) {
    console.warn(
      `[theokit] @usetheo/ui/vite-plugin returned unexpected shape (expected single Plugin object with .name). Skipping auto-config.`,
    )
    return []
  }

  return [tailwindPlugin, uiPlugin]
}
