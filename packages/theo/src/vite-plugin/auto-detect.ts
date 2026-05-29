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
import { dirname, join } from 'node:path'

import type { DetectResult } from './auto-detect-types.js'

/**
 * D13 invariant (ADR 0021): @usetheo/ui is ESM-only by design.
 * NÃO usar `createRequire(...).resolve()` — `ERR_PACKAGE_PATH_NOT_EXPORTED`
 * em runtime para packages que declaram `type:"module"` sem `require` condition.
 * Tudo filesystem walk direto.
 */

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

/**
 * D13: filesystem walk pra encontrar package.json (substitui require.resolve).
 * Walks node_modules up to 10 levels (handles pnpm hoist + workspace symlinks).
 */
function resolvePackageJson(name: string, cwd: string): { path: string; version?: string } | null {
  let dir = cwd
  for (let depth = 0; depth < 10; depth++) {
    const pkgJsonPath = join(dir, 'node_modules', ...name.split('/'), 'package.json')
    if (existsSync(pkgJsonPath)) {
      try {
        const raw = readFileSync(pkgJsonPath, 'utf-8')
        const pkg = JSON.parse(raw) as { name?: string; version?: string }
        // Validate package name matches (defesa contra colisão path)
        if (pkg.name === name) {
          return { path: pkgJsonPath, version: pkg.version }
        }
      } catch {
        // continue walking
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * D13: fallback probe via filesystem (substitui require.resolve).
 * Tenta common entry paths em node_modules. Retorna path do entry achado.
 */
function fallbackProbe(
  name: string,
  cwd: string,
): { resolvedEntry: string } | null {
  const candidates = ['index.mjs', 'dist/index.mjs', 'dist/index.js', 'index.js']
  let dir = cwd
  for (let depth = 0; depth < 10; depth++) {
    const pkgDir = join(dir, 'node_modules', ...name.split('/'))
    for (const candidate of candidates) {
      const entry = join(pkgDir, candidate)
      if (existsSync(entry)) return { resolvedEntry: entry }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
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

  // Filesystem fallback: ESM-only packages (no `require` condition) can't
  // be resolved by createRequire. Check node_modules directly. The walk
  // upward handles pnpm hoist + workspace symlinks.
  let dir = cwd
  for (let i = 0; i < 10; i++) {
    const nmPath = join(dir, 'node_modules', ...name.split('/'))
    const nmPkgJson = join(nmPath, 'package.json')
    if (existsSync(nmPkgJson)) {
      try {
        const raw = readFileSync(nmPkgJson, 'utf-8')
        const pkg = JSON.parse(raw) as { name?: string; version?: string }
        if (pkg.name === name) {
          return { installed: true, version: pkg.version, resolvedPath: nmPkgJson }
        }
      } catch {
        /* fall through to entry probe */
      }
      return { installed: true }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  // Last-resort fallback — exports doesn't include ./package.json. Walk up from
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
