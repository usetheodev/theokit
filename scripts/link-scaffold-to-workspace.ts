/*
   `security/detect-non-literal-fs-filename` used to be disabled here, with the reasoning that every
   path is built from this repository's own root plus a directory the developer typed into
   `pnpm try:scaffold` — no untrusted input, a local harness run from a package.json script.

   The reasoning still holds; the directive does not. `scripts/**` is now in eslint.config.js, which
   turns that rule off for this whole directory, so the file-level disable became provably unused —
   and had never been checked at all, because the directory sat outside the lint config until
   2026-09-11. */
/**
 * Point a scaffolded app at THIS working tree instead of at npm.
 *
 * `pnpm try:scaffold` exists so this repository can try its own scaffold, and it did the opposite
 * (usetheokit/theokit#420): the template pins ranges — correctly, for the people who scaffold from
 * npm — and a caret on a `0.x` version pins the MINOR, so `^0.48.3` means `>=0.48.3 <0.49.0` and
 * excluded the 0.49.0 the repository had already reached. Every local verification run through that
 * script had been measuring the published package.
 *
 * The sharp edge was not that it missed the local build; it is that it missed only SOME of it.
 * `@theokit/agents ^10.1.0` matched the workspace `10.1.0` and linked, so one scaffolded app could
 * pair a local agent runtime with a published framework — a combination that fails in ways neither
 * version exhibits alone, and whose failure reads as a framework bug.
 *
 * This rewrites the app's manifest to the `workspace:` protocol. That is deliberate rather than
 * "bump the template range to match": a range has to be bumped in lockstep with every release, and
 * bump-in-lockstep is precisely the mechanism that failed here. `workspace:*` carries no version to
 * drift, and pnpm honours the protocol explicitly — so the result does not depend on
 * `link-workspace-packages`, whose default the issue could not determine and which no longer
 * matters here.
 *
 * The TEMPLATE is untouched. It is copied verbatim into applications outside this monorepo, where
 * `workspace:*` resolves to nothing; the rewrite belongs to the harness, not to the product.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The subset of a package manifest this rewrite touches. */
export interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

/**
 * Names of the packages this repository builds, read from disk.
 *
 * Discovered rather than listed: a hardcoded pair would be correct today and silently incomplete
 * the first time the default template depends on a third package here.
 *
 * `packages/*` only. `pnpm-workspace.yaml` also declares `my-test` and `examples/*`, which are
 * consumers rather than dependencies, and the `@theokit/sdk` line is consumed from npm by design —
 * rewriting it would make the install fail outright.
 */
export function workspacePackageNames(root: string): string[] {
  const packagesDir = join(root, 'packages')
  const names: string[] = []
  for (const entry of readdirSync(packagesDir)) {
    try {
      const pkg = JSON.parse(readFileSync(join(packagesDir, entry, 'package.json'), 'utf8')) as {
        name?: string
      }
      if (typeof pkg.name === 'string') names.push(pkg.name)
    } catch {
      // Not a package directory. Skipping is right: this function reports what IS here, and a
      // stray folder is not a missing dependency.
    }
  }
  return names
}

/**
 * The manifest with every dependency this repo builds pointed at the workspace.
 *
 * Pure — returns a new object and leaves the input alone, so a caller can diff before writing.
 */
export function linkToWorkspace(manifest: Manifest, workspaceNames: readonly string[]): Manifest {
  const relink = (deps: Record<string, string> | undefined): Record<string, string> | undefined => {
    if (deps === undefined) return undefined
    const out: Record<string, string> = {}
    for (const [name, range] of Object.entries(deps)) {
      out[name] = workspaceNames.includes(name) ? 'workspace:*' : range
    }
    return out
  }

  const linked: Manifest = { ...manifest }
  const deps = relink(manifest.dependencies)
  const devDeps = relink(manifest.devDependencies)
  if (deps !== undefined) linked.dependencies = deps
  if (devDeps !== undefined) linked.devDependencies = devDeps
  return linked
}

function main(appDir: string): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const manifestPath = join(resolve(root, appDir), 'package.json')

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  const names = workspacePackageNames(root)
  const linked = linkToWorkspace(manifest, names)

  const relinked = Object.entries(linked.dependencies ?? {})
    .filter(([name]) => names.includes(name))
    .map(([name]) => name)

  writeFileSync(manifestPath, `${JSON.stringify(linked, null, 2)}\n`, 'utf8')
  console.warn(
    `[try:scaffold] ${manifestPath} now resolves ${relinked.length} package(s) from this working ` +
      `tree: ${relinked.join(', ')}\n` +
      `[try:scaffold] The install that follows will add this scratch app to pnpm-lock.yaml, which ` +
      `IS tracked while the app is not. Do not commit that hunk — a lockfile naming a project a ` +
      `fresh clone does not have fails --frozen-lockfile in CI. \`pnpm try:clean\` removes it.`,
  )
}

// Run only when invoked directly, so importing the two functions above costs nothing.
if (import.meta.url === `file://${resolve(process.argv[1])}`) {
  if (process.argv.length < 3) {
    console.error('usage: link-scaffold-to-workspace <app-dir>')
    process.exit(2)
  }
  main(process.argv[2])
}
