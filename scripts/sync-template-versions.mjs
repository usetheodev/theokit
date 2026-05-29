#!/usr/bin/env node
/**
 * sync-template-versions.mjs — single source of truth for template version pins.
 *
 * Reads workspace versions (packages/theo/package.json:version + pnpm-lock.yaml)
 * and propagates to packages/create-theo/templates/<...>/package.json.tmpl.
 *
 * Modes:
 *   (default) --check   exit 1 if drift found; 0 otherwise. Use in CI.
 *   --write             rewrite templates to match truth.
 *
 * Algorithm (per ADR 0019):
 *   1. Read source of truth from workspace (theokit version + lockfile for sdk/ui).
 *   2. Walk templates 2 levels deep (covers services/agent-node, services/agent-python — EC-2 fix).
 *   3. For each template, scan dependencies + devDependencies for managed deps.
 *   4. Ignore deps with `workspace:*` (EC-3) or absent (EC-4).
 *   5. In write mode, replace mismatches; in check mode, report and exit 1.
 *
 * Edge cases:
 *   EC-2: walk recursivo 2 níveis cobre services/agent-{node,python}.
 *   EC-3: `workspace:*` é intentional dentro do monorepo; ignorado.
 *   EC-4: dep ausente do template (api-only sem @usetheo/ui) → ignora; não force-add.
 *   EC-8: JSON.stringify normaliza indent (2 spaces). Primeira execução pode produzir
 *         grande diff cosmético — aceitar como commit "style:" separado.
 *   Lockfile ausente → erro claro pedindo `pnpm install`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATES_DIR = join(ROOT, 'packages', 'create-theo', 'templates')
const THEO_PKG_PATH = join(ROOT, 'packages', 'theo', 'package.json')
const LOCKFILE_PATH = join(ROOT, 'pnpm-lock.yaml')

const MANAGED_DEPS = ['theokit', '@usetheo/sdk', '@usetheo/ui']

/**
 * Resolve workspace version of theokit from packages/theo/package.json.
 */
function resolveTheokitVersion() {
  if (!existsSync(THEO_PKG_PATH)) {
    throw new Error(`Could not find ${THEO_PKG_PATH}. Are you in the theokit/ repo?`)
  }
  const pkg = JSON.parse(readFileSync(THEO_PKG_PATH, 'utf-8'))
  if (!pkg.version) throw new Error('packages/theo/package.json missing "version"')
  return pkg.version
}

/**
 * Resolve a dep version. Strategy:
 *  1. Look in pnpm-lock.yaml `packages` (v9 format: '<name>@<version>(...)').
 *  2. If not found and SIBLING_FALLBACKS has an entry, read sibling package.json directly.
 *
 * Why fallback: workspace-linked deps (../theokit-sdk/packages/sdk in our workspace)
 * appear in `importers` as `link:../../...`, NOT in `packages`. So we can't read
 * a published version from the lockfile — we read the sibling repo's package.json.
 */
const SIBLING_FALLBACKS = {
  '@usetheo/sdk': join(ROOT, '..', 'theokit-sdk', 'packages', 'sdk', 'package.json'),
  '@usetheo/gateway': join(ROOT, '..', 'theokit-sdk', 'packages', 'gateway', 'package.json'),
  '@usetheo/ui': join(ROOT, '..', 'theo-ui', 'package.json'),
}

/**
 * Prefer SIBLING_FALLBACKS over lockfile resolution.
 * Workspace truth wins — lockfile may have stale npm-resolved version.
 */
function resolveFromSiblingFirst(name) {
  const fallback = SIBLING_FALLBACKS[name]
  if (fallback && existsSync(fallback)) {
    const siblingPkg = JSON.parse(readFileSync(fallback, 'utf-8'))
    if (siblingPkg.version) return siblingPkg.version
  }
  return null
}

function resolveFromLock(name, lockfile) {
  const packages = lockfile?.packages ?? {}
  for (const key of Object.keys(packages)) {
    // v9 format: '<name>@<version>(...optional peer suffix)'
    // Strip optional leading slash (v7/v8 compat).
    const stripped = key.startsWith('/') ? key.slice(1) : key
    // Find LAST @ before any '(' — scope @ is first char so use lastIndexOf bounded.
    const cutoff = stripped.indexOf('(')
    const head = cutoff >= 0 ? stripped.slice(0, cutoff) : stripped
    const atIdx = head.lastIndexOf('@')
    if (atIdx <= 0) continue
    const pkgName = head.slice(0, atIdx)
    const version = head.slice(atIdx + 1).trim()
    if (pkgName === name) return version
  }

  // Fallback: workspace-linked siblings — read sibling repo's package.json.
  const fallback = SIBLING_FALLBACKS[name]
  if (fallback && existsSync(fallback)) {
    const siblingPkg = JSON.parse(readFileSync(fallback, 'utf-8'))
    if (siblingPkg.version) return siblingPkg.version
  }

  throw new Error(
    `Could not resolve ${name} from pnpm-lock.yaml or sibling fallback — run \`pnpm install\` first?`,
  )
}

/**
 * EC-2 fix: walk templates dir up to 2 levels deep, returning paths to
 * `package.json.tmpl` files. Covers `services/agent-{node,python}/`.
 */
function findTemplatePackages(dir, depth = 0, maxDepth = 2) {
  if (depth > maxDepth) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const childDir = join(dir, entry.name)
    const tplPath = join(childDir, 'package.json.tmpl')
    if (existsSync(tplPath)) {
      out.push(tplPath)
    } else {
      // Recurse one level deeper to find nested templates like services/agent-node/.
      out.push(...findTemplatePackages(childDir, depth + 1, maxDepth))
    }
  }
  return out
}

/**
 * Build truth map from workspace.
 */
function buildTruth() {
  const theokitVersion = resolveTheokitVersion()
  let truth = { theokit: `^${theokitVersion}` }

  if (!existsSync(LOCKFILE_PATH)) {
    // Without lockfile, we can only sync theokit (workspace-local). Warn and continue.
    console.warn(
      `[sync-templates] WARN: pnpm-lock.yaml not found — syncing only \`theokit\` (workspace truth). Run \`pnpm install\` to enable full sync.`,
    )
    return truth
  }

  const lockfile = parseYaml(readFileSync(LOCKFILE_PATH, 'utf-8'))

  for (const name of ['@usetheo/sdk', '@usetheo/ui']) {
    // Workspace truth (sibling package.json) wins over lockfile (npm-resolved).
    const siblingVersion = resolveFromSiblingFirst(name)
    if (siblingVersion) {
      truth[name] = `^${siblingVersion}`
      continue
    }
    try {
      truth[name] = `^${resolveFromLock(name, lockfile)}`
    } catch (err) {
      console.warn(`[sync-templates] WARN: ${err.message}`)
    }
  }

  return truth
}

/**
 * Main entry — collect drift, optionally write, exit appropriately.
 */
export function syncTemplates({ mode = 'check', templatesDir = TEMPLATES_DIR, truth } = {}) {
  truth ??= buildTruth()
  const templatePaths = findTemplatePackages(templatesDir)

  const drifted = []
  let written = 0

  for (const tplPath of templatePaths) {
    const tpl = JSON.parse(readFileSync(tplPath, 'utf-8'))
    let changed = false
    for (const dep of MANAGED_DEPS) {
      const expected = truth[dep]
      if (!expected) continue // truth couldn't resolve this dep (e.g. lockfile missing)
      for (const bucket of ['dependencies', 'devDependencies']) {
        const current = tpl[bucket]?.[dep]
        if (current === undefined) continue // EC-4: not declared → don't force-add
        if (typeof current === 'string' && current.startsWith('workspace:')) continue // EC-3
        if (current !== expected) {
          drifted.push({ tpl: tplPath, bucket, dep, current, expected })
          if (mode === 'write') {
            tpl[bucket][dep] = expected
            changed = true
          }
        }
      }
    }
    if (mode === 'write' && changed) {
      writeFileSync(tplPath, JSON.stringify(tpl, null, 2) + '\n')
      written += 1
    }
  }

  return { drifted, written, total: templatePaths.length }
}

// CLI entry — only run when invoked directly (not when imported by tests).
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const mode = process.argv.includes('--write') ? 'write' : 'check'
  try {
    const result = syncTemplates({ mode })
    if (result.drifted.length > 0) {
      console.error(`Drift detected in ${result.drifted.length} entries:`)
      for (const d of result.drifted) {
        const rel = d.tpl.replace(ROOT + '/', '')
        console.error(`  ${rel} [${d.bucket}.${d.dep}]: ${d.current} → ${d.expected}`)
      }
      if (mode === 'check') {
        console.error('\nRun `pnpm sync:templates` to fix.')
        process.exit(1)
      }
    }
    console.log(
      mode === 'write'
        ? `Synced ${result.written} template(s) (${result.drifted.length} drift entries across ${result.total} templates).`
        : `OK — ${result.total} template(s) scanned, no drift.`,
    )
  } catch (err) {
    console.error(`[sync-templates] FATAL: ${err.message}`)
    process.exit(2)
  }
}
