/**
 * B-124 — a scaffolded product must not load a repository's `.env` unguarded.
 *
 * A project `.env` is untrusted input. It arrives with the clone, it is read before any trust
 * prompt, and locating the credential store is one of the first things a build does. A raw
 * `process.loadEnvFile()` therefore lets a cloned repository set `THEOKIT_AUTH_HOME=/tmp/attacker`
 * and redirect where credentials are read and written — silently, because nothing fails when it
 * works. The first sign is a credential somewhere it should not be.
 *
 * This is not "a consumer built something the framework lacks". It was the framework handing every
 * new product the unguarded version as its starting point, which is why it is pinned in the
 * scaffolder rather than left to each generated project to get right.
 *
 * The guard is `loadProjectEnv` from `@theokit/sdk`: it applies everything else and refuses the keys
 * that decide WHERE the framework looks.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '../../templates')

/** Every template file, so a new surface cannot reintroduce this in a directory nobody listed. */
function everyTemplateFile(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? everyTemplateFile(full) : [full]
  })
}

describe('B-124 — scaffolded products do not load a project .env unguarded', () => {
  const files = everyTemplateFile(TEMPLATES)

  it('test_no_template_calls_process_loadEnvFile_directly', () => {
    const offenders = files
      .filter((f) => /process\.loadEnvFile\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(TEMPLATES.length + 1))

    expect(
      offenders,
      'a scaffolded product would let a cloned repository move its credential store through .env',
    ).toEqual([])
  })

  it('test_the_tui_template_loads_env_through_the_guarded_loader', () => {
    // Anti-vacuity: deleting the load entirely would satisfy the case above while breaking the
    // feature the template exists to provide — a `.env` with the provider key IS meant to work.
    const main = readFileSync(join(TEMPLATES, 'surfaces/tui/tui/main.tsx.tmpl'), 'utf8')

    // The CALL, not just the import: a file that imports the guard and then loads the env some
    // other way would satisfy a substring check while doing exactly the wrong thing.
    expect(main).toMatch(/^\s*loadProjectEnv\(\)/m)
    expect(main).toMatch(/from '@theokit\/sdk'/)
  })

  it('test_the_sdk_pin_is_new_enough_to_export_the_guard', () => {
    // The template now IMPORTS `loadProjectEnv`. A pin that resolves to an SDK without it produces a
    // generated project that does not build — a worse failure than the one being fixed.
    const pkg = JSON.parse(readFileSync(join(TEMPLATES, 'default/package.json.tmpl'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    const pin = pkg.dependencies['@theokit/sdk'] ?? ''
    // Compared as a (major, minor) TUPLE rather than by a v4-shaped regex, which is what this was.
    // That regex expressed "at least 4.50" as "matches ^4. and the minor is >= 50", and the two stop
    // agreeing the moment the pin crosses a major: B-029 moved it to `^5.0.0` — strictly newer, and
    // strictly more likely to export the guard — and the check read -1 and failed. A version
    // predicate that only works inside one major is a predicate that fails on the upgrade it exists
    // to permit.
    const GUARD_SINCE: readonly [number, number] = [4, 50]
    const parsed = /^\^(\d+)\.(\d+)\./.exec(pin)
    expect(parsed, `\`${pin}\` is not a caret pin this check can read`).not.toBeNull()
    const [major, minor] = [Number(parsed?.[1]), Number(parsed?.[2])]

    expect(
      major > GUARD_SINCE[0] || (major === GUARD_SINCE[0] && minor >= GUARD_SINCE[1]),
      `\`${pin}\` may resolve to an SDK without loadProjectEnv (landed in ${String(GUARD_SINCE[0])}.${String(GUARD_SINCE[1])})`,
    ).toBe(true)
  })
})
