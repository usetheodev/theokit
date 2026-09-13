/**
 * Regression guard — the default template's EXTERNAL dep pins (`@theokit/sdk`, `@usetheo/ui`) must stay
 * compatible with what the pinned `theokit` / `@theokit/ui` require.
 * only tracks WORKSPACE packages (theokit / @theokit/agents / create-theokit), so these npm-external pins
 * have NO auto-sync and silently drifted:
 *  - `@theokit/sdk` was left at a stale `^2.25.0` while `theokit@0.43.0` peers `@theokit/sdk ^4.0.1` — every
 *    scaffolded surface (web/tui/desktop) then installed an incompatible SDK 2.x.
 *  - `@usetheo/ui` was `^0.14.0` while `@theokit/ui@1.x` peers `@usetheo/ui >=0.22.0` — a peer conflict.
 * This test is their guard: a future `theokit` major that moves the SDK line must bump this pin too.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const TEMPLATE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../templates/default/package.json.tmpl',
)
const parsed = JSON.parse(readFileSync(TEMPLATE, 'utf8')) as {
  dependencies: Record<string, string>
}
const deps = parsed.dependencies

describe('default template external dep pins (regression guard)', () => {
  it('test_sdk_pin_on_v5_line (the line that carries the .claude parity surfaces)', () => {
    // Caret prefix on the v5 line — a stale `^2.25.0` / `^3.x` / `^4.x` would install an SDK the
    // framework rejects.
    //
    // Was the v4 line until B-029. Not a threshold somebody chose to raise: `CompatSurface`, the
    // `.claude/rules` discovery spec, `settings.local.json` and `CLAUDE_PROJECT_DIR` are all absent
    // from 4.x and present from 5.0.0, measured by unpacking the tarballs. A scaffold pinning 4.x
    // handed every new project an SDK with none of the parity this framework advertises, and
    // nothing said so — which is the worst instance of that defect, because it reaches everyone who
    // starts a project rather than only those who read a range.
    expect(deps['@theokit/sdk']).toMatch(/^\^5\./)
  })

  it('test_usetheo_ui_satisfies_theokit_ui_peer (>=0.22.0)', () => {
    // @theokit/ui@1.x peers @usetheo/ui `>=0.22.0 <1`; a stale `^0.14.0` breaks the peer.
    const pin = deps['@usetheo/ui'] ?? ''
    const match = /^\^0\.(\d+)\./.exec(pin)
    expect(match, `@usetheo/ui pin '${pin}' must be a ^0.22+ caret`).not.toBeNull()
    const minor = match === null ? 0 : Number(match[1])
    expect(minor).toBeGreaterThanOrEqual(22)
  })
})
