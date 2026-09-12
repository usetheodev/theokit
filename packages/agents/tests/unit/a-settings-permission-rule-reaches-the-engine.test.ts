import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadSettings } from '../../src/config/settings-file.js'
import { permissionRulesFromSettings } from '../../src/config/settings-permissions.js'

/**
 * A `permissions` block in a settings file reached nobody.
 *
 * The SDK ships a real engine — `PermissionEngine(rules, { defaultAction })`, `PermissionRule`,
 * `PermissionAction` — and it is a CODE surface: you construct it with rules. What was missing was
 * the path from the FILE to those rules. Measured 2026-09-11: `permissions` appears in 13 SDK files
 * and the SDK reads `settings.json` in exactly three, of which two are sourcemaps and the third is a
 * `.d.ts` describing the hooks shape. So an operator writing
 *
 *     { "permissions": { "deny": ["Bash(curl:*)"] } }
 *
 * got a file nothing translated. `cycle-backlog`'s own note on B-025 named this as the key whose
 * "silent absence removes a control the operator believes is in place".
 *
 * ## The property this module is built around
 *
 * Partial fidelity is WORSE than absence here. A `deny` rule that silently fails to match is a
 * control the operator believes is in force, which is strictly more dangerous than no rule at all —
 * they would have written the code themselves. So an entry this translator cannot render faithfully
 * is REPORTED and excluded, never quietly turned into a rule that does not bite.
 *
 * ## Precedence
 *
 * `deny` before `ask` before `allow`, because `PermissionEngine` takes first-match-wins. Emitting
 * them in file order would let an `allow` written above a `deny` win, and an operator reading their
 * own file top to bottom has no reason to expect that.
 */
describe('a permission rule in settings reaches the engine', () => {
  it('translates a bare tool name', () => {
    const { rules } = permissionRulesFromSettings({ deny: ['Bash'] })

    expect(rules).toEqual([{ tool: 'Bash', action: 'deny' }])
  })

  it('puts deny before ask before allow, whatever the file order', () => {
    // First match wins in the engine, so emission order IS precedence. A file listing `allow`
    // first must not let it beat a `deny` for the same tool.
    const { rules } = permissionRulesFromSettings({
      allow: ['Read'],
      ask: ['Write'],
      deny: ['Bash'],
    })

    expect(rules.map((r) => r.action)).toEqual(['deny', 'ask', 'allow'])
  })

  it('translates a prefix specifier into an argument matcher that actually matches', () => {
    // The assertion is on BEHAVIOUR, not shape: a matcher is only worth emitting if it fires.
    const { rules } = permissionRulesFromSettings({ deny: ['Bash(curl:*)'] })

    const rule = rules[0]
    expect(rule?.tool).toBe('Bash')
    const matcher = rule?.args?.command
    expect(matcher).toBeInstanceOf(RegExp)
    expect((matcher as RegExp).test('curl https://evil.test')).toBe(true)
    expect((matcher as RegExp).test('curlington')).toBe(true)
    expect((matcher as RegExp).test('echo hi')).toBe(false)
    // Same anchor, on the prefix form: `Bash(curl:*)` denies commands that START with curl, not any
    // command mentioning it. An unanchored prefix rule over-denies, which is the safe direction and
    // still not what was written.
    expect((matcher as RegExp).test('echo curl'), 'the prefix matcher is unanchored').toBe(false)
  })

  it('anchors an exact specifier so it does not match a longer command', () => {
    // `Bash(ls)` must not deny `ls-everything`. An unanchored translation would over-deny, which is
    // the safe direction but still a rule the operator did not write.
    const { rules } = permissionRulesFromSettings({ deny: ['Bash(ls)'] })

    const matcher = rules[0]?.args?.command as RegExp
    expect(matcher.test('ls')).toBe(true)
    expect(matcher.test('ls-everything')).toBe(false)
    // The START anchor, added after a mutation removing it left every other assertion green. Without
    // it the rule reads as "contains", so `Bash(ls)` would deny `please ls` — a rule the operator
    // did not write, matching calls they did not name.
    expect(matcher.test('please ls'), 'the matcher is unanchored at the start').toBe(false)
  })

  it('REPORTS an entry it cannot render faithfully instead of dropping it', () => {
    // The property the whole module exists for. A `deny` that silently fails to match is a control
    // the operator believes is in force — strictly worse than no rule, because with no rule they
    // would have written it themselves.
    const { rules, unsupported } = permissionRulesFromSettings({
      deny: ['Bash(** weird ** glob)', 'Read'],
    })

    expect(rules, 'the entry it DID understand must still be emitted').toEqual([
      { tool: 'Read', action: 'deny' },
    ])
    expect(unsupported).toHaveLength(1)
    expect(unsupported[0]?.entry).toContain('weird')
    expect(unsupported[0]?.reason, 'the operator is not told why').toBeTruthy()
  })

  it('reports a malformed entry whose specifier does not close cleanly', () => {
    // `Bash(a))` passes the "ends with a paren" check and leaves `a)` as the specifier. Added after a
    // mutation removing the nested-paren guard left every other assertion green — the guard was real
    // and untested, which is the same invisibility as a guard that is absent.
    const { rules, unsupported } = permissionRulesFromSettings({ deny: ['Bash(a))', 'Read'] })

    expect(rules).toEqual([{ tool: 'Read', action: 'deny' }])
    expect(unsupported[0]?.entry).toBe('Bash(a))')
  })

  it('reports an unknown action key rather than guessing what it meant', () => {
    const { rules, unsupported } = permissionRulesFromSettings({
      sometimes: ['Bash'],
    } as any)

    expect(rules).toEqual([])
    expect(unsupported[0]?.entry).toContain('sometimes')
  })

  it('returns nothing for an absent or empty block, and reports nothing', () => {
    // The control. Most projects declare no permissions, and a translator that warned there would be
    // noise in every project — which is how a real report stops being read.
    expect(permissionRulesFromSettings(undefined)).toEqual({ rules: [], unsupported: [] })
    expect(permissionRulesFromSettings({})).toEqual({ rules: [], unsupported: [] })
  })
})

/**
 * The block reaches the translator from a real settings file.
 *
 * A translator with no caller is the defect this whole batch closes, one indirection out. The
 * settings reader types the `permissions` key so `permissionRulesFromSettings` has a source, and the
 * unsupported list travels with it — an operator whose rule was not applied learns it from the same
 * call that read their file, not by finding a second module.
 */
describe('the permissions block travels from the file to the translator', () => {
  it('types `permissions` on the settings it reads, so the two connect', () => {
    const root = mkdtempSync(join(tmpdir(), 'theokit-perm-settings-'))
    mkdirSync(join(root, '.claude'), { recursive: true })
    writeFileSync(
      join(root, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { deny: ['Bash(curl:*)'], allow: ['Read'] } }),
    )

    const { rules, unsupported } = permissionRulesFromSettings(
      loadSettings({ cwd: root }).values.permissions,
    )

    expect(unsupported).toEqual([])
    expect(rules.map((r) => `${String(r.tool)}:${r.action}`)).toEqual(['Bash:deny', 'Read:allow'])
  })
})
