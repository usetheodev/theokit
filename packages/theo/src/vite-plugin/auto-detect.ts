/* eslint-disable security/detect-non-literal-fs-filename --
 * Reads <projectRoot>/package.json + resolves the target package's own
 * package.json. Paths come from controlled CLI/config inputs; this is a
 * build-time tool, no HTTP.
 */
/**
 * `detectPackage(name, cwd)` — generalized form of `theoui-detect.ts`.
 *
 * Used by T3.2 `integrateUseTheoUI` to gate auto-config on whether the
 * consumer has `@usetheo/ui` AND `@tailwindcss/vite` installed.
 *
 * Algorithm (same as `theoui-detect.ts` but parameterized):
 *   1. Read `<cwd>/package.json`. Check `dependencies` / `devDependencies` /
 *      `peerDependencies` for the package name.
 *   2. If declared, probe `require.resolve('<name>/package.json', { paths: [cwd] })`.
 *      Read the resolved package.json to capture `version`.
 *   3. If resolution fails, fall back to probing common entrypoints (so
 *      packages whose `exports` doesn't include `./package.json` still
 *      detect).
 *
 * NEVER throws. Returns `{installed: false}` on any failure.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { DetectResult } from './auto-detect-types.js'

const localRequire = createRequire(import.meta.url)

function isDeclared(name: string, projectRoot: string): boolean {
  try {
    const raw = readFileSync(join(projectRoot, 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    return Boolean(
      pkg.dependencies?.[name] ??
        pkg.devDependencies?.[name] ??
        pkg.peerDependencies?.[name],
    )
  } catch {
    return false
  }
}

function resolvePackageJson(name: string, cwd: string): { path: string; version?: string } | null {
  try {
    const resolved = localRequire.resolve(`${name}/package.json`, { paths: [cwd] })
    const raw = readFileSync(resolved, 'utf-8')
    const pkg = JSON.parse(raw) as { version?: string }
    return { path: resolved, version: pkg.version }
  } catch {
    return null
  }
}

function fallbackProbe(
  name: string,
  cwd: string,
): { resolvedEntry: string } | null {
  // Try common subpaths in order. Returning the resolved entry path lets
  // the caller walk up to find the package's package.json even when its
  // `exports` field doesn't include `./package.json`.
  const candidates = [name, `${name}/index.mjs`, `${name}/dist/index.mjs`, `${name}/dist/index.js`]
  for (const spec of candidates) {
    try {
      const resolved = localRequire.resolve(spec, { paths: [cwd] })
      return { resolvedEntry: resolved }
    } catch {
      // continue
    }
  }
  return null
}

/** Walk up from a resolved entry path until we hit the package's own package.json
 *  whose `name` field matches `expectedName`. Returns null on any failure. */
function findOwningPackageJson(entry: string, expectedName: string): { path: string; version?: string } | null {
  let dir = dirname(entry)
  // Bound the walk to ~10 levels to avoid pathological cases.
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, 'utf-8')
        const pkg = JSON.parse(raw) as { name?: string; version?: string }
        if (pkg.name === expectedName) {
          return { path: candidate, version: pkg.version }
        }
      } catch {
        // ignore + continue walking
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function detectPackage(name: string, cwd: string): DetectResult {
  if (!isDeclared(name, cwd)) {
    return { installed: false }
  }

  const pkgJson = resolvePackageJson(name, cwd)
  if (pkgJson) {
    return {
      installed: true,
      version: pkgJson.version,
      resolvedPath: pkgJson.path,
    }
  }

  // Fallback path — exports doesn't include ./package.json. Walk up from
  // the resolved entry to find the package's own package.json.
  const probe = fallbackProbe(name, cwd)
  if (probe) {
    const owning = findOwningPackageJson(probe.resolvedEntry, name)
    if (owning) {
      return { installed: true, version: owning.version, resolvedPath: owning.path }
    }
    return { installed: true }
  }

  return { installed: false }
}
