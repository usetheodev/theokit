/**
 * B-034 — the sub-agent TYPES cross the public barrel.
 *
 * COMPILE-TIME assertions: `npx tsc --noEmit -p packages/agents/tsconfig.test.json` fails if either
 * name stops being exported. The runtime half — the capability and loader functions — is pinned in
 * `tests/unit/the-subagent-surface-is-complete.test.ts`.
 *
 * The split is not stylistic, and the gate is `tsc` rather than `vitest --typecheck`. These
 * assertions lived in a `.test.ts` first, where `typecheck.include` never matched them. Moving them
 * here and running `vitest --typecheck` ALSO reported "no errors" — including for a deliberate
 * `const n: number = "x"` appended to this file, which the runner did not see either.
 *
 * `tsc --noEmit -p tsconfig.test.json` does see it: exit 0 today, exit 2 with
 * `TS2305: has no exported member 'RuntimeOverrides'` the moment the barrel export is deleted.
 *
 * `RuntimeOverrides.agents` is the door that always spawned children, and it was exported by zero
 * barrels — so a consumer could pass the value and could not name the type: no helper, no wrapper,
 * no typed variable to hold one.
 */
import { expectTypeOf } from 'vitest'

import type { RuntimeOverrides, SubagentDefinition } from '../../src/index.js'

const child: SubagentDefinition = {
  description: 'Looks a record up',
  prompt: 'You look records up.',
}

const overrides: RuntimeOverrides = { agents: { helper: child } }

expectTypeOf(overrides.agents).toEqualTypeOf<Record<string, SubagentDefinition> | undefined>()
expectTypeOf(child.description).toEqualTypeOf<string>()
