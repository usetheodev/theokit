/* eslint-disable security/detect-non-literal-fs-filename --
 * A trust store addressed by a path the caller chooses. The variable filename IS the feature: a
 * store that could only live at one literal path could not serve a per-machine or per-test location.
 * No HTTP input reaches here — the path comes from the framework's own config resolution.
 */
import { chmodSync, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

// Imported from the SDK directly, not from this package's own barrel: these files now LIVE in
// `@theokit/agents`, so `from '@theokit/agents'` would be a package self-reference (and a cycle
// through `src/index.ts`). The barrel re-exports the same SDK symbols for consumers; inside the
// package we reach the source.
import { resolveTrustPosture } from '@theokit/sdk'
import type { TrustPosture } from '@theokit/sdk'
import { TheokitAgentError } from '@theokit/sdk/errors'
import { atomicWriteJson, withFileLock } from '@theokit/sdk/persistence'

import { ensureSecureDir } from '../hooks/secure-store.js'
// These modules moved from `theokit` into `@theokit/agents`, and this package enforces an
// invariant the web package does not: no exported error class extends plain `Error`. A class
// outside the `TheokitAgentError` hierarchy is invisible to `isTransientError` and to any
// consumer catching `instanceof TheokitAgentError` — the exact defect U-11 measured across ten
// classes. `tests/unit/error-taxonomy.test.ts` caught all three the moment they crossed the
// boundary, which is the guard working.

/**
 * M73 — the per-directory trust store: a trust decision that survives the process.
 *
 * ## Why persisting it matters
 *
 * M68 made `settingSources`' `project` root require a `TrustPosture` — evidence, not a claim. But a
 * posture computed fresh on every run is a question asked over and over, and a question asked every
 * run is a question users learn to answer without reading.
 *
 * Persisting turns the stamp into a DECISION: recorded once, auditable afterwards, and answerable by
 * "who trusted this directory, when, and on what basis" rather than by re-deriving it.
 *
 * ## Why the file permission is checked on READ
 *
 * This file decides whether a directory may run shell hooks. A store any other user can write is a
 * store any other user can use to grant themselves that. Checking at write time only would leave a
 * file whose mode was loosened afterwards looking fine — so the check is where the value is
 * consumed, and a loose mode is REFUSED rather than repaired: silently tightening it hides that
 * something changed the mode, which is the fact worth knowing.
 */

/** What was decided about one directory. */
export interface TrustRecord {
  /** Absolute path of the trusted directory. */
  readonly path: string
  /** ISO-8601 stamp of the decision. Injected by the caller — see {@link TrustStore.trust}. */
  readonly decidedAt: string
  /** Free-form provenance: who or what decided (a username, a CI job, `--trust` on the CLI). */
  readonly decidedBy: string
  readonly trusted: boolean
}

/** The on-disk shape. A version field so a future migration has something to branch on. */
interface TrustStoreFile {
  readonly version: 1
  readonly records: readonly TrustRecord[]
}

/** Raised when the store's file mode would let another user grant themselves trust. */
export class TrustStorePermissionsError extends TheokitAgentError {
  override readonly name = 'TrustStorePermissionsError'

  constructor(
    readonly file: string,
    readonly mode: number,
  ) {
    super(
      `trust store ${file} is mode ${mode.toString(8)} — group or world writable. This file decides ` +
        `which directories may run shell hooks, so a writable store is a way to grant that to ` +
        `yourself. Refused rather than repaired: tightening it silently would hide that something ` +
        `changed the mode. Fix with \`chmod 600 ${file}\`.`,
      // Refusing, not repairing: a permission that another user can set is not a transient fault.
      { code: 'trust_store_insecure_mode', isRetryable: false },
    )
  }
}

/** Bits that must be clear: group-write (0o020) and other-write (0o002). */
const FORBIDDEN_WRITE_BITS = 0o022

/**
 * A per-directory trust store on disk.
 *
 * Composes the SDK's `atomicWriteJson` (no reader ever sees a half-written store) and `withFileLock`
 * (two processes deciding at once do not interleave). Neither is reimplemented — both crossed the
 * boundary in M67, and a second implementation of an atomic write is how two answers to "is this
 * file complete" come to exist.
 */
/**
 * The directory a path actually names.
 *
 * The same rule `PermissionStore#canonicalScope` applies, and for the same reason: `/repo/a`,
 * `/repo/a/` and `/repo/./a` are one directory and three strings, and a symlink is a fourth. Two
 * stores in this package gate execution; disagreeing about what "the same directory" means is how a
 * user trusts a project, gets asked again because the path was spelled differently, and learns to
 * click through the prompt — the outcome the prompt exists to prevent.
 *
 * Falls back to `resolve` when the path does not exist, rather than throwing: unlike a permission
 * scope, a trust decision can legitimately be RECORDED for a directory before it is created (a
 * clone target, a worktree about to be added). `isTrusted` still denies what it cannot resolve, so
 * the lenient branch never widens trust — it only lets a decision be written down early.
 */
function canonicalDir(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

export class TrustStore {
  constructor(private readonly file: string) {}

  /**
   * Whether `path` carries a recorded decision to trust it.
   *
   * Denies on anything else — never recorded, recorded as refused, or unresolvable. A refusal on
   * record (`trusted: false`) is a different fact from "never asked", and neither is trust.
   */
  isTrusted(path: string): boolean {
    const key = canonicalDir(path)
    return this.read().some((r) => canonicalDir(r.path) === key && r.trusted)
  }

  /**
   * Read the store, refusing a file other users can write.
   *
   * A missing store is not an error — it is a machine that has trusted nothing yet, which is the
   * correct starting state and the safe one.
   */
  read(): readonly TrustRecord[] {
    if (!existsSync(this.file)) return []
    this.assertSafePermissions()
    const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as TrustStoreFile
    return parsed.records
  }

  /**
   * Record a decision about `path`, replacing any previous one for it.
   *
   * `decidedAt` and `decidedBy` are ARGUMENTS, not derived here (DIP): the clock and the identity
   * belong to the caller, and baking `new Date()` in would make every assertion about the record
   * depend on when the test ran.
   *
   * ASYNC because both `withFileLock` and `atomicWriteJson` are. Measured, not assumed: the first
   * draft called them synchronously and `trust()` returned before the bytes landed, so an immediate
   * `read()` saw an empty store. Same shape as the M71 pointer bug, and same cause — the SDK's
   * `.d.ts` does not declare these, so nothing at compile time says they return a Promise
   * (usetheokit/theokit-sdk#280).
   */
  async trust(record: TrustRecord): Promise<void> {
    // `ensureSecureDir`, not a bare `mkdirSync`: the mode argument is a NO-OP on a directory that
    // already exists, and this one is shared with the SDK's transcript root — whoever creates it
    // first sets the permissions. The two sibling stores in this package already went through it;
    // this one did not, which left the directory holding the file that authorises command execution
    // at whatever the umask produced. Found by a consumer's test failing during migration.
    ensureSecureDir(this.file)
    // The casts are the upstream `.d.ts` gap named in usetheokit/theokit-sdk#280: several
    // persistence symbols are re-exported by the barrel and never declared, so they arrive
    // unresolved. They exist and are async (measured). Naming the shape at the call site beats
    // hiding it — and it is the same gap that let the first draft call them synchronously.
    await (withFileLock as (f: string, fn: () => Promise<void>) => Promise<void>)(
      this.file,
      async () => {
        const existing = existsSync(this.file) ? this.read() : []
        // Compared on the CANONICAL path, not the string as written: otherwise `/repo` and `/repo/`
        // accumulate as two records for one directory, and which one answers depends on iteration
        // order rather than on what the user decided.
        const key = canonicalDir(record.path)
        const records = [...existing.filter((r) => canonicalDir(r.path) !== key), record]
        await atomicWriteJson(this.file, {
          version: 1,
          records,
        } satisfies TrustStoreFile)
        // 0o600 at creation. The read-side check is what catches a mode loosened afterwards; setting
        // it here is what makes the common path correct without the operator having to know.
        chmodSync(this.file, 0o600)
      },
    )
  }

  /**
   * The recorded posture for `path`, or an UNTRUSTED posture when nothing was recorded.
   *
   * Absence resolves to untrusted, never to "unknown, proceed". A store that answered "I do not
   * know" would push the decision back to the caller, and the caller asking is what the store
   * exists to answer.
   */
  postureFor<K extends string>(path: string, capabilities: readonly K[]): TrustPosture<K> {
    const record = this.read().find((r) => r.path === path)
    return resolveTrustPosture<K>({
      capabilities: [...capabilities],
      isTrusted: () => record?.trusted === true,
    })
  }

  private assertSafePermissions(): void {
    const mode = statSync(this.file).mode & 0o777
    if ((mode & FORBIDDEN_WRITE_BITS) !== 0) {
      throw new TrustStorePermissionsError(this.file, mode)
    }
  }
}
