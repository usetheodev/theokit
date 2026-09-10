/**
 * B-003 — the store said "Deny by default, always" and nothing asked it anything.
 *
 * These tests assert on the DECISION the tool path receives, never on `isGranted` alone: a test that
 * only checked the store would have passed before this gate existed and proved nothing about
 * enforcement, which is the defect the item is about.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  grantGate,
  type GrantGateContext,
  type NotGoverned,
} from '../../src/auth/permission-gate.js'
import { PermissionStore } from '../../src/auth/permission-store.js'

/** A store rooted in a throwaway home — no test touches `~`. */
function fixture(now?: () => number): { store: PermissionStore; scope: string } {
  const home = mkdtempSync(join(tmpdir(), 'permission-gate-'))
  const scope = join(home, 'repo')
  mkdirSync(scope)
  return { store: new PermissionStore(now === undefined ? { home } : { home, now }), scope }
}

function ctx(name: string, command: string): GrantGateContext {
  return { name, args: { command }, agentId: 'a', runId: 'r' }
}

describe('grantGate', () => {
  it('test_a_tool_with_no_grant_is_refused_before_its_handler', async () => {
    // The whole item in one assertion: the decision is a veto, and `pre_tool_call` runs BEFORE the
    // tool by construction, so a refusal here is a refusal before the side effect.
    const { store, scope } = fixture()
    const gate = grantGate(store, (c) => ({
      governed: true,
      query: { tool: c.name, scope, command: String(c.args.command) },
    }))

    await expect(gate(ctx('run_shell', 'npm test'))).resolves.toMatchObject({ block: true })
  })

  it('test_a_granted_tool_is_not_vetoed', async () => {
    const { store, scope } = fixture()
    store.grant({ tool: 'run_shell', scope, command: 'npm test' })
    const gate = grantGate(store, (c) => ({
      governed: true,
      query: { tool: c.name, scope, command: String(c.args.command) },
    }))

    await expect(gate(ctx('run_shell', 'npm test'))).resolves.toBeUndefined()
  })

  it('test_a_revoked_grant_refuses_the_tool', async () => {
    // Grant then revoke: the operator's revocation must change the DECISION, which is precisely what
    // it did not do before this gate existed.
    const { store, scope } = fixture()
    const query = { tool: 'run_shell', scope, command: 'npm test' }
    store.grant(query)
    store.revoke(query)
    const gate = grantGate(store, (c) => ({
      governed: true,
      query: { tool: c.name, scope, command: String(c.args.command) },
    }))

    await expect(gate(ctx('run_shell', 'npm test'))).resolves.toMatchObject({ block: true })
  })

  it('test_a_gate_that_governs_no_tool_vetoes_nothing', async () => {
    // EC-2 — what NFR-001 actually asserts. Without this, "zero change when nothing is gated" rests
    // on the export being additive rather than on the handler's behaviour.
    const { store } = fixture()
    const gate = grantGate(store, () => ({ governed: false as const }))

    await expect(gate(ctx('run_shell', 'rm -rf /'))).resolves.toBeUndefined()
    await expect(gate(ctx('anything', 'at all'))).resolves.toBeUndefined()
  })

  it('test_a_governed_true_classification_is_checked_not_waved_through', async () => {
    // The fail-open this shape exists to prevent, and the test whose absence let it ship. The first
    // version discriminated on whether the `governed` KEY was present, so a consumer writing a
    // policy record `{ governed: true, scope }` and spreading it — the most natural reading of "yes,
    // govern this" — got `undefined` back and an ungranted command ran. Measured against the built
    // artifact before the fix. TypeScript did not stop it: a fresh literal with an excess property
    // errors, the same object through a variable or a spread does not.
    const { store, scope } = fixture()
    const policy = { governed: true as const, scope }
    const gate = grantGate(store, (c) => ({
      ...policy,
      query: { tool: c.name, scope: policy.scope, command: String(c.args.command) },
    }))

    await expect(
      gate(ctx('run_shell', 'a destructive command')),
      'governed: true must mean CHECK IT, never "let it through"',
    ).resolves.toMatchObject({ block: true })
  })

  it('test_a_governed_undefined_classification_is_not_waved_through', async () => {
    // The mutation an `eslint --fix` performs, pinned. The rule wants `!classification.governed`;
    // `!undefined` is `true`, so that form waves through a JS consumer whose classifier returns
    // `{ governed: undefined }` — and a sixth review round proved the whole suite stayed green
    // under exactly that rewrite. The suppression comment sat directly above the line it warned
    // against, which is what a comment is worth when nothing measures it.
    //
    // `undefined` reads as governed, `query` is then undefined, `isGranted` throws, the catch
    // denies. Fail-closed by construction rather than by intent.
    const { store } = fixture()
    const gate = grantGate(store, () => ({ governed: undefined }) as unknown as NotGoverned)

    await expect(
      gate(ctx('run_shell', 'a destructive command')),
      'a classifier that says nothing must not be read as saying "not governed"',
    ).resolves.toMatchObject({ block: true })
  })

  it('test_a_non_object_classification_denies_instead_of_ending_the_turn', async () => {
    // R2's other half. `runPreToolCallHooks` has no catch, so a TypeError escaping this handler ends
    // the turn — the exact outcome the deny-on-throw path exists to prevent, reachable from a JS
    // consumer or any `as` cast returning null.
    const { store } = fixture()
    const gate = grantGate(store, () => null as unknown as ReturnType<() => never>)

    await expect(gate(ctx('run_shell', 'npm test'))).resolves.toMatchObject({ block: true })
  })

  it('test_a_classifier_that_throws_denies_rather_than_ending_the_turn', async () => {
    // R2 — a classifier that cannot decide must not pass. Denying is the only safe reading, and
    // throwing would end the turn over a decision the consumer's own code failed to make.
    const { store, scope } = fixture()
    store.grant({ tool: 'run_shell', scope, command: 'npm test' })
    const gate = grantGate(store, () => {
      throw new Error('classifier blew up')
    })

    const decision = await gate(ctx('run_shell', 'npm test'))
    expect(decision).toMatchObject({ block: true })
    expect(
      (decision as { message: string }).message,
      'the operator must be able to tell a classifier bug from a missing grant',
    ).toContain('classifier blew up')
  })

  it('test_an_unresolvable_scope_denies_and_does_not_end_the_turn', async () => {
    // EC-3 — the store already decides this (`permission-store.ts:116`, "Deny, do not throw"). The
    // gate must not undo it by letting a throw escape from somewhere else.
    const { store } = fixture()
    const gate = grantGate(store, (c) => ({
      governed: true,
      query: {
        tool: c.name,
        scope: '/definitely/not/a/real/directory/anywhere',
        command: String(c.args.command),
      },
    }))

    await expect(gate(ctx('run_shell', 'npm test'))).resolves.toMatchObject({ block: true })
  })

  it('test_a_grant_expiring_exactly_now_is_expired', async () => {
    // EC-4 — the store pins `<=` at `:125`. Pinning it at the gate too is where the two would
    // otherwise drift: a boundary decided in one layer and re-derived in another.
    let clock = 1_000_000
    const { store, scope } = fixture(() => clock)
    store.grant({ tool: 'run_shell', scope, command: 'npm test' }, { ttlMs: 60_000 })
    const gate = grantGate(store, (c) => ({
      governed: true,
      query: { tool: c.name, scope, command: String(c.args.command) },
    }))

    clock = 1_059_999
    await expect(gate(ctx('run_shell', 'npm test'))).resolves.toBeUndefined()
    clock = 1_060_000
    await expect(gate(ctx('run_shell', 'npm test'))).resolves.toMatchObject({ block: true })
  })

  it('test_a_corrupt_store_denies_and_says_why', async () => {
    // R3 — `lastReadError` exists so an operator learns their grants stopped applying. It only helps
    // if something surfaces it, and the veto message is the one place the operator is looking.
    const home = mkdtempSync(join(tmpdir(), 'permission-gate-'))
    const scope = join(home, 'repo')
    mkdirSync(scope)
    mkdirSync(join(home, '.theokit'))
    writeFileSync(join(home, '.theokit', 'tool-permissions.json'), '{"grants":[', 'utf8')
    const store = new PermissionStore({ home })
    const gate = grantGate(store, (c) => ({
      governed: true,
      query: { tool: c.name, scope, command: String(c.args.command) },
    }))

    const decision = await gate(ctx('run_shell', 'npm test'))
    expect(decision).toMatchObject({ block: true })
    expect(
      (decision as { message: string }).message,
      'a corrupt store reading as empty is indistinguishable from being empty',
    ).toMatch(/could not be read|unreadable/i)
  })
})
