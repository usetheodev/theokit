/**
 * Persisted tool-permission grants — "always allow this", without "allow everything".
 *
 * ## Why this is the one genuine absorption in its plan
 *
 * Measured by grep across both packages: `alwaysAllow|allowRule|permissionRule|rememberDecision`
 * returns **zero**. `ApprovalDecision` settles ONE request; nothing persists a standing grant.
 * Neither the framework nor its closest consumer had this for tools — the consumer built the
 * equivalent for HOOKS only, and for tools its single escape is the global `full-auto`, which
 * removes the gate rather than narrowing it.
 *
 * So the honest state of the art was: approve the same `npm test` a tenth time, or turn the gate
 * off. The tenth prompt is where a person stops reading prompts, which makes the "safe" option the
 * one that produces unsafe behaviour.
 *
 * ## The key IS the safety property
 *
 * A grant is keyed by **(tool, scope, signature)**:
 *
 * - **tool** — "always allow `run_shell`" must not authorise `apply_patch`.
 * - **scope** — canonicalised with `realpath`. `/repo/a`, `/repo/a/` and `/repo/./a` are one
 *   directory and three strings; a symlink is a fourth. String equality both denies grants the user
 *   made (training them toward `full-auto`) and lets a link borrow a grant made for somewhere else.
 *   The consumer's own trust store had exactly this defect, measured.
 * - **signature** — the command, whitespace-normalised and NEVER fuzzy-matched. `npm test` does not
 *   authorise `npm test --force`. A near-match that grants is worse than no grant, because the user
 *   believes they approved something narrower than what runs.
 *
 * ## Failure posture
 *
 * Deny by default, always. An absent store, an unreadable one, a corrupt one, an unresolvable scope
 * and an expired grant all answer `false`. A corrupt store additionally REPORTS
 * (`lastReadError`) — reading as empty is indistinguishable from being empty, and the operator
 * would never learn their grants stopped applying.
 *
 * ## This class DOES NOT ENFORCE ANYTHING ON ITS OWN
 *
 * The posture above is what `isGranted` ANSWERS, not what the framework does. **No tool path
 * consults a store by default and no option accepts one**, so until a consumer attaches
 * {@link grantGate}, a grant and its revocation produce identical behaviour and
 * `.theokit/tool-permissions.json` is a file an operator can read and cannot rely on.
 *
 * The previous wording was "nothing in this package calls it", which the commit that added this
 * paragraph made false in the same diff: `auth/permission-gate.ts` is in this package and calls
 * `isGranted`. Corrected on review — a sentence written to fix a stale enforcement claim should not
 * itself go stale on arrival.
 *
 * That sentence is here because its absence was a defect. For one release this docblock said
 * "Deny by default, always" — an enforcement claim — beside an `isGranted` with zero callers, which
 * is the fabricated mechanism this repository refuses everywhere else.
 *
 * {@link permissionGate} is the supported way to put it in force: it adapts this store to
 * `pre_tool_call`, the only hook with veto power, which runs before the tool by construction.
 *
 * ## Precedence, when more than one surface has an opinion
 *
 * Four things can refuse a tool, and they do not negotiate — each is consulted by whoever wired it:
 *
 * | Surface | Decides | Runs |
 * |---|---|---|
 * | `defineAgent({ approvals })` | this tool PAUSES for a human | at compile time into `compiled.hitl` |
 * | `.approval()` | the same, through the builder | same |
 * | a `pre_tool_call` hook | veto, with a message | before the tool |
 * | {@link permissionGate} | veto, from a standing grant | before the tool, AS a `pre_tool_call` hook |
 *
 * The last two share one field. `HookHandlers.pre_tool_call` is singular, so assigning one over the
 * other loses it silently — compose them explicitly; {@link permissionGate}'s docblock shows the
 * line. The HITL surfaces are orthogonal: a tool can be both gated by a grant and gated by a human,
 * and a veto here means the human is never asked.
 */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { readSecureJson, writeSecureJson } from '../hooks/secure-store.js'

/** What a caller asks about: may THIS tool run THIS command in THIS place? */
export interface PermissionQuery {
  readonly tool: string
  /** Directory the call runs in. Canonicalised before it becomes part of the key. */
  readonly scope: string
  readonly command: string
}

export interface GrantOptions {
  /** Milliseconds from now. Absent ⇒ the grant does not expire. */
  readonly ttlMs?: number
}

/** One standing grant, as persisted. */
export interface Grant {
  readonly tool: string
  readonly scope: string
  readonly command: string
  readonly grantedAt: string
  /** Epoch millis. Absent ⇒ never expires. */
  readonly expiresAt?: number
}

export interface PermissionStoreOptions {
  /** Root under which `.theokit/tool-permissions.json` lives. Injectable so tests never touch `~`. */
  readonly home: string
  /** Injectable clock — a store whose expiry cannot be tested is a store whose expiry is untested. */
  readonly now?: () => number
}

/**
 * Collapse runs of whitespace and trim. Deliberately NOT a fuzzy match: two commands that differ by
 * an argument are two different things to authorise.
 */
function signatureOf(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

export class PermissionStore {
  /** Absolute path of the backing file. Public so a test can corrupt it deliberately. */
  readonly path: string

  /** Why the last read failed, when it did. Carried, never thrown — a bad store must not end a turn. */
  lastReadError?: Error

  readonly #now: () => number

  constructor(options: PermissionStoreOptions) {
    this.path = join(options.home, '.theokit', 'tool-permissions.json')
    this.#now = options.now ?? Date.now
  }

  /**
   * Resolve a scope to the directory it actually names.
   *
   * @throws when it does not resolve. Falling back to the raw string would silently restore the
   *   string comparison this method exists to remove — and a grant keyed on an unresolvable path
   *   can never be matched by a real call anyway, so the "lenient" branch only ever misleads.
   */
  #canonicalScope(scope: string): string {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolving the caller's own working directory is the entire point; refusing dynamic paths here would refuse every real call
      return realpathSync(scope)
    } catch (cause) {
      throw new Error(
        `permission scope ${scope} does not resolve to a real directory, so it cannot key a grant. ` +
          `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
  }

  isGranted(query: PermissionQuery): boolean {
    let scope: string
    try {
      scope = this.#canonicalScope(query.scope)
    } catch {
      // Deny, do not throw: an unresolvable scope on a CHECK is a "no", and a check is not the place
      // to end a turn. `grant()` throws instead, because storing such a key is a caller mistake.
      return false
    }

    const grant = this.#find(this.#load(), query.tool, scope, signatureOf(query.command))
    if (grant === undefined) return false
    // `<=` and not `<`: a grant expiring exactly now is expired.
    if (grant.expiresAt !== undefined && grant.expiresAt <= this.#now()) return false
    return true
  }

  grant(query: PermissionQuery, options: GrantOptions = {}): void {
    const scope = this.#canonicalScope(query.scope)
    const grants = this.#load().filter(
      (g) =>
        !(g.tool === query.tool && g.scope === scope && g.command === signatureOf(query.command)),
    )
    grants.push({
      tool: query.tool,
      scope,
      command: signatureOf(query.command),
      grantedAt: new Date(this.#now()).toISOString(),
      ...(options.ttlMs === undefined ? {} : { expiresAt: this.#now() + options.ttlMs }),
    })
    this.#persist(grants)
  }

  revoke(query: PermissionQuery): void {
    const scope = this.#canonicalScope(query.scope)
    const signature = signatureOf(query.command)
    const kept = this.#load().filter(
      (g) => !(g.tool === query.tool && g.scope === scope && g.command === signature),
    )
    this.#persist(kept)
  }

  /** Every grant on record, expired ones included — `list()` reports, it does not judge. */
  list(): readonly Grant[] {
    return this.#load()
  }

  /**
   * Grants that have expired.
   *
   * Surfaced rather than swept: an expired grant that vanishes silently is a permission the user
   * believes they still have. The same discipline the repository applies to allowlist sunsets.
   */
  expired(): readonly Grant[] {
    const now = this.#now()
    return this.#load().filter((g) => g.expiresAt !== undefined && g.expiresAt <= now)
  }

  #find(
    grants: readonly Grant[],
    tool: string,
    scope: string,
    signature: string,
  ): Grant | undefined {
    return grants.find((g) => g.tool === tool && g.scope === scope && g.command === signature)
  }

  #load(): Grant[] {
    const { value, error } = readSecureJson<Grant[]>(
      this.path,
      (raw) => {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) throw new Error('expected an array of grants')
        return parsed as Grant[]
      },
      [],
    )
    this.lastReadError = error
    return value
  }

  #persist(grants: readonly Grant[]): void {
    writeSecureJson(this.path, () => `${JSON.stringify(grants, null, 2)}\n`)
  }
}
