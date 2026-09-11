import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { applyCapabilities } from '../../src/capability/capability.js'
import { ModelCapability } from '../../src/capability/capabilities.js'
import { CheckpointCapability } from '../../src/capability/agent-capabilities.js'

/**
 * Two different things share the word `checkpoint`, and only one of them exists here.
 *
 * What this package has is RUN-STATE checkpointing: enough to resume a conversation. What it does
 * not have is FILE checkpointing — snapshot and restore of the files an agent edited, the thing an
 * interactive coding agent needs to offer an undo.
 *
 * Measured 2026-09-11: `rewindFiles`, `rewind_files`, `restoreFile` and `backup` returned 0 files
 * here, 0 in the SDK `.d.ts` and 0 in `@theokit/sdk-tools`, while `checkpoint` returned six — all of
 * them run state.
 *
 * ## Why a test and not only a comment
 *
 * The harm the item names is not the missing feature; it is that **any parity checklist grepping for
 * `checkpoint` is satisfied by the wrong one** and reports a capability that does not exist. A
 * comment does not survive that: the next survey greps, finds six files, and moves on.
 *
 * This file fails if a file-restore surface ever appears without the docblock being updated with it,
 * and fails if the compiled shape stops being about run state. Either way somebody reads the
 * distinction at the moment it stops being true.
 */
const CAPABILITY_SOURCE = join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'capability',
  'agent-capabilities.ts',
)

describe('run-state checkpointing is not file undo', () => {
  it('compiles to a run-state shape, with no file surface', () => {
    const compiled = applyCapabilities([
      new ModelCapability('m'),
      new CheckpointCapability({ storage: 'filesystem' } as never),
    ])
    const checkpoint = compiled.checkpoint as Record<string, unknown> | undefined

    expect(checkpoint?.storage, 'the shape stopped being about run state').toBe('filesystem')
    for (const fileConcept of ['files', 'snapshot', 'restore', 'rewind', 'backup']) {
      expect(
        Object.keys(checkpoint ?? {}),
        `a file surface appeared under the run-state name — update the docblock with it`,
      ).not.toContain(fileConcept)
    }
  })

  it('says so where a reader meets the colliding name', () => {
    // The collision is the defect, so the statement has to live AT the name — not in a changelog a
    // grep will never reach. This asserts it is still there, because a docblock nothing checks is a
    // docblock that gets tidied away.
    const source = readFileSync(CAPABILITY_SOURCE, 'utf8')
    const marker = source.slice(source.indexOf('class CheckpointCapability') - 2200)
    expect(marker).toContain('It is not file undo')
    expect(marker, 'the reason the collision matters was dropped').toContain('parity checklist')
  })
})
