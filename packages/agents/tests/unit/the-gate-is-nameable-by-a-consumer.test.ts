import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * theokit#686 — a public function whose parameter or error type does not cross the barrel is only
 * half delivered. A consumer can call it and cannot name what it takes, nor catch what it throws.
 *
 * This is the FOURTH instance of the same shape, and the first three were each found by installing
 * the published package rather than by reading the source — because the source is correct every
 * time: the type IS exported from its own module, and only the barrel omits it.
 *
 *   #663  AgentModule           parameter of `streamAgentTurnInProcess`
 *   #668  transcriptOf          the migration path for a renamed map
 *   #675  RegistryOutcome       the union `registryOutcome` is typed as
 *   #686  HookApprovalGate      what `HookApprovalCapability` takes, and the error it throws
 *
 * Reading the BUILT declaration is the point. `export type` inside a module satisfies the compiler,
 * the unit tests, and the reviewer; only the emitted barrel says what a consumer can reach.
 */

const DIST = join(import.meta.dirname, '..', '..', 'dist', 'index.d.ts')

/** Names a consumer must be able to import from `@theokit/agents` to use the hook gate at all. */
const THE_GATE_NEEDS = [
  'HookApprovalCapability', // build the capability
  'HookApprovalGate', // type the object it takes
  'HookApprovalRequest', // type the callback's argument
  'HookGateUnsupportedError', // catch the refusal by class rather than by message
  // #686, second half — a consumer that narrows a foreign root needs to name the surfaces and the
  // shape `resolveCompatSources` returns. The list grows with every public type, which is the point:
  // adding one here is the cheapest moment to notice the barrel does not carry it.
  'CompatSurface',
  'ResolvedCompatSource',
  // B-004 — the refusal raised when the installed SDK cannot read a narrowed `import`. Added after
  // a review found it shipped WITHOUT crossing the barrel, while the class it was written to mirror
  // (`HookGateUnsupportedError`, four lines up) did. A consumer meeting a brand-new refusal could
  // only match its message string — which is the fifth time this shape has been caught here, and
  // exactly what the note above predicts.
  'CompatImportUnsupportedError',
] as const

describe('the hook gate is nameable by a consumer (theokit#686)', () => {
  it('test_every_name_the_gate_needs_is_in_the_built_barrel', () => {
    // Skipped rather than failed when there is no build: a unit run before `pnpm build` would
    // otherwise report a packaging defect that does not exist.
    if (!existsSync(DIST)) {
      expect(existsSync(DIST), 'run `pnpm build` first — this reads the emitted surface').toBe(
        false,
      )
      return
    }
    // EVERY export statement, not the last one. The first version of this check sliced from
    // `lastIndexOf('export {')` and reported three names as withheld while they sat in an earlier
    // block — the probe answering confidently about the wrong region, which is the same mistake the
    // four issues above are made of, committed inside the guard written to catch it.
    const emitted = readFileSync(DIST, 'utf8')
    const exported = new Set(
      [...emitted.matchAll(/export\s*\{([^}]*)\}/g)]
        .flatMap((m) => m[1].split(','))
        .map(
          (part) =>
            part
              .trim()
              .split(/\s+as\s+/)
              .pop()
              ?.trim() ?? '',
        ),
    )
    const missing = THE_GATE_NEEDS.filter((name) => !exported.has(name))
    expect(missing, 'exported from their module but withheld from the barrel').toEqual([])
  })
})
