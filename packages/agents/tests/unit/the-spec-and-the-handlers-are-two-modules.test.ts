import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseHookSpecs, hookSpecSchema, HOOK_EVENTS } from '../../src/hooks/hook-events.js'
import * as hookSpec from '../../src/hooks/hook-spec.js'

/**
 * B-002 FR-004 and NFR-004 — the two criteria of the aligned brief that do not need upstream.
 *
 * FR-001..003 ask for a callback that runs before compaction. Measured 2026-09-12 against
 * `@theokit/sdk@5.5.0`, `HookName` is a closed union of ten names with no compaction member, and
 * `PluginContext.on` keys by it — so no event name can be added from this repository. That half is
 * blocked on `theokit-sdk#653`.
 *
 * FR-004 is the half that can be delivered: state the limit where a consumer meets it, rather than
 * leaving them to discover it when their handler never fires.
 *
 * ## Why a file split is part of this and not scope creep
 *
 * AC-007 caps `hook-spec.ts` at 600 lines. It is 616 — the brief recorded 524, and `dcb461fee` added
 * 92 in unrelated surface work. Adding FR-004's docblock to a file already over budget would deepen
 * the violation, so the budget is paid first, along the SRP boundary the file already had: the spec
 * (self-contained) and the handler building that depends on it.
 *
 * The cut is the SPEC and not the observational half, which was the other candidate. The
 * observational code references `matches`, which is private — only `__matchesForTests` is exported —
 * so extracting it would force `matches` public to satisfy a line count. Trading an invariant for a
 * number is the wrong direction.
 */
const HOOKS = join(import.meta.dirname, '..', '..', 'src', 'hooks')

/** Every symbol measured to be imported from `hook-spec.js` across src and tests. */
const MUST_STAY_IMPORTABLE = [
  'DEFAULT_HOOK_TIMEOUT_MS',
  'HookSpecError',
  '__matchesForTests',
  'assignObservationalHandlers',
  'buildHookHandlers',
  'fenceHookOutput',
  'parseHookSpecs',
] as const

describe('the spec and the handlers are two modules', () => {
  it('lets the spec be imported from the module that owns it', () => {
    expect(typeof parseHookSpecs).toBe('function')
    expect(hookSpecSchema).toBeDefined()
    expect(HOOK_EVENTS.length).toBeGreaterThan(0)
  })

  it('keeps every symbol a caller already imports importable from hook-spec', () => {
    // The re-export is what makes this a refactor rather than a breaking change. Enumerated by
    // measuring the imports rather than by recalling them: a list written from memory is a list that
    // omits the one nobody thought of.
    for (const name of MUST_STAY_IMPORTABLE) {
      expect(hookSpec, `${name} stopped being importable from hook-spec.js`).toHaveProperty(name)
    }
  })

  it('keeps hook-spec.ts inside its declared budget (AC-007)', () => {
    const lines = readFileSync(join(HOOKS, 'hook-spec.ts'), 'utf8').split('\n').length
    expect(
      lines,
      `hook-spec.ts is ${String(lines)} lines, over the 600 the brief caps it at`,
    ).toBeLessThanOrEqual(600)
  })

  it('states the compaction path it cannot cover, where the events are declared (AC-005)', () => {
    // FR-004. The SDK's auto-compaction is bundle-internal, absent from every `.d.ts` and all 33
    // export subpaths, and builds its own summarizer at the call site — so no seam added here reaches
    // it. A consumer learns that from the file they are already reading, not from a handler that
    // never fires.
    const source = readFileSync(join(HOOKS, 'hook-events.ts'), 'utf8')

    expect(source).toMatch(/auto-compaction|autoCompactIfNeeded/)
    expect(source, 'the reader is not pointed at the issue that unblocks it').toContain('653')
  })
})
