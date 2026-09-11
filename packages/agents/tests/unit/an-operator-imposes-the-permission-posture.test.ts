import { describe, expect, it } from 'vitest'

import {
  APPROVAL_MODES,
  approvalModeToPermissionMode,
  type ApprovalMode,
} from '../../src/bridge/approval-decision.js'

/**
 * Permission modes existed as a thing the MODEL could ask for and not as a posture an operator
 * imposes, and two vocabularies described the same axis without meeting.
 *
 * Measured: `permissionMode` returned one file and it is a MIRRORED, UNREAD field —
 * `auth/permission-gate.ts` declares `readonly permissionMode?: string` and its own docblock says
 * "its absence from the gate's logic is a decision". `dontAsk`, `autoMode`, `useAutoModeDuringPlan`
 * and `classifyAllShell` all 0/0. The local vocabulary is `suggest | auto-edit | full-auto` — three
 * modes against the documented set, with no overlap in naming.
 *
 * `createPlanModeTool` exists, and it is a tool the MODEL may call rather than a mode the operator
 * imposes. The difference is who decides.
 *
 * ## What is reconciled, and what is honestly absent
 *
 * The three local modes map onto the runtime's, so a reader of either meets the other. `plan` has no
 * local counterpart, and inventing a fourth local name for it would be worse than saying so: the
 * local three are the values a real consumer put in front of users, and `plan` is a posture an
 * operator imposes rather than something that surface offers.
 */
describe('the approval vocabulary meets the permission vocabulary', () => {
  it('maps every local mode onto a runtime mode', () => {
    const seen = APPROVAL_MODES.map((m) => approvalModeToPermissionMode(m))
    expect(seen).toEqual(['default', 'acceptEdits', 'bypass'])
  })

  it('maps suggest onto the fail-closed default rather than onto ask-everything', () => {
    // `default` means "the rules decide, and an unmatched call asks". Mapping `suggest` to something
    // that asks unconditionally would discard every allow rule the operator shipped.
    expect(approvalModeToPermissionMode('suggest')).toBe('default')
  })

  it('maps full-auto onto bypass, which still cannot un-deny', () => {
    // The load-bearing half: `bypass` allows everything EXCEPT an explicit deny. Mapping the most
    // permissive local mode onto something that also cleared denies would turn a UI convenience into
    // a policy override.
    expect(approvalModeToPermissionMode('full-auto')).toBe('bypass')
  })

  it('covers the whole local vocabulary, by construction', () => {
    // A map missing an entry would fall through to a default and read as deliberate. The signature
    // takes `ApprovalMode`, so a fourth local mode is a compile error here rather than a silent
    // posture.
    for (const mode of APPROVAL_MODES) {
      expect(approvalModeToPermissionMode(mode as ApprovalMode), mode).toBeTypeOf('string')
    }
  })
})
