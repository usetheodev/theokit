import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, utimesSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  __acquireBuildLockForTests,
  __releaseBuildLockForTests,
  __isBuildLockStaleForTests,
  __recoverStaleBuildLockForTests,
} from '../integration/_helpers/build-theokit-package.js'

/**
 * A lock file of this test's OWN, never the production one.
 *
 * The first version used `LOCK` and failed under a full root run with "expected null not
 * to be null": another file in the same run was legitimately holding the real build lock, so the
 * first `acquire` here returned `null`. A test that shares global state with the thing it tests is
 * order-dependent, which `rules/testing.md § 3` forbids — and it failed in exactly the suite this
 * item exists to make green.
 *
 * It also lives beside the production lock rather than in the OS temp dir, for the reason that
 * moved that one: CodeQL reported `js/insecure-temporary-file` (high) on both. A per-pid name in a
 * shared temp directory is still a predictable path in a directory other accounts can pre-create.
 */
const LOCK = resolve(
  fileURLToPath(new URL('../../node_modules/.cache/theokit-build-locks', import.meta.url)),
  `lock-discipline-test-${String(process.pid)}.lock`,
)

/**
 * B-016 — the build lock was released by whoever finished, not by whoever took it.
 *
 * ## What was measured
 *
 * `npx vitest run` at the repo root was intermittently red with three files failing, one of them
 * `ENOENT: unlink packages/theo/dist/chunk-*.js.map` out of tsup's `removeFiles` — the signature of
 * TWO tsup runs cleaning one output directory. Re-running those files in isolation against a warm
 * dist passed.
 *
 * Two defects in one function, both in `buildTheokitPackageOnce`:
 *
 * 1. The `finally` guarded `closeSync(lockFd)` on `lockFd !== null` and then called
 *    `unlinkSync(LOCK_FILE)` UNCONDITIONALLY — so a process that never acquired the lock deleted
 *    the holder's, freeing every waiter to pile in.
 * 2. When the 240s wait expired with no fresh dist, control FELL THROUGH to `execSync` — building
 *    concurrently with a holder that was, by construction, still building.
 *
 * The two compose: the second process deletes the lock, the third acquires it, and now three tsup
 * runs share one `dist/`.
 *
 * ## Why these tests and not a race harness
 *
 * Reproducing the interleaving would need two real builds and minutes of wall clock, which is the
 * kind of test people delete. The defects are properties of the lock discipline, so the discipline
 * is what is tested: an owner releases, a non-owner does not, and a stale lock is distinguishable
 * from a live one.
 */
describe('the build lock', () => {
  beforeEach(() => {
    if (existsSync(LOCK)) unlinkSync(LOCK)
  })
  afterEach(() => {
    if (existsSync(LOCK)) unlinkSync(LOCK)
  })

  it('test_a_non_owner_does_not_delete_the_holders_lock', () => {
    // THE defect. A second process that could not acquire the lock ran the same `finally` and
    // removed the file, so the holder kept building while everyone else was released to build too.
    const held = __acquireBuildLockForTests(LOCK)
    expect(held, 'the first caller owns it').not.toBeNull()

    const second = __acquireBuildLockForTests(LOCK)
    expect(second, 'the second caller does not').toBeNull()

    __releaseBuildLockForTests(second)
    expect(
      existsSync(LOCK),
      'releasing a lock you never took must be a no-op, not a deletion',
    ).toBe(true)

    __releaseBuildLockForTests(held)
    expect(existsSync(LOCK), 'the owner releases it').toBe(false)
  })

  it('test_a_fresh_lock_is_not_stale', () => {
    const held = __acquireBuildLockForTests(LOCK)
    expect(__isBuildLockStaleForTests(LOCK)).toBe(false)
    __releaseBuildLockForTests(held)
  })

  it('test_a_lock_older_than_a_build_can_take_is_stale', () => {
    // Without this, a crashed holder leaves a file that blocks every future run until somebody
    // clears /tmp by hand — which is how a deadlock gets "fixed" by deleting the guard.
    mkdirSync(LOCK.replace(/\/[^/]+$/, ''), { recursive: true })
    closeSync(openSync(LOCK, 'w'))
    const longAgo = new Date(Date.now() - 60 * 60 * 1000)
    utimesSync(LOCK, longAgo, longAgo)

    expect(__isBuildLockStaleForTests(LOCK)).toBe(true)
  })

  it('test_an_absent_lock_is_not_stale', () => {
    // "Stale" is a statement about a lock that EXISTS. Answering true for an absent one would make
    // the caller remove a file that is not there and report having recovered something.
    //
    // Honest limit: removing the early `existsSync` return does NOT fail this test — `statSync` on a
    // missing file throws and the `catch` answers `false` anyway, so the mutant is equivalent. The
    // early return stays because `error-handling.md` refuses exceptions as control flow, not because
    // this test forces it. What the test pins is the CONTRACT, which holds through either path.
    expect(existsSync(LOCK)).toBe(false)
    expect(__isBuildLockStaleForTests(LOCK)).toBe(false)
  })

  it('test_a_release_does_not_delete_a_DIFFERENT_lock_at_the_same_path', async () => {
    // The path is not identity, and a review measured the consequence: A acquires, a stale recovery
    // unlinks it, B acquires at the same path, and A's release deletes B's lock — freeing every
    // waiter while B is still building. That is the two-concurrent-`tsup` race this file exists to
    // prevent, reopened by the change written to close it.
    const a = __acquireBuildLockForTests(LOCK)
    expect(a).not.toBeNull()

    // Simulate the stale recovery: the file A holds is removed and someone else takes the path.
    unlinkSync(LOCK)
    const b = __acquireBuildLockForTests(LOCK)
    expect(b, 'a second process now owns a DIFFERENT lock at the same path').not.toBeNull()

    __releaseBuildLockForTests(a)

    expect(
      existsSync(LOCK),
      "A's release must not delete B's lock — same name, different inode",
    ).toBe(true)

    __releaseBuildLockForTests(b)
    expect(existsSync(LOCK)).toBe(false)
  })

  /**
   * The branch that deletes ANOTHER process's file had no coverage at all, and the re-check its
   * comment credited for safety was `statSync(path).ino === staleIno` with `staleIno` read on the
   * line above — a value compared against itself. Removing it changed no behaviour, which is the
   * point: the guard that does the work is the freshness test, and now something asserts it.
   */
  it('test_a_live_lock_is_never_recovered_as_stale', () => {
    const held = __acquireBuildLockForTests(LOCK)
    expect(held).not.toBeNull()

    expect(__isBuildLockStaleForTests(LOCK), 'a lock taken just now is not stale').toBe(false)
    expect(__recoverStaleBuildLockForTests(LOCK), 'recovery must refuse a live lock').toBe(false)
    expect(existsSync(LOCK), "the live holder's lock survives").toBe(true)

    __releaseBuildLockForTests(held)
  })

  it('test_a_dead_holders_lock_is_recovered_so_one_crash_does_not_block_every_run', () => {
    const held = __acquireBuildLockForTests(LOCK)
    expect(held).not.toBeNull()
    closeSync(held!.fd)

    // Age the lock past BUILD_TIMEOUT_MS + STALE_MARGIN_MS by moving its mtime back an hour —
    // the holder is gone and nothing will ever release this file.
    const anHourAgo = new Date(Date.now() - 3_600_000)
    utimesSync(LOCK, anHourAgo, anHourAgo)

    expect(__isBuildLockStaleForTests(LOCK)).toBe(true)
    expect(__recoverStaleBuildLockForTests(LOCK), 'a dead holder must be recovered').toBe(true)
    expect(existsSync(LOCK), 'the dead lock is gone, so the next run can acquire').toBe(false)

    // And the path is usable again — the recovery is only worth anything if it unblocks.
    const next = __acquireBuildLockForTests(LOCK)
    expect(next, 'the lock is acquirable after recovery').not.toBeNull()
    __releaseBuildLockForTests(next)
  })

  it('test_recovering_an_absent_lock_reports_nothing_was_removed', () => {
    if (existsSync(LOCK)) unlinkSync(LOCK)
    // Absent is not stale — answering `true` here would have the caller report a recovery it did
    // not perform, which is the same false claim in a smaller place.
    expect(__isBuildLockStaleForTests(LOCK)).toBe(false)
    expect(__recoverStaleBuildLockForTests(LOCK)).toBe(false)
  })
})
