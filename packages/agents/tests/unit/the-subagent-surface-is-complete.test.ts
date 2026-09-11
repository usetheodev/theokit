import { describe, expect, it } from 'vitest'

import * as barrel from '../../src/index.js'

/**
 * The sub-agent surface is whole, or it is a trap.
 *
 * This package names the same failure four times by issue number (#663, #668, #675, #686): a TYPE
 * crosses the barrel, the CAPABILITY behind it does not, and the consumer discovers the gap at
 * runtime. Sub-agents were the fifth. `SubAgentsCapability`, `SubagentDefinition`,
 * `discoverSubagents`, `loadSubagentDefinition` and `listSubagentNames` all crossed, so the
 * authoring chain reads as complete — and what it compiled reached nothing, because
 * `assembleM8CreateOptions` had no `agents` field to project into.
 *
 * The other half was the door that DID work. `RuntimeOverrides.agents` spawned children and the
 * type was exported by zero barrels, so a consumer could pass one and could not name one: no
 * typed helper, no wrapper, no variable to hold it.
 *
 * `tools-barrel-surface.test.ts` locks its slice this way for the same reason — a dropped
 * re-export is invisible until someone's build breaks, and by then it is a release.
 *
 * The TYPE half lives in `tests/type/the-subagent-surface.test-d.ts`, and the gate on it is
 * `tsc --noEmit -p tsconfig.test.json` — NOT the vitest run.
 *
 * That distinction cost two wrong conclusions here, so it is worth writing down. The assertions
 * were first placed in this file as annotations, where `typecheck.include` (the `tests` tree, `.test-d.ts` files only)
 * never matched them. Moving them to a `.test-d.ts` and running `vitest --typecheck` still reported
 * "Type Errors: no errors" — and a deliberate `const n: number = "x"` appended to that same file
 * was ALSO reported as no errors. The runner was not reading it either way.
 *
 * What does read it: `tsc -p tsconfig.test.json` exits 0 today and exits 2 with
 * `TS2305: has no exported member 'RuntimeOverrides'` the moment the export is deleted. A green
 * that comes from a filter matching nothing looks exactly like a green that comes from passing.
 */
const RUNTIME_REQUIRED = [
  'discoverSubagents',
  'loadSubagentDefinition',
  'listSubagentNames',
  'SubAgentsCapability',
] as const

describe('the sub-agent surface crosses the barrel whole', () => {
  it('exports every runtime symbol the authoring chain needs', () => {
    for (const name of RUNTIME_REQUIRED) {
      expect(barrel[name as keyof typeof barrel], name).toBeTypeOf('function')
    }
  })
})
