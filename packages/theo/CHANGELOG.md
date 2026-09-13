# theo

## 0.66.0

### Minor Changes

- ef049e1: The declared `@theokit/sdk` range no longer admits a floor that delivers zero parity.

  `packages/agents` declared `^4.52.1 || ^5.0.0` and `packages/theo` peer-declared the same. Measured
  by unpacking the published tarballs, against a control of `AgentOptions` (83-86 files in every one):

  | surface                          | 4.52.1 | 5.0.0 | 5.3.0 | 5.4.0 |
  | -------------------------------- | ------ | ----- | ----- | ----- |
  | `CompatSurface`                  | 0      | 10    | 10    | 10    |
  | `.claude/rules/*` discovery spec | 0      | 4     | 4     | 4     |
  | `settings.local.json`            | 0      | 4     | 4     | 4     |
  | `CLAUDE_PROJECT_DIR`             | 0      | 14    | 14    | 14    |

  The boundary is the 4→5 major exactly, and the lower half of the declared range delivered **zero**
  parity. Not one missing surface — every surface at once, invisibly, because the package resolves,
  compiles and runs. This repository's own lockfile resolved 4.52.1, so its green suite was green
  against an SDK where `compatSources` does not exist as an option.

  **Why the range rather than a fourth runtime guard.** Three version guards already exist
  (`HOOK_GATE_SINCE`, `COMPAT_IMPORT_SINCE`, and the `compatSources` warning), and every one is on a
  path where this layer PASSES AN OPTION to the SDK. The surfaces above are not like that: nothing is
  passed, the SDK reads a file or it does not, so there is no call site to guard. A fourth check could
  not have been written. The reason the floor stayed low is recorded in the code and has expired —
  _"Until this package's floor can name a stable 5.x"_; `@theokit/sdk@5.5.0` is `latest`, and stable
  5.x has existed since 5.3.0.

  **The floor is `^5.3.0`, and the first attempt at `^5.0.0` was wrong for an instructive reason.**
  Verifying that the four parity surfaces exist at 5.0.0 — they do — was necessary and not sufficient.
  The persistence barrel is GENERATED from the resolved copy, so it also ships whatever that copy
  exports, and six of those names do not exist at 5.0.0. The DTS build fails against the bottom of the
  range, which a consumer meets as a build error rather than as a typed refusal.

  Caught by `dep-check / suite at the bottom of every declared range`, the job that skips on a pull
  request into `develop` and runs on one into `main` — it fired exactly where it was designed to.

  Measured with controls at each version (positive `transcriptPath` = 1, invented name = 0): 5.0.0
  carries **1 of the 7**; 5.3.0, 5.4.0 and 5.5.0 carry **7 of 7**. So 5.3.0 is the lowest version
  _proven_ to work, not necessarily the first — the two releases between them are not in the measured
  set, and a declared floor that was proven beats one that was inferred.

  **Why not 5.4.0.** `local.hooks` and the narrowed `compatSources[].import` landed in
  5.4.0, which is inside the new range — and that is deliberate. Both already throw a typed error
  naming the version they need. Raising the floor to 5.4.0 would strand every 5.0-5.3 consumer who
  uses neither, in order to duplicate a refusal that already announces itself. The invariant is that
  every version the range admits either works or fails with a typed error naming what it needs; none
  fails in silence. A silent gap is closed by the range, a named one is not.

  **What the narrowing exposed, which is the item's real value.** The workspace itself resolved
  4.52.1, so raising the floor moved it to 5.5.0 and five test files went red with no production line
  changed. Each was something never verified:

  - `packages/agents/persistence` gained **7 exports** it had never been able to carry —
    `LiveTranscriptError`, `legacyTranscriptPath`, `listSessions`, `sessionUuidFor`,
    `ListSessionsOptions`, `SessionIdSource`, `SessionListing`. None were withheld; they were
    unreachable. The barrel is generated from the resolved copy, and a barrel generated against the
    bottom of a range ships the bottom of the range. `LiveTranscriptError` carried a note ending
    _"revisit when the floor moves past 4.x"_ — this is that revisit.
  - `assembleM8CreateOptions`'s `deps.sdkVersion`, documented "Injectable for tests", reached the hook
    gate and **not** the narrowed-import gate. So that gate could only ever read the ambient
    installation, and its test passed because the machine happened to resolve 4.52.1. The seam now
    reaches both, and the refusal is pinned with a version on each side rather than one.
  - `effectiveToolNames` entered the root bar in 5.x and was invisible here. Recorded `out` with
    measured evidence (0 callers in this repo, 0 in the downstream product, against probe controls of
    3 and 90) rather than by taste.

  **Why `theokit` takes a minor and not a major.** Narrowing a dependency range IS breaking, and under
  semver 0.x the breaking slot is the MINOR — `major` on a 0.x package means declaring 1.0.0, which is a
  statement about stability, not about this change. `theokit` is at 0.65.0 and has never taken a major:
  its own CHANGELOG carries entries labelled "BREAKING for hand-built compiled options" that shipped as
  minors. `public-copy.md § 3` refuses the production-ready claim until there is sustained measured
  evidence, and a 1.0.0 cut is that claim in the one place every consumer reads it. `@theokit/agents`
  (13.4.0) and `create-theokit` (2.0.0) are past 1.0, so their majors are the ordinary encoding.

  **Breaking:** a consumer pinned to `@theokit/sdk@4.x` can no longer install these packages. That
  consumer was already receiving none of the `.claude` compatibility the packages advertise, and
  `HookGateUnsupportedError` was already refusing them outright if they declared a hook gate. `theo`
  moves with `agents` because it depends on it: a peer range advertising a major its own dependency
  rejects is unsatisfiable at install time and says nothing until then.

### Patch Changes

- Updated dependencies [f28ebd5]
- Updated dependencies [6c1a602]
- Updated dependencies [24e1fab]
- Updated dependencies [ef049e1]
- Updated dependencies [914e177]
  - @theokit/agents@14.0.0

## 0.65.0

### Minor Changes

- 4709eec: **`escapeHtml` is exported, and says which context it is safe in** (#611).

  The framework had the function, kept it private inside the OpenAPI docs renderer, and an adopter
  building an HTML e-mail body wrote it again — same four characters, same order, same omission of
  `'`. Neither escaped the apostrophe, and neither had to: both call sites interpolate into text
  content, where four characters are enough. They were right by luck rather than by having been told,
  and the caveat is the part that does not survive being re-derived.

  `theokit/server/security` now exports two functions with two names, so the decision is visible where
  the interpolation happens:

  ```ts
  import { escapeHtml, escapeHtmlAttribute } from 'theokit/server/security'
  ;`<title>${escapeHtml(title)}</title>` // text content
  `<a href='${escapeHtmlAttribute(url)}'>` // quoted attribute — escapes ' and ` too
  ```

  Both run as a single character-class pass, which also removes the ordering hazard the chained
  `.replace()` idiom carries: run the ampersand last and `<` has already become `&lt;`, which the
  ampersand pass then turns into `&amp;lt;`. The docs renderer consumes them instead of carrying its
  own copy.

  Same shape as #574 (`@Public()`, `Authenticated()`): the framework owns the primitive, so it owns
  the caveat with it.

- 8333525: **A `@Controller` route runs the plugin lifecycle** (#607).

  `dispatchControllerRequest` had no parameter for a plugin runner, so neither of its two callers
  could pass one. A controller route therefore ran no hook at all under `theokit start` — not
  `onRequest`, not `preHandler`, not `onResponse`, not `onError` — and under `theokit dev` only the
  `onRequest` the middleware happened to fire before matching, which reached controllers by accident
  rather than by design.

  Measured against a real adopter: its identity plugin had never run, so `ctx.subject` was never
  populated, while the boot log reported the plugin registered. Nobody noticed because the app's
  guards read the session from the `Request` directly. An app using `.policy(({ subject }) => …)` on
  a controller route would have been refusing every caller instead. The same app then added rate
  limiting to three routes that bill a third party per call, wrote it as a `preHandler`, and it
  enforced nothing while reading exactly like protection.

  **`onRequest` fires once per request in `theokit dev`, not twice** (#609).

  The dev middleware called `runOnRequest` before matching a route, and `executeRoute` called it
  again for the route it matched. Nothing deduped them, so every matched file route fired `onRequest`
  twice in dev and once under `theokit start`. Anything a hook counted, billed, audited or traced was
  doubled on the surface nobody instruments and correct on the one that ships.

  The pre-match call still exists, and still does the job it was added for — letting a plugin serve a
  path no route owns, such as `@theokit/plugin-openapi` on `/api/docs`. It has moved to the end of
  that arm, so it runs only when neither a file route nor a controller owns the request.

  Both defects had one cause: the dev middleware had a second, uncoordinated entry into the
  lifecycle, and the controller path had none. Fixing either alone makes the other worse, which is
  why they ship together.

  **What this changes for an existing app.** A `preHandler` that short-circuits now applies to
  controller routes, where it previously did not. If a hook was written expecting to govern only file
  routes, it now governs both — which is the contract as documented, and may refuse traffic the app
  was serving. A hook whose side effect was tuned around the doubled dev count will now see half as
  many in dev, matching what production always reported.

  Hooks still cannot reach a controller handler's arguments: a controller method receives its inputs
  through parameter decorators, so a decoration written onto the plugin `ctx` has no seam to arrive
  through. Only file routes read `ctx`. That limit is unchanged by this fix and is not what either
  issue reported.

- 9b5da86: **A controller route can name a rate limit, and a guard can refuse with 429** (#612).

  `theokit/server/rate-limit` exported a complete limiter and nothing a `@Controller` route could use,
  so every app wrote the adapter — the third instance of a pattern whose first two shipped as
  `@Public()` and `Authenticated()` (#574). The hand-written adapter could not be correct, for two
  reasons that were not the author's fault:

  - **A guard could not answer 429.** `canActivate` returns a boolean, so a refused caller received
    `403 Forbidden resource` and the `X-RateLimit-*` the limiter had just computed were discarded —
    a guard owns no response to attach them to. "You are not allowed" and "you are allowed, later"
    read identically, and a well-behaved client had nothing to back off on.
  - **The intuitive alternative was silently inert.** A `preHandler` plugin enforced nothing on
    controller routes (#607, fixed in the same line of work) while reading exactly like protection.

  **`theokit/server/rate-limit` now exports `RateLimited`:**

  ```ts
  @Post('stt')
  @UseGuards(Authenticated(sessions), RateLimited({ max: 20, windowMs: 60_000 }))
  transcribe() { ... }
  ```

  A refused caller gets `429` with `Retry-After`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
  `scope: 'shared'` pools several routes into one budget, which is what an app capping endpoints that
  bill a third party per call actually wants. The constructor **throws** on a configuration that
  cannot tell callers apart — `keyBy: 'ip'` with no `trustProxy` and no `identify` — because a Web
  `Request` has no socket address, and accepting it would put every visitor in one bucket: a limiter
  that refuses the whole internet after N requests while reading as protection until it does. It does
  not attach `X-RateLimit-*` to allowed responses, and says so in its docblock rather than shipping a
  header that appears under one dispatcher and vanishes under another.

  **`@theokit/http`:**

  - `HttpException` accepts and carries `headers`, and every dispatcher renders them through one
    `httpExceptionToResponse` instead of four hand-built `new Response(...)` calls. `429` without
    `Retry-After`, `401` without `WWW-Authenticate` and `405` without `Allow` are all half an answer.
  - The guard pipeline is one `runGuards` shared by `TheoApp`, `createDecoratorHandler` and the
    TheoKit plugin, instead of four copies — the arrangement #576 already paid for once. A guard
    throwing an `HttpException` now reaches the client with its status and headers on all three, agent
    routes included, where the exception previously escaped the dispatcher entirely.
  - The published types say these exceptions are `Error`s again. `tsup` had been erasing the
    inheritance into an anonymous structural type, so an app writing `throw new UnauthorizedException()`
    tripped `@typescript-eslint/only-throw-error` against the framework's own exceptions — and the
    lint was right about what the `.d.ts` claimed.

- d2b5413: **A session secret that looks like a placeholder no longer boots in production** (#610).

  `assertProductionSecret` reached both session constructors already (#429's half of the fix) and
  still admitted every placeholder an adopter actually writes. Its whole vocabulary was
  `/CHANGE_ME|demo[-_]|placeholder/i`, so the 32-character floor was the only condition that ever
  fired — and a placeholder long enough to clear that floor is exactly what a developer produces when
  the error message asks for 32 characters. Measured against `theokit@0.64.0` with
  `NODE_ENV=production`, all five of these started a server:

  ```
  ACCEPTED  "dev-only-session-secret-32-chars-min-xxxx"   ← a real app's fallback
  ACCEPTED  "changemexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"    ← the pattern wants CHANGE_ME, not changeme
  ACCEPTED  "devxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  ACCEPTED  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"    ← forty identical characters
  ACCEPTED  "test-secret00000000000000000000000000000"
  ```

  An app that falls back to a literal when its env var is unset then signs production cookies with a
  value published in its own source. Reading the repository is the whole attack: forge the cookie,
  and the server accepts any identity. The adopter that surfaced this had two such fallbacks, the
  second written because the first one was a pattern.

  The rules now live in `theokit/server/auth`'s new `inspectSecret`, exported so the same question can
  be asked of a webhook secret or a signing key: a vocabulary of words that appear in strings people
  type and not in generated output, a floor on distinct characters that refuses `aaaa…`, and a
  repeated-block check. The distinct-character floor is 8 rather than 12 on purpose — a real
  `openssl rand -hex 32` carries about 14 with a tail below 12, and a guard that refuses correct input
  is a guard somebody disables.

  **Two behaviour changes to know about:**

  - A production boot with a weak secret now throws where it previously proceeded. That is the point
    of the change, and the message names which rule fired.
  - The error no longer echoes the first 16 characters of the secret. An error message reaches stdout,
    the crash reporter, and everything that aggregates them; the index and the reason identify which
    secret is wrong without publishing half of it.

- cfe7f4c: **`@theokit/sdk@5.x` is now supported, alongside 4.x**
  ([#654](https://github.com/usetheokit/theokit/issues/654)).

  The declared range becomes `^4.52.1 || ^5.0.0` (`^4.49.0 || ^5.0.0` for `@theokit/presenter`), and
  the full suite passes on both halves: 7533 tests against `4.52.1` and 7533 against `5.0.1`.

  This unblocks plugins whose open-ended `@theokit/sdk` peer resolves to 5.x. Until now `theokit` was
  the package that **refused** that resolution — the ERESOLVE named the plugin, but the bound that
  could not be satisfied was this one.

  **What had to change, and why it was not a version bump.** SDK 5.x writes a transcript to
  `${sessionUuidFor(sessionId)}.jsonl` where 4.x wrote `${safeSessionId(sessionId)}.jsonl` — a
  SHA-256 over a namespace, so the filename stopped being the session id and the mapping does not
  invert. `listSessions` derived ids from filenames, so listing, protection, GC and deletion all
  returned UUIDs where callers passed ids. One defect, twenty-nine failing tests.

  The id is now read from the transcript **record**, which the SDK writes on both majors and which is
  authoritative where the name was only a convention. The filename stem remains the fallback, so a
  truncated transcript still appears in a listing rather than dropping out of GC's sight.

  `LiveTranscriptError` — 5.x's new name for `LiveSessionError` — deliberately does not cross the
  `@theokit/agents` layer: it does not exist on the 4.x half, and 5.x keeps the old name working and
  deprecated, so the name that crosses is the one both majors have.

### Patch Changes

- 59d6dcc: A transcript nobody can read is listed without an id, and keeps its protection

  `listSessions` fell back to the filename stem whenever the first record could not be read. Under
  `@theokit/sdk` 5.x that stem is a one-way hash of the id, so the fallback did not return a degraded
  id — it returned an identifier belonging to no session. Session GC keyed protection on it, so a
  session someone had DECLARED protected lost its protection and was planned for deletion, while the
  registry removal was called with the hash and left the real entry behind.

  Protection now runs in the direction that has a function. `transcriptPath(root, cwd, id)` is total on
  both majors and its inverse is not, so protection is keyed by transcript PATH and caller-supplied ids
  are mapped forward onto paths. Whether a transcript can be read stops mattering to whether it is
  protected.

  Breaking, inside the unreleased 13.0.0 line:

  - `SessionSummary.id` is `string | undefined`, alongside a new `idSource: 'transcript' | 'unavailable'`.
    It is never derived from the filename.
  - **`protectedTranscripts` is RENAMED to `protectedTranscriptPaths`, and the rename is the fix.** Its
    keys changed from session ids to transcript paths while the signature stayed `Map<string, string>`,
    so a consumer that mapped the keys forward through `transcriptPath` — correct when they were ids —
    kept compiling and started double-mapping, leaving its protection array matching nothing. Measured
    on a real consumer against this build: `deleteSession` collected a session holding a LIVE writer
    lease. The old name is gone rather than aliased; a silent break that loses data is worse than a
    loud one, and an alias would have preserved the silence. `transcriptOf(id, cwd, root)` maps forward
    for callers that hold an id.
  - `GCCandidate.id`, `GCKept.id` and `GCError.id` admit `undefined` for the same reason.
  - `RunTranscriptGCResult` gains `orphaned` — transcripts collected whose session id could not be
    read, by path. A separate list rather than a second meaning inside `removed`, which answers "which
    sessions did I collect"; `theo sessions gc` reports both, and never prints a filename where an id
    belongs.

  Closes usetheokit/theokit#668.

- 777258c: **`@theokit/studio` is no longer declared as an optional peer dependency.**

  Nothing changes at runtime. `/_studio` still mounts when Studio is installed, still no-ops when it
  is not, and still warns when an installed copy does not export `theokitStudio()`.

  What changes is that this package no longer pins a compatible range for a package it does not
  install. The declaration bought one thing — `npm install` refusing an incompatible pair up front —
  and charged the release train for it:

  > `@theokit/agents@13.0.0-next.0` could not publish. npm resolved this optional peer to the
  > published `@theokit/studio@0.3.0`, whose own peer read `@theokit/agents ">=11.0.0 <13"`, and the
  > install failed `ERESOLVE`.

  The 13 was not even a break. Changesets promotes a peer-dependent to major when a peer takes a minor
  bump, and that changelog carries Minor and Patch sections only. So a dev-only route, in a package
  this repository never installs, held four packages' release hostage to a second repository's release
  cycle.

  The runtime already covers what the declaration promised (`integrate-studio.ts`):

  - **absent** → no `/_studio`, silently, which is the normal case for an app that never asked for it
  - **installed but skewed** → `console.warn` naming the package and telling the reader to check the
    installed version

  That is the same information the peer range carried, delivered at the moment it matters, to the
  person who actually installed Studio.

  **Genuinely lost:** `npm install` no longer refuses an incompatible pair before anything runs.
  Anyone pinning both should read that warning as the contract. The docblock in
  `integrate-studio.ts` records this so the declaration is not re-added without the trade being
  re-made.

- c59abf6: The dev-server integration tests wait until the server accepts

  Two release pull requests failed on `TypeError: fetch failed` in one day. `startDevServer` resolving
  assigns the address; it does not make the listener accept, and the tests read `.address().port` the
  instant the promise settled and connected. `port: 0` sharpens it — the address cannot be pre-checked.

  "Resolved is not ready" is the same sentence this package wrote about a different promise when
  `Agent.delete` resolved having removed nothing.

  `waitForServer` polls until one connection succeeds, and on exhaustion FAILS naming the port and the
  elapsed time, so a genuine boot failure stays distinguishable from a slow one. Not a fixed sleep: a
  sleep turns a race into a slower race and hides it on fast machines.

  Closes usetheokit/theokit#699.

- ecda4ae: The agent-module parameter names what it accepts, so a wrong shape fails at compile time

  `streamAgentTurnInProcess` and `compileAgentModule` took `mod: unknown`, so the contract lived only
  in the runtime guard. A consumer whose producer became `async` handed a `Promise` straight through
  and shipped two releases in which no turn could run — with typecheck, 1213 tests, lint and twelve CI
  checks green. The runtime was never wrong: it refused the Promise and threw a typed error. What
  failed was the moment.

  Both now take `AgentModule`, exported alongside them and re-exported from `theokit/server/agent`.
  The type mirrors the runtime guard rather than the fuller `CompiledAgentOptions` — an array under
  `tools`, an object under `agents` — so it refuses nothing that compiled before.

  `@theokit/tauri/sidecar`'s `runTurnToJsonl` is narrowed too: a desktop sidecar imports its agent
  module statically, which is exactly where a type catches the mistake.

  Entry points that receive a module from a path discovered at runtime keep taking `unknown`, and now
  say so by calling the new `compileLoadedAgentModule`. Their `unknown` has a reason; before this, the
  boundary that had one was indistinguishable from the one that did not.

  Closes usetheokit/theokit#663.

- 5e3e770: **The release guard no longer reports a published package as unpublished**
  ([#652](https://github.com/usetheokit/theokit/issues/652)).

  npm registers a version minutes after `publish` returns — measured 5m04s for
  `@theokit/sdk-cache@1.0.2` on 2026-09-04. `verify-release-published.mjs` read the registry with a
  30s budget, so on any release with several packages it exhausted the budget and printed
  `✗ <pkg>@<version> was NOT published` for packages that had published fine.

  Raising the budget is the wrong knob: one large enough to be correct makes the gate mostly sleep,
  and a six-minute gate is one people cancel.

  **The two failures are distinguishable on the write path, not the read path.** `#366` — the
  credential gone — is `E404 … PUT`, reported by the publish itself, immediately. Registration lag is
  a successful PUT whose GET has not caught up. So `pnpm release` now records what `changeset publish`
  said, and the guard reads it: a package the publish errored on fails the release naming that cause;
  a package the publish wrote and the registry has not shown yet is reported as pending, not as a
  failure; a package the publish never attempted is still the `#366` empty green and still fails.

  Absence of a log never becomes success — it is reported as unconfirmed.

- a2d5cd3: **The root release record now names every version that was cut, including releases nobody wrote
  prose for** ([#656](https://github.com/usetheokit/theokit/issues/656)).

  `record-root-changelog.mjs` returned early whenever `## [Unreleased]` was empty, so a second
  `changeset version` run — one whose prose the previous cut had already drained — bumped packages
  and left the root record silent about them. `check-changelog-current.mjs` then failed, hours later,
  attached to whichever unrelated pull request happened to run CI next.

  The two scripts disagreed about what silence means: one treated an empty `[Unreleased]` as nothing
  to do, the other treats an unnamed release as a defect. The heading settles it — the gate matches
  on the heading naming the version and never on the body.

  **The rule that prose is moved and never invented is unchanged.** A heading is a fact about what
  was cut and when; a change description is a claim about what changed, and stays the human's to
  write. A release with no entry gets its heading plus a pointer to the per-package changelogs, not a
  generated `### Added`.

- Updated dependencies [1202e86]
- Updated dependencies [c59abf6]
- Updated dependencies [bb0f451]
- Updated dependencies [9725bf1]
- Updated dependencies [dcb461f]
- Updated dependencies [ca44ee7]
- Updated dependencies [dcb461f]
- Updated dependencies [6b07960]
- Updated dependencies [a7e35bb]
- Updated dependencies [dcb461f]
- Updated dependencies [9725bf1]
- Updated dependencies [dcb461f]
- Updated dependencies [5211721]
- Updated dependencies [dcb461f]
- Updated dependencies [dcb461f]
- Updated dependencies [ac29eff]
- Updated dependencies [1202e86]
- Updated dependencies [1202e86]
- Updated dependencies [1202e86]
- Updated dependencies [1202e86]
- Updated dependencies [1202e86]
- Updated dependencies [1202e86]
- Updated dependencies [98b2565]
- Updated dependencies [9725bf1]
- Updated dependencies [59d6dcc]
- Updated dependencies [feb5781]
- Updated dependencies [e7a4d65]
- Updated dependencies [fe8a0c6]
- Updated dependencies [2bc5d84]
- Updated dependencies [2bc27d3]
- Updated dependencies [dcb461f]
- Updated dependencies [eaac7b0]
- Updated dependencies [1202e86]
- Updated dependencies [ec899f4]
- Updated dependencies [dcb461f]
- Updated dependencies [019f828]
- Updated dependencies [9b5da86]
- Updated dependencies [dcb461f]
- Updated dependencies [e4f2e78]
- Updated dependencies [6ca2f50]
- Updated dependencies [a7f4d3d]
- Updated dependencies [1202e86]
- Updated dependencies [dcb461f]
- Updated dependencies [0ed0d96]
- Updated dependencies [dcb461f]
- Updated dependencies [a2b0a59]
- Updated dependencies [462bb62]
- Updated dependencies [ecda4ae]
- Updated dependencies [9915c19]
- Updated dependencies [5451233]
- Updated dependencies [cfe7f4c]
- Updated dependencies [0731584]
  - @theokit/agents@13.0.0
  - @theokit/http@2.1.0
  - @theokit/presenter@0.9.0

## 0.65.0-next.5

### Patch Changes

- c59abf6: The dev-server integration tests wait until the server accepts

  Two release pull requests failed on `TypeError: fetch failed` in one day. `startDevServer` resolving
  assigns the address; it does not make the listener accept, and the tests read `.address().port` the
  instant the promise settled and connected. `port: 0` sharpens it — the address cannot be pre-checked.

  "Resolved is not ready" is the same sentence this package wrote about a different promise when
  `Agent.delete` resolved having removed nothing.

  `waitForServer` polls until one connection succeeds, and on exhaustion FAILS naming the port and the
  elapsed time, so a genuine boot failure stays distinguishable from a slow one. Not a fixed sleep: a
  sleep turns a race into a slower race and hides it on fast machines.

  Closes usetheokit/theokit#699.

- Updated dependencies [c59abf6]
  - @theokit/agents@13.0.0-next.9

## 0.65.0-next.4

### Patch Changes

- 59d6dcc: A transcript nobody can read is listed without an id, and keeps its protection

  `listSessions` fell back to the filename stem whenever the first record could not be read. Under
  `@theokit/sdk` 5.x that stem is a one-way hash of the id, so the fallback did not return a degraded
  id — it returned an identifier belonging to no session. Session GC keyed protection on it, so a
  session someone had DECLARED protected lost its protection and was planned for deletion, while the
  registry removal was called with the hash and left the real entry behind.

  Protection now runs in the direction that has a function. `transcriptPath(root, cwd, id)` is total on
  both majors and its inverse is not, so protection is keyed by transcript PATH and caller-supplied ids
  are mapped forward onto paths. Whether a transcript can be read stops mattering to whether it is
  protected.

  Breaking, inside the unreleased 13.0.0 line:

  - `SessionSummary.id` is `string | undefined`, alongside a new `idSource: 'transcript' | 'unavailable'`.
    It is never derived from the filename.
  - **`protectedTranscripts` is RENAMED to `protectedTranscriptPaths`, and the rename is the fix.** Its
    keys changed from session ids to transcript paths while the signature stayed `Map<string, string>`,
    so a consumer that mapped the keys forward through `transcriptPath` — correct when they were ids —
    kept compiling and started double-mapping, leaving its protection array matching nothing. Measured
    on a real consumer against this build: `deleteSession` collected a session holding a LIVE writer
    lease. The old name is gone rather than aliased; a silent break that loses data is worse than a
    loud one, and an alias would have preserved the silence. `transcriptOf(id, cwd, root)` maps forward
    for callers that hold an id.
  - `GCCandidate.id`, `GCKept.id` and `GCError.id` admit `undefined` for the same reason.
  - `RunTranscriptGCResult` gains `orphaned` — transcripts collected whose session id could not be
    read, by path. A separate list rather than a second meaning inside `removed`, which answers "which
    sessions did I collect"; `theo sessions gc` reports both, and never prints a filename where an id
    belongs.

  Closes usetheokit/theokit#668.

- Updated dependencies [59d6dcc]
  - @theokit/agents@13.0.0-next.3

## 0.65.0-next.3

### Patch Changes

- ecda4ae: The agent-module parameter names what it accepts, so a wrong shape fails at compile time

  `streamAgentTurnInProcess` and `compileAgentModule` took `mod: unknown`, so the contract lived only
  in the runtime guard. A consumer whose producer became `async` handed a `Promise` straight through
  and shipped two releases in which no turn could run — with typecheck, 1213 tests, lint and twelve CI
  checks green. The runtime was never wrong: it refused the Promise and threw a typed error. What
  failed was the moment.

  Both now take `AgentModule`, exported alongside them and re-exported from `theokit/server/agent`.
  The type mirrors the runtime guard rather than the fuller `CompiledAgentOptions` — an array under
  `tools`, an object under `agents` — so it refuses nothing that compiled before.

  `@theokit/tauri/sidecar`'s `runTurnToJsonl` is narrowed too: a desktop sidecar imports its agent
  module statically, which is exactly where a type catches the mistake.

  Entry points that receive a module from a path discovered at runtime keep taking `unknown`, and now
  say so by calling the new `compileLoadedAgentModule`. Their `unknown` has a reason; before this, the
  boundary that had one was indistinguishable from the one that did not.

  Closes usetheokit/theokit#663.

- Updated dependencies [ecda4ae]
  - @theokit/agents@13.0.0-next.2

## 0.65.0-next.2

### Minor Changes

- cfe7f4c: **`@theokit/sdk@5.x` is now supported, alongside 4.x**
  ([#654](https://github.com/usetheokit/theokit/issues/654)).

  The declared range becomes `^4.52.1 || ^5.0.0` (`^4.49.0 || ^5.0.0` for `@theokit/presenter`), and
  the full suite passes on both halves: 7533 tests against `4.52.1` and 7533 against `5.0.1`.

  This unblocks plugins whose open-ended `@theokit/sdk` peer resolves to 5.x. Until now `theokit` was
  the package that **refused** that resolution — the ERESOLVE named the plugin, but the bound that
  could not be satisfied was this one.

  **What had to change, and why it was not a version bump.** SDK 5.x writes a transcript to
  `${sessionUuidFor(sessionId)}.jsonl` where 4.x wrote `${safeSessionId(sessionId)}.jsonl` — a
  SHA-256 over a namespace, so the filename stopped being the session id and the mapping does not
  invert. `listSessions` derived ids from filenames, so listing, protection, GC and deletion all
  returned UUIDs where callers passed ids. One defect, twenty-nine failing tests.

  The id is now read from the transcript **record**, which the SDK writes on both majors and which is
  authoritative where the name was only a convention. The filename stem remains the fallback, so a
  truncated transcript still appears in a listing rather than dropping out of GC's sight.

  `LiveTranscriptError` — 5.x's new name for `LiveSessionError` — deliberately does not cross the
  `@theokit/agents` layer: it does not exist on the 4.x half, and 5.x keeps the old name working and
  deprecated, so the name that crosses is the one both majors have.

### Patch Changes

- 5e3e770: **The release guard no longer reports a published package as unpublished**
  ([#652](https://github.com/usetheokit/theokit/issues/652)).

  npm registers a version minutes after `publish` returns — measured 5m04s for
  `@theokit/sdk-cache@1.0.2` on 2026-09-04. `verify-release-published.mjs` read the registry with a
  30s budget, so on any release with several packages it exhausted the budget and printed
  `✗ <pkg>@<version> was NOT published` for packages that had published fine.

  Raising the budget is the wrong knob: one large enough to be correct makes the gate mostly sleep,
  and a six-minute gate is one people cancel.

  **The two failures are distinguishable on the write path, not the read path.** `#366` — the
  credential gone — is `E404 … PUT`, reported by the publish itself, immediately. Registration lag is
  a successful PUT whose GET has not caught up. So `pnpm release` now records what `changeset publish`
  said, and the guard reads it: a package the publish errored on fails the release naming that cause;
  a package the publish wrote and the registry has not shown yet is reported as pending, not as a
  failure; a package the publish never attempted is still the `#366` empty green and still fails.

  Absence of a log never becomes success — it is reported as unconfirmed.

- a2d5cd3: **The root release record now names every version that was cut, including releases nobody wrote
  prose for** ([#656](https://github.com/usetheokit/theokit/issues/656)).

  `record-root-changelog.mjs` returned early whenever `## [Unreleased]` was empty, so a second
  `changeset version` run — one whose prose the previous cut had already drained — bumped packages
  and left the root record silent about them. `check-changelog-current.mjs` then failed, hours later,
  attached to whichever unrelated pull request happened to run CI next.

  The two scripts disagreed about what silence means: one treated an empty `[Unreleased]` as nothing
  to do, the other treats an unnamed release as a defect. The heading settles it — the gate matches
  on the heading naming the version and never on the body.

  **The rule that prose is moved and never invented is unchanged.** A heading is a fact about what
  was cut and when; a change description is a claim about what changed, and stays the human's to
  write. A release with no entry gets its heading plus a pointer to the per-package changelogs, not a
  generated `### Added`.

- Updated dependencies [e7a4d65]
- Updated dependencies [cfe7f4c]
  - @theokit/agents@13.0.0-next.1
  - @theokit/presenter@0.9.0-next.0

## 0.65.0-next.1

### Minor Changes

- 4709eec: **`escapeHtml` is exported, and says which context it is safe in** (#611).

  The framework had the function, kept it private inside the OpenAPI docs renderer, and an adopter
  building an HTML e-mail body wrote it again — same four characters, same order, same omission of
  `'`. Neither escaped the apostrophe, and neither had to: both call sites interpolate into text
  content, where four characters are enough. They were right by luck rather than by having been told,
  and the caveat is the part that does not survive being re-derived.

  `theokit/server/security` now exports two functions with two names, so the decision is visible where
  the interpolation happens:

  ```ts
  import { escapeHtml, escapeHtmlAttribute } from 'theokit/server/security'
  ;`<title>${escapeHtml(title)}</title>` // text content
  `<a href='${escapeHtmlAttribute(url)}'>` // quoted attribute — escapes ' and ` too
  ```

  Both run as a single character-class pass, which also removes the ordering hazard the chained
  `.replace()` idiom carries: run the ampersand last and `<` has already become `&lt;`, which the
  ampersand pass then turns into `&amp;lt;`. The docs renderer consumes them instead of carrying its
  own copy.

  Same shape as #574 (`@Public()`, `Authenticated()`): the framework owns the primitive, so it owns
  the caveat with it.

- 9b5da86: **A controller route can name a rate limit, and a guard can refuse with 429** (#612).

  `theokit/server/rate-limit` exported a complete limiter and nothing a `@Controller` route could use,
  so every app wrote the adapter — the third instance of a pattern whose first two shipped as
  `@Public()` and `Authenticated()` (#574). The hand-written adapter could not be correct, for two
  reasons that were not the author's fault:

  - **A guard could not answer 429.** `canActivate` returns a boolean, so a refused caller received
    `403 Forbidden resource` and the `X-RateLimit-*` the limiter had just computed were discarded —
    a guard owns no response to attach them to. "You are not allowed" and "you are allowed, later"
    read identically, and a well-behaved client had nothing to back off on.
  - **The intuitive alternative was silently inert.** A `preHandler` plugin enforced nothing on
    controller routes (#607, fixed in the same line of work) while reading exactly like protection.

  **`theokit/server/rate-limit` now exports `RateLimited`:**

  ```ts
  @Post('stt')
  @UseGuards(Authenticated(sessions), RateLimited({ max: 20, windowMs: 60_000 }))
  transcribe() { ... }
  ```

  A refused caller gets `429` with `Retry-After`, `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
  `scope: 'shared'` pools several routes into one budget, which is what an app capping endpoints that
  bill a third party per call actually wants. The constructor **throws** on a configuration that
  cannot tell callers apart — `keyBy: 'ip'` with no `trustProxy` and no `identify` — because a Web
  `Request` has no socket address, and accepting it would put every visitor in one bucket: a limiter
  that refuses the whole internet after N requests while reading as protection until it does. It does
  not attach `X-RateLimit-*` to allowed responses, and says so in its docblock rather than shipping a
  header that appears under one dispatcher and vanishes under another.

  **`@theokit/http`:**

  - `HttpException` accepts and carries `headers`, and every dispatcher renders them through one
    `httpExceptionToResponse` instead of four hand-built `new Response(...)` calls. `429` without
    `Retry-After`, `401` without `WWW-Authenticate` and `405` without `Allow` are all half an answer.
  - The guard pipeline is one `runGuards` shared by `TheoApp`, `createDecoratorHandler` and the
    TheoKit plugin, instead of four copies — the arrangement #576 already paid for once. A guard
    throwing an `HttpException` now reaches the client with its status and headers on all three, agent
    routes included, where the exception previously escaped the dispatcher entirely.
  - The published types say these exceptions are `Error`s again. `tsup` had been erasing the
    inheritance into an anonymous structural type, so an app writing `throw new UnauthorizedException()`
    tripped `@typescript-eslint/only-throw-error` against the framework's own exceptions — and the
    lint was right about what the `.d.ts` claimed.

- d2b5413: **A session secret that looks like a placeholder no longer boots in production** (#610).

  `assertProductionSecret` reached both session constructors already (#429's half of the fix) and
  still admitted every placeholder an adopter actually writes. Its whole vocabulary was
  `/CHANGE_ME|demo[-_]|placeholder/i`, so the 32-character floor was the only condition that ever
  fired — and a placeholder long enough to clear that floor is exactly what a developer produces when
  the error message asks for 32 characters. Measured against `theokit@0.64.0` with
  `NODE_ENV=production`, all five of these started a server:

  ```
  ACCEPTED  "dev-only-session-secret-32-chars-min-xxxx"   ← a real app's fallback
  ACCEPTED  "changemexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"    ← the pattern wants CHANGE_ME, not changeme
  ACCEPTED  "devxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  ACCEPTED  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"    ← forty identical characters
  ACCEPTED  "test-secret00000000000000000000000000000"
  ```

  An app that falls back to a literal when its env var is unset then signs production cookies with a
  value published in its own source. Reading the repository is the whole attack: forge the cookie,
  and the server accepts any identity. The adopter that surfaced this had two such fallbacks, the
  second written because the first one was a pattern.

  The rules now live in `theokit/server/auth`'s new `inspectSecret`, exported so the same question can
  be asked of a webhook secret or a signing key: a vocabulary of words that appear in strings people
  type and not in generated output, a floor on distinct characters that refuses `aaaa…`, and a
  repeated-block check. The distinct-character floor is 8 rather than 12 on purpose — a real
  `openssl rand -hex 32` carries about 14 with a tail below 12, and a guard that refuses correct input
  is a guard somebody disables.

  **Two behaviour changes to know about:**

  - A production boot with a weak secret now throws where it previously proceeded. That is the point
    of the change, and the message names which rule fired.
  - The error no longer echoes the first 16 characters of the secret. An error message reaches stdout,
    the crash reporter, and everything that aggregates them; the index and the reason identify which
    secret is wrong without publishing half of it.

### Patch Changes

- 777258c: **`@theokit/studio` is no longer declared as an optional peer dependency.**

  Nothing changes at runtime. `/_studio` still mounts when Studio is installed, still no-ops when it
  is not, and still warns when an installed copy does not export `theokitStudio()`.

  What changes is that this package no longer pins a compatible range for a package it does not
  install. The declaration bought one thing — `npm install` refusing an incompatible pair up front —
  and charged the release train for it:

  > `@theokit/agents@13.0.0-next.0` could not publish. npm resolved this optional peer to the
  > published `@theokit/studio@0.3.0`, whose own peer read `@theokit/agents ">=11.0.0 <13"`, and the
  > install failed `ERESOLVE`.

  The 13 was not even a break. Changesets promotes a peer-dependent to major when a peer takes a minor
  bump, and that changelog carries Minor and Patch sections only. So a dev-only route, in a package
  this repository never installs, held four packages' release hostage to a second repository's release
  cycle.

  The runtime already covers what the declaration promised (`integrate-studio.ts`):

  - **absent** → no `/_studio`, silently, which is the normal case for an app that never asked for it
  - **installed but skewed** → `console.warn` naming the package and telling the reader to check the
    installed version

  That is the same information the peer range carried, delivered at the moment it matters, to the
  person who actually installed Studio.

  **Genuinely lost:** `npm install` no longer refuses an incompatible pair before anything runs.
  Anyone pinning both should read that warning as the contract. The docblock in
  `integrate-studio.ts` records this so the declaration is not re-added without the trade being
  re-made.

- Updated dependencies [fe8a0c6]
- Updated dependencies [9b5da86]
  - @theokit/agents@13.0.0-next.0
  - @theokit/http@2.1.0-next.0

## 0.65.0-next.0

### Minor Changes

- 8333525: **A `@Controller` route runs the plugin lifecycle** (#607).

  `dispatchControllerRequest` had no parameter for a plugin runner, so neither of its two callers
  could pass one. A controller route therefore ran no hook at all under `theokit start` — not
  `onRequest`, not `preHandler`, not `onResponse`, not `onError` — and under `theokit dev` only the
  `onRequest` the middleware happened to fire before matching, which reached controllers by accident
  rather than by design.

  Measured against a real adopter: its identity plugin had never run, so `ctx.subject` was never
  populated, while the boot log reported the plugin registered. Nobody noticed because the app's
  guards read the session from the `Request` directly. An app using `.policy(({ subject }) => …)` on
  a controller route would have been refusing every caller instead. The same app then added rate
  limiting to three routes that bill a third party per call, wrote it as a `preHandler`, and it
  enforced nothing while reading exactly like protection.

  **`onRequest` fires once per request in `theokit dev`, not twice** (#609).

  The dev middleware called `runOnRequest` before matching a route, and `executeRoute` called it
  again for the route it matched. Nothing deduped them, so every matched file route fired `onRequest`
  twice in dev and once under `theokit start`. Anything a hook counted, billed, audited or traced was
  doubled on the surface nobody instruments and correct on the one that ships.

  The pre-match call still exists, and still does the job it was added for — letting a plugin serve a
  path no route owns, such as `@theokit/plugin-openapi` on `/api/docs`. It has moved to the end of
  that arm, so it runs only when neither a file route nor a controller owns the request.

  Both defects had one cause: the dev middleware had a second, uncoordinated entry into the
  lifecycle, and the controller path had none. Fixing either alone makes the other worse, which is
  why they ship together.

  **What this changes for an existing app.** A `preHandler` that short-circuits now applies to
  controller routes, where it previously did not. If a hook was written expecting to govern only file
  routes, it now governs both — which is the contract as documented, and may refuse traffic the app
  was serving. A hook whose side effect was tuned around the doubled dev count will now see half as
  many in dev, matching what production always reported.

  Hooks still cannot reach a controller handler's arguments: a controller method receives its inputs
  through parameter decorators, so a decoration written onto the plugin `ctx` has no seam to arrive
  through. Only file routes read `ctx`. That limit is unchanged by this fix and is not what either
  issue reported.

## 0.64.0

### Minor Changes

- 0d8bfee: **An undeclared route is refused instead of served, in every dispatcher** (#576).

  A controller or agent route that declares neither a guard nor an explicit "open on purpose" now
  answers 403. `undeclaredRoutes` defaulted to `'warn'` in `@theokit/http@1.2.0`, which served the
  request and logged a line promising this change; a safe default an app has to switch on protects
  only the apps that were already reading their logs.

  The check also reached one dispatcher out of three. `@theokit/http` ships `TheoApp`,
  `createDecoratorHandler` and `httpDecoratorsPlugin` over the same route metadata, and the framework's
  own controller dispatch — `theokit dev`, `theokit start` — reuses `createDecoratorHandler`, which
  looked at the question nowhere. The decision is computed once now, on the metadata walk
  (`WalkResult.access`), so a fourth dispatcher cannot ship without it.

  `@UseGuards()` with no arguments no longer counts as a declaration, at dispatch or at build. It
  named nobody who decides while reading as guarded, and the two gates disagreed about it: the build
  passed and the request was served unguarded.

  Migration: `@Public()` for a route anyone may call, `@UseGuards(...)` for one someone decides,
  `access: 'public'` / `guards: [...]` on an agent entry. `undeclaredRoutes: 'warn'` restores the
  previous behaviour per app while you migrate. Full guide in `MIGRATION.md`.

  **`Authenticated(sessions)` — the guard every app was writing by hand** (#574).

  `theokit/server/auth` now exports the controller equivalent of
  `.policy(({ subject }) => subject !== null)`. Measured in the first real adopter: 8 controllers, 6
  copies of a 22-line `AuthGuard`, and the first version of that class read the subject off the guard's
  `ExecutionContext` — which carries no subject — so it denied everyone and passed the only test aimed
  at it, because that test asserted an unauthenticated request is refused.

### Patch Changes

- Updated dependencies [0d8bfee]
  - @theokit/http@2.0.0

## 0.63.1

### Patch Changes

- bcfbf8e: Deploy adapters emit the project's configured `serverDir` instead of the literal `server`.

  `bun`, `cloudflare`, `vercel` and `aws-lambda` each generated an entrypoint containing
  `resolve(cwd, 'server')` while receiving the full config as an argument — the value was in hand and
  unused. Any project that set `serverDir` (the entire point of the option) got a bundle resolving a
  directory that is not there, and only found out after deploy: the build succeeds, the artifact is
  written, and routes 404 in production with nothing in the log naming the cause.

  The directory is now emitted through one shared helper that quotes it with `JSON.stringify`, so a
  path containing a space, a quote or a backslash cannot turn a generated file into a syntax error in
  someone else's build. Projects that never set the option are unaffected — the fallback is still
  `server`.

- 22045b0: `stripe.ts` no longer ends in a dead constant justified by a comment that was not true of it.

  `const __stripeInternalEnc = enc` was described as a re-export that kept `enc` from being an orphan
  and pre-warmed a decoder. It was not exported, `enc` already had a consumer one function above, and
  assigning a binding to another name runs no code. Nothing read it, in source or in the built
  output. The cost was never the byte: a false rationale is more expensive to remove than none, which
  is how it survived several passes over the file.

- 5c2781b: Webhook validators refuse an unusable credential instead of throwing, misreporting, or — in one
  case — accepting.

  `line({ channelSecret: '' })` raised `DataError: Zero-length key is not supported` from inside
  WebCrypto's `importKey`, which is what one unset environment variable produces at the natural call
  site `process.env.LINE_CHANNEL_SECRET ?? ''`. The throw escapes `handleChannelWebhook` as a 500,
  past the 401 branch written to say why a delivery was refused, and the operator gets a crypto error
  naming neither the variable nor the platform.

  Applying the same lens to every validator in the directory found two further shapes. An empty
  rotation list (`{ channelSecret: [] }`) answered `signature mismatch` after comparing against
  nothing, which sends the reader to look at the sender's signature rather than at their own
  configuration. And `whatsappSubscribe({ verifyToken: '' })` **accepted** a caller presenting an
  empty `hub.verify_token`, completing the subscribe handshake for anybody who asked — the verify
  token is the only credential on that request, so that one was an authentication bypass rather than
  a diagnostic problem.

  All eight validators now refuse a configuration that cannot verify anything, through one shared
  decision, with a reason that names the option the operator has to set. A half-configured rotation
  (`['current', '']`) refuses rather than quietly verifying with the secret that is set — otherwise
  the mistake surfaces on the day the remaining secret is retired, in production, against all
  traffic.

## 0.63.0

### Minor Changes

- 0f788df: `line({ channelSecret })` — LINE webhooks are servable through `handleChannelWebhook`.

  `server/webhook` shipped validators for six platforms and LINE was not one of them, while
  `@theokit/gateway-line` already published the primitive. Neither package was wrong on its own —
  nothing joined them, so every app that wanted LINE wrote the bridge itself. Measured in a real
  consumer: 19 non-comment lines, reimplementing two details that are easy to get wrong and expensive
  to debug.

  **The body is signed as bytes.** A parsed-and-restringified body hashes differently and rejects
  every correct delivery. `handleChannelWebhook` hands a validator a `clone()` precisely so the raw
  bytes survive, but an app writing its own has to know that unprompted (same defect as #534, #556).

  **It is base64, not hex.** A reader who copies the GitHub or WhatsApp validator — same algorithm,
  same body, same secret — produces a hex digest and gets a 401 indistinguishable from a wrong channel
  secret.

  `channelSecret` accepts an array, so a rotation is an overlap rather than an outage.

  This adds a named helper, not a gate: `validators` is `Record<string, VerifyFn>` and always accepted
  a hand-written one — unlike the closed provider registry of #579/#585, which refused what it did not
  name. Teams, SMS, Matrix and Mattermost are in the same position and are not addressed here; LINE is
  the one measured against a working consumer.

  Internally, the HMAC-SHA256-over-raw-body core now has one implementation shared by all three
  schemes (`hub-signature-256` moved onto it), so the constant-time compare and the no-early-return
  secret loop live in one place rather than three.

## 0.62.1

### Patch Changes

- 2b9e912: A provider whose catalog says it needs no credential no longer demands one.

  #579 opened the SDK's 45 builtins to a model id, and derived the credential env var from
  `profile.envVars[0]` whenever that array was non-empty — treating _"an env var is named"_ as _"a key
  is required"_. Those are different claims, and `authType` answers the second. The SDK declares both
  on the same profile:

  ```
  { name: 'lmstudio', envVars: ['LMSTUDIO_API_KEY'], authType: 'none' }
  ```

  so a local model server was refused for want of a variable with nothing behind it — and setting it
  to any string satisfied the gate, because there is nothing to authenticate against (#585). Three of
  the 45 builtins are in that class: `ollama`, `lmstudio`, `llamacpp`. `ollama` escaped only because
  this project's own registry entry wins before the plugin path is reached, which is why #407's
  keyless handling did not cover the other two — it was written for a registry of four.

  `envVars[0]` remains the credential whenever the profile actually authenticates by one, and a
  profile carrying no `authType` keeps the previous rule and requires the named variable: reading an
  absent field as "keyless" would be the permissive reading of a silence.

## 0.62.0

### Minor Changes

- 0c1132b: Two issues I had closed as "not fixable from this side". Both were fixable; I had stopped measuring
  too early.

  **An SDK builtin provider is now reachable (#579).** An app calling `.plugins(Provider.builtins())`
  and then `.model('openai-chatgpt/gpt-5.4')` got a 500: _"declares provider `openai-chatgpt`, which
  is not registered"_. The refusal itself is right — #503 made an unregistered prefix a refusal so a
  turn could not silently succeed against a provider nobody named — but it consulted only this
  project's four-entry literal, and `registerProvider` is called nowhere in the product. The SDK ships
  44 builtins and a `Provider.forModel(modelId)` whose own docblock names the theokit agent server as
  the runtime that "does NOT share this registry". The seam was declared on one side and consumed on
  neither. The resolver now asks the SDK **after** its own registry misses, so a declared entry keeps
  its own env key, priority and `baseUrl`. A profile naming no env var (Codex authenticates by OAuth,
  refreshed per request inside the profile's own transform) resolves keyless, the same class the
  `ollama` entry has occupied since #407. A prefix neither source knows is still refused.

  **Durable memory no longer lands wherever the process was started (#557, partial).** At the declared
  floor (`@theokit/sdk@^4.52.1`) the memory root is `resolve(memoryDir(opts.cwd))`, and `mount-agent`
  passed a `cwd` only when the agent opted into file-based config — while `resolveDiscoveryCwd`'s own
  docblock records that `process.cwd()` "is not guaranteed to be the app root". An agent with memory
  enabled now names the resolved app root, so the location stops depending on where the operator
  happened to `cd`. This does **not** relocate memory on SDK >= 4.61, where the root is derived from
  `local.baseDir` — one field governing both the transcript and the memory, tracked as
  `usetheokit/theokit-sdk#463`.

## 0.61.0

### Minor Changes

- 6cee319: Two authoring surfaces stop making consumers write framework internals by hand.

  **`@Public()`** (`@theokit/http`) — since #514 every controller route must declare an access
  decision, so this sits on the critical path of every route an adopter writes. The route builder says
  `.policy('public')`; a controller had to say `@SetMetadata('theokit:public', true)`, copying the
  framework's metadata key into app source from a build-time module no entry point reaches. Measured in
  the first real adopter: 8 controllers, 6 copies of that string. `PUBLIC_ROUTE_METADATA` is exported
  with it, so one importable definition replaces a key that could not be changed without a coordinated
  edit in every app. `SetMetadata` stays for anything custom, and this does not make controllers a
  second policy engine — `.policy()` remains the richer surface.

  **Plugin authoring types** (`theokit/server/define`) — `TheoPlugin`, `PluginContext`,
  `PluginErrorContext` and the four hook signatures existed and were unexported, so an app writing a
  plugin could not name the shape of its own subject and declared structural copies instead. Those
  compile, and go on compiling after the framework's shape changes, until something fails at runtime.

  **`subjectFromContext` fails loudly** — given a controller guard's `ExecutionContext` it used to
  answer `null`, which is indistinguishable from "anonymous caller", so a guard written on it denied
  everyone and passed the only test aimed at it. It now throws and names the alternative. An anonymous
  run-context still answers `null`, and a context carrying both a subject and `getRequest` still
  resolves — the absence is the trigger, not the shape.

### Patch Changes

- f55cd1b: A route that declared no access decision is now distinguishable from one declared open, and can be
  refused.

  `guards: []` meant two things at once (#576) — _"open on purpose"_ and _"nobody said"_ — and the
  dispatcher, unable to tell them apart, took the permissive reading. For controllers that was safe
  only while a separate build gate (#514) refused undeclared controller routes, which makes least
  privilege a property of the **pipeline** rather than of the system; `@theokit/http` is published on
  its own, so reaching the dispatcher without that build is an ordinary way to use it. Agent routes
  had neither gate: they are auto-wired, dispatched before everything else, and a capability-authored
  agent has no class to hang `@UseGuards` on, so `guards` was `undefined` → `?? []` → served.

  - `AgentAppEntry.access?: 'public' | 'guarded'` makes the decision explicit. A non-empty `guards`
    still counts as a declaration, so nothing that already guards its routes has to re-declare it.
  - Every undeclared route warns **once at mount**, naming the route and the remedy for its own
    surface (`access: 'public'` for an agent entry, `@Public()` for a controller).
  - `TheoAppOptions.undeclaredRoutes: 'warn' | 'deny'` — `'deny'` answers 403 instead.

  **The default is `'warn'`, and that is deliberate.** Flipping it here would break every app whose
  agent endpoints are open today — precisely the population this issue is about — inside a non-major
  release. It becomes `'deny'` in the next major; `'deny'` is available now for anyone who wants the
  property before then.

  `emit-controllers` now imports `PUBLIC_ROUTE_METADATA` from `@theokit/http` instead of redeclaring
  it, and its refusal message teaches `@Public()` rather than the raw `@SetMetadata` string.

- Updated dependencies [98b4f83]
- Updated dependencies [6cee319]
- Updated dependencies [f55cd1b]
  - @theokit/http@1.2.0

## 0.60.0

### Minor Changes

- 55e3270: `theo.config.ts` can now allow the hostnames the dev server answers for: `allowedHosts`.

  A theokit app in dev refused every request whose `Host` was not loopback, and nothing in the config
  could allow another one — which made it impossible to put the dev server behind a tunnel or a
  reverse proxy. That is the only practical way to develop against a webhook platform, since the
  platform has to reach the machine, and this framework ships signature validators for five of them.

  Vite's own error message names the fix and the fix was unreachable: a scaffolded app has no
  `vite.config.ts` — `theokit dev` owns the Vite server. `host()` never answered it either, being the
  bind ADDRESS: the request is refused by hostname, after the connection is accepted.

      export default config().allowedHosts(['.trycloudflare.com']).build()

  Vite's matching rules apply rather than globs — a leading dot covers the domain and its subdomains,
  anything else compares literally. `true` disables the check, for a tunnel that mints a fresh
  hostname per run; it also removes the DNS-rebinding protection the check provides, so prefer the
  list whenever the hostname is knowable. Dev-server only: `theokit start` has no such check.

- 97166a4: WhatsApp can be served through `handleChannelWebhook`.

  The channel seam could not serve the one platform `@theokit/gateway-whatsapp` exists for, for two
  independent reasons. `theokit/server/webhook` exported `stripe`, `github`, `slack`, `telegram` and
  `discord`, so a `validators` map with no `whatsapp` entry made the path answer 404 by construction.
  And Meta verifies an endpoint before it delivers anything — a `GET` carrying `hub.mode=subscribe`,
  `hub.verify_token` and `hub.challenge`, with the challenge echoed back as `text/plain` — which was
  not modelled, so an app had to add a route of its own regardless.

  Both halves close:

  - `whatsapp({ appSecret })` verifies `X-Hub-Signature-256` — HMAC-SHA256 over the RAW body, which is
    the sharp edge a hand-rolled version gets wrong: hashing a parsed-and-restringified body compares
    different bytes and rejects correct requests.
  - `whatsappSubscribe({ verifyToken })` answers the handshake, through a new per-platform `subscribe`
    map on `ChannelWebhookConfig`. Per-platform rather than a bare `verifyToken`, because the query
    shape is Meta's — shared with Instagram and Messenger, not universal. A `GET` on a platform that
    declared no responder answers 405, not 404: the platform is configured, it just does not do
    handshakes.

  The signature scheme is the one GitHub already used — same header, same construction — so `github`
  and `whatsapp` now share one implementation instead of two copies of a constant-time comparison,
  a hex decoder and a rotation loop.

  Nothing about the POST path changed, and its tests assert so.

### Patch Changes

- ae182f1: The default CSP now declares `media-src 'self' data: blob:`.

  It was absent, so `<audio>` and `<video>` fell back to `default-src 'self'` and a `blob:` URL was
  blocked. Not hypothetical: `@theokit/plugin-voice` returns `audio/mpeg` from `/api/voice/tts`, and
  the obvious way to play it — `URL.createObjectURL(new Blob([bytes]))` — was refused by the browser:

      Loading media from 'blob:…' violates "default-src 'self'". Note that 'media-src' was not
      explicitly set, so 'default-src' is used as a fallback.

  `img-src` already listed `blob:` for canvas exports. Someone thought about images generated in
  memory and not about audio; the same reasoning covers both.

- db29ca0: An OpenRouter-only setup runs the scaffold out of the box.

  A fresh app given only the key `.env.example` asks for answered 500 on its first message. The
  generated agent declared `openai/gpt-4o-mini`; the first segment of a model id selects the provider,
  so that id needs `OPENAI_API_KEY` — the one key the user was never told to get. The scaffold's own
  docblock promised the opposite, that the prefix let OpenRouter route the model upstream.

  Measured against `@theokit/sdk`'s provider catalog, it does not: `openai/gpt-4o-mini` resolves to
  `api.openai.com`, and only `openrouter/openai/gpt-4o-mini` resolves to `openrouter.ai`. The gateway
  has to be named in the id.

  So the scaffold declares `openrouter/openai/gpt-4o-mini`, matching the key it asks for, and its docs
  say what the prefix actually does. A test in `create-theokit` now pins the invariant: the key
  `.env.example` leaves uncommented must be the key the declared models need.

  The resolver still refuses rather than substituting a credential it happens to find — every caller
  takes its `apiKey` and discards its `baseUrl`, so a substituted key reaches whatever endpoint the
  model id names, which is the unattributable `401` of #326. What changed is that the refusal is now
  actionable: when a credentialed gateway could serve the model, the message names the exact
  gateway-prefixed id instead of only the variable that is missing.

## 0.59.0

### Minor Changes

- 8917e03: Accept `react-router` 8: the peer range widens from `^7.0.0` to `^7.0.0 || ^8.0.0`.

  The pin was aged, not a constraint. Every symbol theokit imports — `Link`, `Outlet`,
  `ScrollRestoration`, `createBrowserRouter`, `RouterProvider`, `matchRoutes`, `createStaticHandler`,
  `createStaticRouter`, `StaticRouterProvider`, `useLocation` — exists in 8.3.0, and the full suite
  passes against it with the same numbers as against 7: 7242 passed, 18 skipped, zero failures.

  Found from the consumer side: an app on `theokit@0.58.1` could not take `react-router@8` because
  `pnpm install --strict-peer-dependencies` refused with `ERR_PNPM_PEER_DEP_ISSUES`. A peer that
  excludes a working major is a constraint the framework imposes on every consumer without having
  verified it.

  Both majors in the range are exercised rather than merely claimed: the root devDependency moves to
  `^8.0.0` so everyday CI runs the new one, and `dep-check`'s floor job already runs the suite at the
  bottom of every declared range on the release PR, which covers 7.

  Minor rather than patch: the range a consumer may satisfy is larger than before. Nothing that worked
  on 7 stops working.

### Patch Changes

- 000823c: `DefineAgentToolSpec` no longer documents its schema as Zod 3.

  The `@public` doc block ships in the published `.d.ts`, and it said `inputSchema` is "a Zod 3
  schema" — while this package declares `peerDependencies: { zod: ^4.0.0 }` and `isZodObject` reads
  both majors' internals deliberately (`def.type === 'object'` and `_def.typeName === 'ZodObject'`).
  A consumer opening the type in an editor was told the wrong major, by the package that requires the
  other one.

  Naming a major in prose is what dated it. The doc now describes the shape, which is the same in
  both.

  Comment only; no behaviour change.

## 0.58.1

### Patch Changes

- 24c1cc6: The public-exposure gate no longer reads an empty route table as "nothing is exposed".

  An app that serves entirely through controllers writes `routes: []` into its manifest — the scan
  behind that array reads `<serverDir>/routes` only, and controllers ship as a separate
  `controllers.json` by design. `cannotAnswer` was written for a different absence (a manifest built
  before `publicMethods` existed) and detects it by asking whether any route declares a mutating
  method. On an empty table both questions answer false, so the gate returned `allowed` and bound a
  public interface without a word, while a controller declaring `@SetMetadata('theokit:public', true)`
  on a POST was reachable on it.

  `start` already resolves `dist/controllers.json` to decide whether to serve controllers at all, so
  the gate now receives that fact rather than inferring it. An app with no routes and no controllers
  is still `allowed` — warning about an app that serves nothing is the noise that gets a gate switched
  off. An unstated `hasControllers` is read as unknown rather than as false: absence is not safety,
  including in the field that reports the absence.

  `TheoManifest.routes` now documents what it counts, so the next reader does not have to measure it.

## 0.58.0

### Minor Changes

- 3e142ae: A controller can declare that it authenticates by other means, with `@SetMetadata('theokit:csrf-exempt', true)`.

  The case this exists for is a webhook. Stripe, GitHub and every other sender authenticate with an HMAC over the request body and will never send `X-Theo-Action`, so a webhook endpoint answered 403 to every real delivery and the only escape was `csrf: 'warn'` for the whole application.

  It is deliberately separate from `theokit:public`, which answers a different question — whether an unauthenticated caller may reach the route, not whether the route authenticates some other way. A route can want one without the other.

  Declared on the controller, and absence still means the gate applies.

### Patch Changes

- 420ee70: A controller can read the raw request body again.

  `resolveBody` consumed the request to populate `@Body`, unconditionally for POST, PUT and PATCH, and swallowed the failure when the payload was not JSON. The read still happened, so a handler taking `@Req()` received a request with `bodyUsed: true` and every later read threw `Body is unusable`.

  That made `multipart/form-data` uploads and any signature-covered payload unreachable from a controller: the content-type and boundary arrived intact and the body was gone, while `@Body()` resolved to `undefined` because the JSON parse that drained it had failed.

  It now reads a `clone()`. The JSON path is unchanged.

- Updated dependencies [420ee70]
  - @theokit/http@1.1.2

## 0.57.1

### Patch Changes

- 9dc2e63: Internal test fix, no runtime change: `test_ROOT_resolves_to_this_repository` asserted the name of the directory holding the checkout rather than the identity of the repository inside it.

## 0.57.0

### Minor Changes

- fa13c8b: A `@Controller` route that declares no access decision now fails `theokit build`, matching what a file route with no `.policy` already did. Declare one with `@UseGuards(...)` — on the method or the controller — or state that a route is open on purpose with `@SetMetadata('theokit:public', true)`. Before this, converting a protected file route to a controller and forgetting the guard produced a route that served unauthenticated requests, silently.
- 6dc3d2c: A `@Controller` can now import the app's own code. Before this it worked under `theokit dev` and failed `theokit build` with `Cannot find module '.theokit/…'` — the compiled controller resolved its relative imports from `dist`, where the app does not exist. Only package imports survived, which is why every existing test passed. Relative specifiers are now rewritten to the source files the app already runs from.
- f215047: A `@Controller` whose path the runtime cannot route to now fails `theokit build` instead of answering 404 forever. Controller routes are served from a fall-through that only runs for URLs under `/api/`, so `@Controller('probe')` compiled, emitted, and never responded. The build now names the controller, the path it declared, and the path to write instead.

### Patch Changes

- 818f706: A server field error from a hand-written action reaches the form again.

  An action returning `{ code, message, fields }` had its `fields` map discarded on the way to the client, so a form library received a generic error with nothing to place — and correctly refused to guess, re-throwing. The result was an uncaught rejection and a user shown nothing at all.

  The map is now recognised whether or not the action set the internal wire marker, which only the framework's own serializer writes. A shape carrying no field map — a network failure, say — still answers `INTERNAL_SERVER_ERROR` as before.

- 818f706: A controller answering with binary now delivers the bytes it produced.

  Audio, images, PDFs, gzip — anything a controller returned was decoded as UTF-8 on its way out, so every byte `>= 0x80` became the replacement character. A 55 296-byte MP3 arrived as 76 790 bytes that no player would open, under a `200` and a correct `content-type`; the damage was invisible until someone opened the file. File routes were never affected, so this was a silent divergence between two paths meant to be at parity.

  Controllers still BUFFER the body — a streamed response is collected before the first byte goes out, unchanged from before. Progressive delivery on that path is tracked separately.

- 460ff4f: Widen the optional `@theokit/studio` peer from `^0.2.0` to `>=0.2.0 <1`.

  `@theokit/studio@0.3.0` shipped, and a caret on a `0.x` version pins the minor — so `^0.2.0` excluded it. Installing `theokit` alongside the current studio produced an ERESOLVE:

  ```
  While resolving: theokit@0.56.0
  Found: @theokit/studio@0.3.0
  Conflicting peer dependency: @theokit/studio@0.2.0
  ```

  Nothing about `0.3.0` justified the ceiling: it exports the same single `./plugin` subpath as `0.2.0`, its release changed only its own `@theokit/agents` peer range, and `theokit` reaches it through a runtime `import()` rather than a compiled dependency. The range described a boundary that was never measured.

- Updated dependencies [0f88b0e]
  - @theokit/agents@12.1.0

## 0.56.0

### Minor Changes

- 695e042: `theokit build --target bun` now enforces a declared `rateLimit` instead of refusing the build. The limit is keyed on the caller's address as Bun reports it, so each visitor gets their own bucket. The other five Web-standards targets still refuse by name: they run per-invocation, where an in-process counter does not survive between requests, and a limiter that forgets is a limit that does not limit. A `keyBy` function, `keyBy: 'session' | 'user'`, and per-route limits are refused by name on `bun` too, rather than silently dropped.
- d499d12: Usage survives a restart. `SqliteUsageStorage` is the first durable `UsageStorageAdapter` in the framework.

  The interface existed so a deployment could answer "what did this tenant cost last month", and every implementation in the organisation was in-memory — so no question spanning a process lifetime could be answered at all. For anything that bills, meters or caps per tenant, that is the whole reason to record usage (#459).

  ```ts
  import { SqliteUsageStorage } from 'theokit/server/cost/sqlite'

  const usage = new SqliteUsageStorage('./.data/usage.db')
  ```

  Its **own subpath**, not the `theokit/server/cost` barrel. That barrel is Web-Standards — it has to import cleanly on Cloudflare Workers and Deno Deploy, where `node:sqlite` does not exist — so putting this behind it would have made the whole cost subtree unimportable on five of the seven deploy targets. The import path also states the cost at the call site: a deployment writing `theokit/server/cost/sqlite` has said it runs on Node.

  Same two-method contract, same inclusive period boundaries as `InMemoryUsageStorage` — an adapter swap must not change an invoice, so that rule is asserted rather than assumed. Both record kinds are stored; `getUsage` sums only LLM rows, because a tool call has no token or cost dimension and counting it as a run would inflate the total.

  Built on `node:sqlite` rather than a dependency: no install time, no native build step, and adding a native driver to a framework whose install weight is itself an open issue (#460) would have traded one problem for another. A deployment that wants Postgres implements the same interface — this is the durable default, not the only shape.

  `dispose()` closes the handle, unlike the in-memory adapter's noop, so a graceful shutdown does not leave the WAL unmerged.

  **It needs a Node newer than this package's floor.** `engines.node` is `>=22.12` and `node:sqlite` is not a built-in module there — it arrived unflagged later in 22.x. The module is loaded lazily, so importing the subpath is safe everywhere and constructing the adapter on a runtime without it fails with a message that names the reason and points at the interface. A deployment on 22.12 uses a different adapter; that is what opt-in behind its own subpath is for.

- e511d83: A model whose declared provider prefix is not registered is now refused, instead of being routed to whichever provider happens to hold a key.

  `resolveProvider` already carried the right error — _"declares provider X, which is not registered"_ — and it was unreachable for anyone with a key. `providerOf` returns `undefined` for an unregistered prefix, which is indistinguishable from a bare model id, so the env-priority walk claimed the turn before the check below it ever ran.

  The visible symptom was a confusing error. The real cost appears when the substitute's key is **valid**: the turn succeeds against a provider nobody named — a different endpoint, a different account billed, and the prompt delivered to a vendor the operator had explicitly routed away from. The only trace was a `console.warn` reading `(by env priority)`, which fires at most once per process, so on a long-running server it may already have been printed for an unrelated turn.

  **This inverts a case theokit#326 listed as intended.** That commit recorded `acme/whatever → previous priority order` among its outcomes, but gave no reason for it, and argued the opposite principle two paragraphs on: _"refusing to substitute is the load-bearing part … falling through to another provider's key is precisely what made that 401 unattributable."_ An unregistered prefix is a choice, not a silence, so #326's own reasoning applies to it.

  **To upgrade:** a model id like `acme/whatever` that previously resolved by env priority now throws, naming the prefix and the registered providers. Either register it — `registerProvider({ name: 'acme', … })` — or drop the prefix, since a bare id (`gpt-4o-mini`, `qwen2.5:3b`) still falls back to priority exactly as before. A registered prefix still wins over priority, also unchanged.

### Patch Changes

- d8d3f41: A keyless provider can now actually serve a turn. Registering one (or using the builtin `ollama`) resolved correctly but the agent still refused to build with `missing_api_key`: the resolver reported an empty key, and the SDK treats an empty key as an absent one. Local models are reachable without any cloud credential.
- Updated dependencies [ed68f9f]
- Updated dependencies [bf623e4]
- Updated dependencies [8691f5c]
  - @theokit/agents@12.0.0

## 0.55.0

### Minor Changes

- 1d1407c: `theokit build` refuses a target that cannot enforce a rate limit the config declares.

  A rate limit is applied by the `node` target and by none of the six Web-standards targets. Until now the build printed a warning among others and carried on, so a `theo.config.ts` that reads as protective produced a deploy with no limit and nothing at runtime to report the absence. The first sign is the abuse it was meant to stop.

  `#321` and `#322` are the same lesson, twice, both closed: **a rate limit that silently does not apply is worse than one that is absent, because the operator stops looking.** So this combination is now refused by name, before the build writes anything — the answer this framework already gives an undeclared route policy (`MissingRoutePolicyError`) and an unauthenticated write on a public bind (0.54.0).

  **To upgrade.** If your build now fails, the deploy it used to produce was unprotected. Two ways forward, and the message names both: build for `node` and run `theokit start`, which applies the limit; or remove `rateLimit` so the file states what actually runs.

  **There is no flag to keep the key and skip the check.** A config that stays while doing nothing is the state this refusal exists to end.

  Deliberately narrow: only `rateLimit`. A dropped `cors` or `serialization` degrades where someone can see it and the existing warning is proportionate — escalating every concern would turn a useful warning into a wall people learn to skip.

  This does **not** wire the limiter into those targets. That needs per-runtime address resolution, and doing it naively gives five of six a single shared bucket keyed on `0.0.0.0` — every visitor counted as one caller, a self-inflicted denial of service shipped under a config the operator trusts. Refusing is the honest half that can ship today; the wiring stays open in #461.

## 0.54.1

### Patch Changes

- 59d1d2e: The generated client types a request with what the caller SENDS, not with what the handler receives.

  `InferQuery` and `InferBody` used `z.infer`, which is `z.output` — the value produced after parsing,
  with defaults filled in and transforms applied. A client sends the value before any of that, so
  typing the request with the output inverted the two and punished exactly the schemas that were
  written correctly (usetheokit/theokit#490):

  - **A `.default()` field became required at the call site.** `query: {}` failed to compile against a
    schema whose every field was optional or defaulted, which is the opposite of what declaring a
    default means.
  - **A `.transform()` field asked for the post-transform type.** A querystring flag declared as
    `z.enum(['true','false','1','0']).default('false').transform(v => v === 'true')` — the shape a
    boolean flag needs, since `z.coerce.boolean()` reads `'false'` as `true` — required a `boolean`
    from the caller for a value that has to reach the server as a string. The type described something
    that never travels.

  Both now use `z.input`. The handler side keeps `z.output`, which is correct there.

  For a schema with no `.default()` and no `.transform()` the two types are identical, so most call
  sites are unaffected — which is also why this stayed invisible until a schema used them.

  **This can surface a real mismatch on upgrade.** A call passing the post-transform value
  (`clustered: false`) now fails to compile and wants the wire value (`clustered: 'false'`) — or
  nothing at all, letting the default apply. The request was already being serialised to the same
  string, so the runtime behaviour was correct; the type was not saying so.

## 0.54.0

### Minor Changes

- dba5d30: `theo start` refuses to bind a public interface while write routes are unauthenticated, `HOST` reaches the listener, and identity from a plugin hook survives to the route policy.

  Three changes that only make sense together, and one of them can stop a deploy — read the migration note.

  **A route table nobody protected could still bind every interface.** ADR 0001 made every route declare who may call it and stopped absence from meaning open. That is half a guarantee: `'public'` is a declaration too, so a table where every entry says it passes the build gate perfectly and protects nothing. The policy value never left the module, so nothing downstream could tell "declared and guarded" from "declared and open". The scanner now records which methods declare the literal `'public'`, and `theo start` refuses a non-loopback bind while any POST / PUT / PATCH / DELETE is one of them, naming each offending route.

  Public GET / HEAD / OPTIONS are deliberately untouched. Read endpoints are ordinary — health checks, catalogues, landing APIs — and a gate that fired on them would be switched off within a day. So this does **not** protect a public GET that leaks data; that is authorization work the policy function must do.

  **`HOST` was inert, so the container fix it was added for never applied.** The config schema defaulted `host` to the string `'localhost'`, and an explicit host outranks the environment by design — so every app looked like it had decided, and the env branch was unreachable. A platform setting `HOST=0.0.0.0` got a server bound to the loopback, which inside a container means nobody. The default is gone; the loopback fallback lives where "nobody said" is still distinguishable from "somebody said localhost". An explicit `host: 'localhost'` still wins over `HOST`, and `host: false` still refuses it.

  **Identity set by a plugin's `onRequest` hook is no longer discarded before the policy reads it.** The executor promised the opposite in-source, and held only for apps with no `server/` directory — which no real app is: the middleware stage replaced the context object, and everything a hook had written went with it. A plugin that authenticated a request was then not believed, so an app could not use a real policy at all and the workaround was `policy('public')` plus a hand-rolled check in every handler. Routes now merge, as the action executor beside them always did.

  **To upgrade.** If `theo start` now refuses where it used to serve, the message names every route: each is an unauthenticated write that was reachable from the network. Two honest resolutions —

  - give each one a real policy: `policy(({ subject }) => subject !== null)`, or `requireOwner(subject, record.ownerId)`. A plugin hook establishes `ctx.subject` and the policy reads it — the third fix above is what makes this work at all.
  - decide otherwise, in writing: `security: { allowUnauthenticatedWrites: true }`. The routes stay open, and every start re-lists them.

  A manifest built before this carries no policy kinds; it reports `unverified` and still boots, because reading absence as safety is the failure the gate exists to prevent.

  Two more upgrades may surprise: a container that set `HOST` and quietly bound the loopback will now bind what it asked for, and an `onRequest` hook that wrote to `ctx` will now be seen by the handler.

## 0.53.0

### Minor Changes

- 2be3a2f: A route whose name contains a hyphen is reachable through the generated client. It was not.

  The generator camelCased the segment — `agents-config` became `client.agentsConfig` — while the runtime Proxy builds the URL from the key it is handed and knows nothing of the transformation. So the call compiled, requested `/api/agentsConfig`, and the route served at `/api/agents-config` answered 404. Kebab-case file names are the scaffold's own convention, so the trap appeared on the first route with two words in its name.

  Segments are kept literal now: `client['agents-config'].get()`. Bracket access for a hyphenated segment is the honest cost of a client that mirrors its URLs, and the machinery was already there for segments that cannot be identifiers at all.

  Translating back inside the Proxy would have kept the prettier key at the cost of a second source of truth for every segment name — and a generated client is worth more as a faithful mirror.

  **To upgrade:** a call on a hyphenated route becomes bracket access. Every such call is currently answering 404, so nothing that works today changes.

- 2be3a2f: `theoFetch` can send a POST. It could not.

  `TheoFetchOptions<T>` omitted `method` while `buildRequestInit` read `opts.method` and defaulted to `'GET'`. So the two calls available to a consumer were both wrong: the one the docs teach did not compile, and the one that did compile went out as a **GET carrying a JSON body and no `X-Theo-Action` header** — the POST route was never reached, and nothing said so until someone opened the network panel.

  `method` is part of the options type now, typed as the framework's own `HttpMethod` union so a typo fails to compile. When the route declares a `body` it is **required**, and narrowed to the mutating methods — a route with a body schema is not a GET, and saying that in the type is what removes the silent failure rather than merely unblocking it.

  Nothing that works today breaks: no call carrying a body compiles at present.

- 8730bed: A tool handler that returns an object works, instead of throwing on the model's first call.

  It threw: _"handler returned a non-string; provide toModelOutput to map it to a string."_ The message was right and the moment was the worst available — the first time the **model** calls the tool, inside an agent run, with a provider key and tokens already spent, for a failure the compiler had the information to catch.

  And returning an object is the natural shape: a tool answering `{ id, status, note }` serves a model better than one concatenating a string by hand. So this was the common path, not an edge — one report had 15 tools, all returning objects, all of which would have failed in execution.

  A non-string result is JSON-serialized now. `toModelOutput` still wins whenever the shape the model should see differs from the shape the app wants; the default only decides what happens when nobody said.

  Requiring it in the **type** was the other candidate. It keeps the ceremony: every consumer's correction was the same single line, `.toModelOutput((r) => JSON.stringify(r))`, and a default that every caller overrides identically is a default on the wrong side.

  The explicit error survives for exactly the results no default can serialize — a circular structure, a `BigInt`, a function — and now names which one it hit, because asking for a `toModelOutput` there is advice that does not help.

### Patch Changes

- 2be3a2f: The generated `@theo/client` produces real types instead of `any`.

  Inside a `declare module` block, a relative `import type` aliased at the top and then fed to an external package's conditional type resolves to `any` — silently, with no error, which is what made it invisible. Every call through the generated client returned `any` while the app compiled and the developer believed they were using a typed client.

  Route exports are now named inline as `typeof import('../server/routes/x').GET`, the form measured to survive. No aliased relative import is left in the generated output: the controller path moved to the same shape, because the alias resolved correctly in one block and to `any` in another with nothing in the file to say which.

  The scaffold's `tsconfig.json` also includes `.theokit/**/*.d.ts` now. It listed `types/**/*.d.ts` and not the directory the framework writes into, so the generated client types were never loaded at all — which hid the defect above from anyone who looked.

  The tests that pinned the old output matched the emitted string, down to the alias. A string assertion cannot tell a type that works from one that collapses; the new test compiles the generated file and asserts the compiler rejects a wrong assignment.

## 0.52.1

### Patch Changes

- ba0fc4e: `useAction` no longer loses the field map of a validation error that arrives without its issues.

  The wire carries both `issues` and the derived `fields` (`server/http/serialize-action-result.ts`), and `ActionError.fromJson` reads `issues`. An error carrying only the map — a hand-written action, or a test fixture — had nothing for it to read, so it fell through to `INTERNAL_SERVER_ERROR` with the map gone. `fields` is the entire reason a form library subscribes to this error.

  The map is now inverted back into the issues it was derived from, and `ActionInputError` re-derives an identical one — dot paths, array indices and the empty-string root key intact.

  Found by `@theokit/plugin-forms`' own suite while swapping it off `@theokit/react`.

## 0.52.0

### Minor Changes

- 8e2d2eb: `useAction` — call a server action from a component, with the framework's own error types.

  ```tsx
  import { actions } from '@theo/actions'
  import { useAction } from 'theokit/client'

  const save = useAction(actions.saveMemory)
  <button disabled={save.isPending} onClick={() => save.mutate({ content })}>Save</button>
  ```

  The framework generated the typed callable, served it at `/api/__actions/`, and defined the error hierarchy it answers with — and then had nothing to call it from a component. `core/contracts/action-protocol.ts` opens by describing itself as the contract for "`defineAction` + `useAction`" and points the client half at `@theokit/react`, a package published outside this repository: one version, no `repository` field, and a `@theokit/sdk ^1.1.0` peer against a published 4.x. That is why `@theokit/plugin-forms` cannot be installed today without an unmet peer.

  A failure lands in `error` as the protocol's own `ActionError`, so a validation failure is an `ActionInputError` with its `fields` map intact — the shape a form library binds to. Those classes are now exported from `theokit/client` as well as `theokit/server`; narrowing the error of a client hook previously meant importing the server barrel into a browser bundle.

  `ActionClient`, the store underneath, is exported too: it is framework-agnostic, so a non-React surface can subscribe to it directly.

## 0.51.0

### Minor Changes

- 1ee8226: A `server/routes/api/` directory is now refused at scan time instead of silently doubling the prefix.

  `routes/` is already served under `/api`, so a file at `server/routes/api/auth/callback.ts` answered at `/api/api/auth/callback` — not the redirect URI anybody registers with an identity provider, and not a URL anybody would call. It was found by wiring a real OAuth sign-in and watching the callback 404.

  The second half is worse because it survives a reader's attention: `.theokit/client.d.ts` mirrors the file tree into the typed client, so the same file produced `client.api.auth.callback.get()` — an `api` segment that reads as a typo and is not one. Both halves were wrong from one cause.

  The error names the file, the URL it would have produced, the client chain it would have produced, and where the file belongs.

  A route merely NAMED `api-keys.ts` or `apiary.ts` is unaffected — only a top-level `api/` directory doubles, because only a directory prefixes everything beneath it.

## 0.50.2

### Patch Changes

- 96d8f3e: A route handler's `ctx.request` carries the body it arrived with.

  `incomingMessageToHandlerRequest` built the handler's `Request` from method and headers only —
  deliberately, since #117 moved the parsed value onto `ctx.body`. The consequence was not foreseen:
  any API that takes a `Request` and reads it gets an empty stream, and `request.bodyUsed` is `false`,
  so nothing signals why.

  `handleChannelWebhook` is exactly such an API, and this framework publishes it as the supported way
  to receive from Telegram, Slack, Discord and the rest. Called from a route — the only way a TheoKit
  app defines an HTTP endpoint — it answered `400 Request body must be JSON` for every request,
  including ones whose body was valid JSON. The channel-webhook seam could not be wired at all.

  The parser now keeps the raw bytes of a JSON body and the handler's `Request` is built over them.
  The RAW bytes, not the parsed value re-serialised: every platform that signs a webhook computes its
  HMAC over what it sent, and `JSON.stringify(JSON.parse(x))` moves key order, whitespace and number
  formatting — a reconstruction would verify against nothing.

  Multipart is unchanged: its parsed `fields`/`files` are the interface and the raw form has no second
  consumer.

## 0.50.1

### Patch Changes

- 8ec8681: A multipart form field that appears more than once now delivers every value instead of only the last.

  Posting `tags=a`, `tags=b`, `tags=c` — what a `<select multiple>` or a group of checkboxes sends — reached the action's schema as the single string `'c'`. Nothing errored: the shape was plausible, just missing two thirds of the submission, so a `z.array(z.string())` field either failed validation or silently recorded one answer.

  Both parsers were affected (the Node/Busboy path and the Web/Fetch one), and so was the step that rebuilds a `FormData` for `accept: 'form'` actions, where an array would have stringified to `'a,b'`.

  A field that appears once is still a plain string, so `input.name.trim()` in existing actions is unchanged. Only a repeated field becomes an array — which is the shape `z.array(...)` already expected.

  Also fixed while here: a field named `constructor`, `toString` or `__proto__` was matched against `Object.prototype` rather than against the fields collected so far. Field names come off the wire.

- 0c8dcfd: The release guard no longer fails a successful release because npm had not caught up yet.

  `npm view` answers E404 for a few seconds after a publish that already succeeded — the registry's read path is eventually consistent. The guard read three seconds after `changeset publish` wrote, and reported five packages as never published when all five were on the registry. It then pointed the reader at a missing credential, for a release with no credential problem at all.

  Absent versions are now re-read on a bounded schedule before being called unpublished. A version that genuinely never published still fails, and an unreachable registry still fails immediately rather than waiting out the budget.

## 0.50.0

### Minor Changes

- bfeaebe: A placeholder session secret no longer boots in production.

  `assertProductionSecret` has always been exported, always been documented as the production guard,
  and — until now — was called by nothing. `createSessionManager` and `createSessionManagerWeb` both
  validated their secret through `normalizeSecrets`, which enforces a 32-character floor in every
  environment and knows nothing about placeholders. The gap between the two functions was exactly the
  placeholder check, so a 32-or-more character `CHANGE_ME…` sailed through into production.

  The dev-time warning was in the same position. The sentence telling a developer that "the
  production server will REFUSE to boot until you replace it" lived inside the uncalled function, so
  the developer never saw the warning and the refusal never fired. A promise made by unreachable code
  reads as a guarantee.

  Both session managers now resolve their secret through one function that runs both checks. The
  order is deliberate: the length floor speaks first, so a short secret keeps the message it has
  always had, and only then does the production guard get its say.

  **This can refuse a boot that previously succeeded** — which is the entire point, and is why it is
  a minor rather than a patch. If your deployment starts refusing, the secret it is refusing is one
  of:

  - shorter than 32 characters, or
  - matching `CHANGE_ME`, `demo-`, `demo_` or `placeholder` (case-insensitive)

  Replace it with a real one — `openssl rand -hex 32` — rather than working around the refusal.
  Outside production nothing is refused; you get the warning instead, which is now actually reachable.

- 91fce47: An agent now declares who may run it, and every endpoint it exposes obeys that declaration.

  An agent file exports a `policy` — the string `'public'`, or a function over
  `{ subject, body, params }` — and the run endpoint, the thread routes, the pending-approval listing,
  the approve route and MCP all evaluate it, through the same function the route executors and the
  in-process caller use. `params` carries `{ agent, endpoint, sessionId?, approvalId? }`, so one
  declaration can answer the endpoints differently. `requireOwner` is the primitive for the owner
  check, the same one routes use.

  Identity comes from `ctx.subject`, produced by the application's own `server/context.ts`. That seam
  is the one every `route()` already reads and no agent URL ever reached: the agent endpoints are
  dispatched before route matching, so no route, no `server/middleware/` and no `server/context.ts`
  observed those URLs, and the endpoints resume the conversation the caller names. The check runs
  before the module is compiled and long before the SDK — an agent run spends real tokens, so a caller
  who may not run it is turned away before any of that is paid for.

  **Breaking.** The agent scanner refuses a file under `agents/` that declares nothing, so
  `theo build`, `theo start` and `theo dev` fail until each agent says something. The error names the
  file, the URL it serves and the two ways out. This is the same gate the route scanner applies, and
  absence had to stop meaning open here for a sharper reason than it did there: no runtime default is
  both safe and non-breaking, because refusing every caller-supplied session id breaks multi-turn chat
  and admitting them is the defect. `'public'` is still an answer — it says out loud that the app runs
  a capability model, where holding an id is the whole of the permission. Nothing changes for an agent
  module built in memory and handed to `mountAgent` directly; that value never passes a scanner.

  Also breaking: `GET /api/agents/<name>/approvals` is gated by the same declaration and 404s for an
  agent that does not exist, and a refusal from any agent endpoint no longer repeats which check
  refused it — the wire gets one fixed message naming what to supply, and the reason goes to the
  server log.

  The scaffold's agent declares `export const policy = 'public'`, with the owner check written out
  above it. `MIGRATION.md` has the guide.

- 5f90ddd: A run that was cut short says so. The terminal `done` frame and the turn metadata a client reads off
  `UIMessage.metadata` now carry an optional `stopReason` — `'step_limit'` when the loop ran out of
  tool-calling turns while the model still wanted more, `'no_progress'` when the doom-loop guard
  stopped it repeating identical tool calls. The observability span `agent.run` records the same value
  as `stop.reason`.

  Both outcomes reached the caller as an ordinary `done` before this, identical in every field to a run
  that finished on its own, so a surface could not tell "the agent answered" from "the agent was cut off
  with a tool call still pending". The SDK reported both on its `RunResult`; the adapter's locally-typed
  `wait()` declared no field to read them from, so nothing read them.

  This is not the rare case it looks like: the SDK's iteration budget defaults to 8, so every served run
  needing a ninth tool-calling turn was being truncated and reported as finished — including runs of
  agents that never declared a ceiling.

  Two reasons rather than a `truncated` flag, because they demand opposite reactions: `step_limit` means
  re-sending continues the work, `no_progress` means re-sending repeats the loop that was just cut.
  Nothing here re-sends — the SDK owns continuation; this reports the outcome.

  A run that finishes on its own is unchanged: the field is absent, not `undefined`, so absence keeps
  meaning "the agent finished" and a consumer that has never heard of `stopReason` receives exactly what
  it received before.

- c131170: A run whose connection drops mid-answer is reported as interrupted instead of finished. The agent
  client used to settle a dropped stream in `status: 'done'` with `error` undefined and half a sentence
  on screen — the spinner stopped, the error surface stayed empty, and the truncated turn was committed
  to the thread as a completed one. `reconnect()` and the durable replay route were fully built and
  unreachable, because the only trigger a consumer has for them is a status that never arrived.

  `consumeChunkStream` (and `consumeUIMessageStream`) now return a `ChunkStreamOutcome` saying whether
  the stream carried its terminal `finish` chunk and how many chunks crossed. When it did not,
  `AgentClient` settles `status: 'error'` with an `AgentStreamInterruptedError` — a `TheokitAgentError`
  with `code: 'AGENT_STREAM_INTERRUPTED'` and `isRetryable: true`, so `isTransientError` sees it and a
  consumer decides on the type instead of on message text. The text already received stays on screen,
  and `send()`'s existing rule keeps the truncated turn out of history.

  The status is `'error'` rather than a new `'interrupted'` member on purpose: a new member fixes the
  lie only for consumers who update their switch, while every other surface keeps rendering a finished
  turn. Reusing `'error'` fixes it for all of them at once, and the reason for it lives in the typed
  error where this framework already puts error discrimination.

  This is a different axis from `stopReason` (#379), not another member of it. `stopReason` says why the
  RUN stopped and rides the terminal frame's metadata; an interruption is the absence of that frame,
  where the client cannot know why the run stopped because it never heard.

  A stream that ends on its terminal `finish` chunk is unchanged, down to the fields on the snapshot.
  A custom transport that never emitted `finish` — which no framework producer does, since
  `presentUIMessageStream` emits it on every path including the error one — will now be reported as
  interrupted, which is what it always was.

- 03bd8f8: An approval belongs to someone, and only they can settle it.

  The HITL ledger keyed approvals by a bare id and recorded no owner. The agent's policy could answer
  _"may this subject touch this agent's approvals"_ and never _"is this approval theirs"_, so an
  authenticated tenant could settle another tenant's approval on an agent both were admitted to — the
  policy was the only thing between them, and it cannot see whose approval it is. The gap was
  documented in `agent-access.ts` as real and open; this closes it within a stated scope.

  `mountAgent` now records the run's subject on each approval it registers, and the approve endpoint
  refuses a caller whose identity does not match. A caller who cannot be identified at all is refused
  too: an approval that has an owner must not be settleable by whoever reaches the endpoint without an
  identity, or the guarantee would depend on how the host wired its resolver rather than on who is
  asking.

  **The check only ever narrows, and two paths are deliberately untouched.** An agent that declares
  `'public'` records no owner — attributing its approvals would start refusing callers the declaration
  admits, which is a behaviour change dressed as a bug fix. And a thread continuation runs headless,
  with no request whose identity could be resolved, so its approvals record nobody. In both cases the
  endpoint behaves exactly as before, and `params.approvalId` is still passed to the policy so an
  application holding its own owner map can answer more than the framework does.

  Owner ids are not exposed through the pending-approval listing: that listing feeds a UI, and who
  else is waiting on an agent is identity rather than status.

  `ApprovalRegistry` gains `ownerOf(approvalId)`. A custom implementation of that interface must add
  it.

- 577bcd0: The generated Cloudflare Worker no longer reaches for a filesystem it does not have.

  The emitted worker discovered its routes by calling `scanServerRoutes` — a `readdirSync` — against a
  directory that does not exist on Workers, then loaded each module through `import()` of a file path
  via `pathToFileURL`. It answered "are there WebSocket routes?" with a second `readdirSync`. Three
  calls, none of which can succeed there.

  Routes are now scanned on the build machine and baked into the worker: a static `import` per route
  module, a literal route table, and a loader that serves only what the build bundled. Static because
  Wrangler's bundler follows those imports — `wrangler.toml` uploads `.theokit/client` and has never
  uploaded `server/`, so a module not bundled _into_ the worker is not on the platform at all.

  This is the road the adapter already took for the document shell one function away, for the same
  stated reason: a Worker has no filesystem at request time.

  The scanner is injected through `AdapterBuildContext.scanRoutes` rather than imported, because
  importing it would add an `adapters → server` edge — the layering inversion ADR-0001 v3 removed for
  `vite-plugin`. An adapter given no scanner emits a worker with no routes rather than falling back to
  a runtime scan: the fallback is the defect.

  Route precedence is unchanged — the pattern is recompiled from the same `routePath` the scanner
  produced, through the same `compilePattern`, so one function decides precedence on every target.

  **Not verified on the platform.** No deploy runs in CI. What is proven is that the emitted worker no
  longer calls three APIs that cannot exist there, and that it parses as an ES module.

- 54bc00f: The deploy shim delivers bytes as the handler produces them, instead of collecting the whole
  response and handing it over at the end.

  `createWebShim`'s `res.write()` now enqueues into a `ReadableStream` that the `Response` already
  carries, and `toResponse()` settles the moment status and headers are known — at `writeHead()`, or
  at the first `write()`/`end()` when the caller never called `writeHead()`. It used to settle only
  inside `end()`, from a single concatenation of every chunk, so no byte was observable before the
  handler returned. Measured through the shim, a run emitting a chunk every 120 ms arrived as one
  chunk at the millisecond the run ended; on the served Node path the same run arrived as eight.

  Fixing the shim alone would not have reached the wire. Every emitted handler awaited `executeRoute()`
  before asking for the Response, which re-buffered the whole body in the handler — a second buffering
  point, one per target. All six now pass the in-flight run into `toResponse(executeRoute({ … }))`.
  The Vercel function additionally drained the Response into a string; it now writes chunk by chunk
  into the Node response and its `.vc-config.json` declares `supportsResponseStreaming`, without which
  the platform buffers regardless of how the handler writes.

  Three contract points the caller has to know about:

  - **Headers freeze at the first byte.** `setHeader()`/`writeHead()` after the Response has been
    handed out now throw, naming the header, the way Node's own `ServerResponse` raises
    `ERR_HTTP_HEADERS_SENT`. They cannot be honoured once bytes are moving, and silently dropping them
    is a lie the caller never sees.
  - **Backpressure is reported.** `write()` returns `false` once the outbound queue passes 64 KiB and
    `once('drain', cb)` fires when the consumer makes room; the framework's own stream writer honours
    both, so a slow consumer no longer lets the queue grow without bound.
  - **A failure after the first byte cannot become a status code.** `toResponse(pending)` rejects when
    the run fails before the headers are out, and errors the body stream when it fails after — so the
    consumer sees a broken stream rather than a short body that looks complete.

  `aws-lambda` is delisted for response streaming rather than fixed. Its v2 result object carries the
  body as a string, so nothing can leave the function before the run ends; streaming would need
  `awslambda.streamifyResponse` and a Function URL in `RESPONSE_STREAM` invoke mode, which this adapter
  does not emit and which would break every API Gateway deployment of it. The build now refuses by name
  when `ssrStreaming` is on, and the emitted handler logs the route by name when it buffers a
  `text/event-stream` response. `DeployAdapter` gained `streamsResponses` so every target states its
  answer instead of being listed for something nobody exercised.

- cbc1714: Every Web deploy target now serves the security headers the app configured.

  `theokit start` applied the configured baseline to every response it wrote, and none of the six
  Web-standards deploy adapters applied any. A page served from Vercel, Cloudflare, Netlify, Bun,
  Deno Deploy or AWS Lambda carried no Content-Security-Policy, no `X-Frame-Options`, no
  `Strict-Transport-Security` and no `X-Content-Type-Options`, while the same page under
  `theokit start` carried all four. Clickjacking and MIME-sniffing defences an operator had declared
  existed only in development.

  Each emitted entry now carries `security.headers` as a build-time literal, calls the same
  `buildSecurityHeaders` the local server calls, and applies the result at one point per handler —
  including the not-found branches, so a later edit cannot add a response that skips them. A header
  the route set itself is never overruled, matching how the local server lets a handler win.

  Two limits are stated rather than left to be found in production, and the build prints both:

  - **The CSP carries no nonce**, except on Cloudflare with `ssrStreaming: true`. A nonce is minted
    per response and cannot survive a build-time literal, so only a target that renders the HTML at
    request time can put the same value on the header and on the script tag. The streamed Cloudflare
    worker does exactly that and gets a per-request nonce; everywhere else an inline `<script>` is
    refused by `script-src 'self'` — the same answer the framework already gives a prerendered route.
  - **On four targets the HTML document is served by the platform's static host**, not by the handler
    these headers are attached to, so they reach `/api/*` and not the page. Configuring the
    document's headers on the platform is tracked separately.

  The rate-limit half of the same deployment gap is untouched: it needs a per-runtime client address
  and is not a build-time value.

- 44edd0f: A build now names every configuration key the chosen deploy target validates and then never applies.

  `theo.config.ts` parses `rateLimit`, `security.cors`, `security.csrf`, `security.disallowed` and
  `serialization` for every target, and the six Web-standards adapters build `executeRoute`'s context
  from a subset of its fields — so on a deployed app the rest fall back to hard-coded defaults, and
  `security.cors` reaches no production target at all. An operator who declared a rate limit got none,
  and nothing anywhere said so.

  Each adapter now declares which of those concerns the handler it emits actually applies, following
  the contract `streamsResponses` already established: omitted means none, on purpose, so a new
  adapter has to state what it honours rather than inherit a silent yes. An adapter that emits no
  request handler answers `runtime-not-emitted-here`, which is a different fact from "drops
  everything" and is reported as neither.

  `theokit build` prints the difference before it builds, naming the keys as they appear in the config
  file and what to do about each. It warns rather than refuses: refusing would break every deployment
  that declares a rate limit today, while the fix those keys are waiting for is not a build away.

  Nothing is dropped when the declared value equals what an unwired target does anyway —
  `csrf: 'strict'` and `serialization: 'json'` are honoured by coincidence, and a warning over an
  identical outcome only teaches operators to skip the block.

- 19dd55f: Agents are served on the `cloudflare`, `bun` and `deno-deploy` deploy targets. They were served on
  none: every generated entry routed `/api/` through the file-route table alone, so `/api/agents/<name>`
  answered 404 everywhere and an agent reached production only on a machine running `theokit start`.

  Cloudflare bakes its agent modules as static imports (a Worker has no filesystem); Bun and Deno scan
  at request time, the same way they already scan routes. `vercel`, `netlify` and `aws-lambda` receive
  a standalone function directory that never sees the app's modules and cannot serve an agent by this
  road — every adapter now declares `servesAgents` so the gap is stated rather than assumed.

  New subpath `theokit/adapters/agent-mount`, the door generated entries use to reach `mountAgent`.
  `theokit/server` still does not export it: ADR 0041's boundary is about what an application may
  import, and a generated entry is this framework's own code.

- faba80b: Plugin lifecycle hooks now fire on a deployed app for the `cloudflare`, `bun` and `deno-deploy`
  targets. They were dead on every Web-standards deployment while firing locally, so observability and
  auth plugins were inert in production with nothing saying so.

  A plugin declared by module specifier (`plugins: ['./src/plugins/audit.ts']`) is imported by a module
  the build writes beside the entry. Those three targets bundle their output from the project, so the
  static import reaches the app's own module; `vercel`, `netlify` and `aws-lambda` receive a standalone
  function directory that never sees the app's source and keep declaring the concern unapplied.

  A constructed plugin handed to a target that can carry a named one now fails the build, naming the
  plugin and showing the specifier form. This is deliberate: it was previously dropped in silence.

- 8080434: Scroll restoration now covers the element your layout scrolls, not only the document.

  The router mounted react-router's `<ScrollRestoration>`, which restores `window.scrollY`. A layout
  that scrolls an inner element — which is what the default scaffold ships — leaves the document with
  no offset to save, so restoration ran and restored nothing.

  Mark the element with `data-theo-scroll="<id>"` and its offset is restored on back navigation. The
  value is the id, so a page with two scrollers stays unambiguous. Declared rather than detected:
  walking the DOM for `overflow: auto` picks a container silently, and a different one as the layout
  changes.

- e884903: The HITL pause span measures the human's wait, not the human plus the model.

  `agent.hitl` was ended when the gated tool produced output, on the premise — stated in the code —
  that "the tool producing output IS the resume". The wire refuted it: with the approval answered at
  ~3306 ms, that chunk arrived at 4829 ms, and across three runs varying only the model's post-resume
  latency the excess tracked it 1:1 (20 ms → +30 ms, 700 ms → +723 ms, 1500 ms → +1524 ms). The
  premise holds only when the model is instantaneous, which is the one case nobody deploys.

  The resume happens on a different HTTP request — the approve endpoint — which the run's observer
  never sees. The span handle now lives in a registry keyed by approval id that both reach, and the
  approve endpoint closes it at the instant the answer arrives, so the duration is the human's by
  construction rather than by subtraction.

  Closing is idempotent because the registry drops the handle: the tool result arriving seconds later
  cannot re-close a span the approval already ended, which would have reintroduced the defect through
  the fallback path. That fallback still runs for transports that settle an approval without an
  approve request — the terminal prompt among them — so their behaviour is unchanged.

  In-process, like the approval registry it shadows: the handle is a live object, so pause and resume
  must be in one process. A multi-instance deploy resumes on whichever instance the approve request
  reaches, and elsewhere the span falls through to the end-of-run sweep and is marked
  `hitl.resume_observed=false` rather than reporting a duration it did not measure.

- 7dfedb8: `theokit/server/http` exports sixteen symbols that previously existed only behind the deprecated
  `theokit/server` umbrella: `executeWebRequest`, `callProcedure`, `ProcedureInputError`,
  `ProcedureOutputError`, `validateRouteInput`, `parseRequestBody`, `FileTooLargeError`,
  `jsonTransformer`, `superjsonTransformer`, `resolveTransformer`, `createOpenApiHandler`,
  `ActionError`, `ActionInputError`, `isActionError`, `isInputError` and `extractUniversalIssues`. The
  umbrella's own deprecation message tells consumers to move to a subpath, and for these there was
  none.
- 6982cfa: `<Image>` now reserves its space, and refuses a `srcSet` that cannot be resolved. **Breaking for callers who omitted dimensions.**

  The component's own documentation said "width/height for CLS prevention" and enforced neither: both
  were forwarded when present and absent when not, so the shift the comment named was the default
  behaviour. `srcSet` was accepted without `sizes` the same way, and a browser given no `sizes`
  resolves the candidates against `100vw` — it downloads an image picked for the wrong width, usually
  the largest, which is the opposite of what adding a `srcSet` was meant to achieve.

  `width` and `height` are now required, and `srcSet` and `sizes` travel together or not at all. Both
  are expressed in the type, so a TypeScript caller finds out at build time with the prop named, at no
  runtime cost. A JavaScript caller gets a thrown error naming the prop and the consequence rather
  than a page that shifts.

  Migration: pass the intrinsic pixel dimensions. CSS may still resize the image — the attributes give
  the browser the aspect ratio to reserve, they do not fix the rendered size. If a `srcSet` was
  declared without `sizes`, add `sizes`; the candidates were being resolved against `100vw` until now,
  so the picked image is likely to change, and that is the fix rather than a regression.

  Still explicitly out of scope, and now stated in the component's documentation instead of being left
  to inference: nothing here resizes or re-encodes an image, and the framework ships no fonts module.

- cf40254: `<Metadata>` refuses a relative `ogImage` in development.

  Open Graph resolves `og:image` against the **crawler's** origin, not the page's, so a relative path
  produces a tag that is present, well-formed and broken. It renders correctly in the browser, which
  is why nobody finds out until the link has been shared — the one moment the card exists to serve.
  The component's own documented example taught the broken form, and now shows an absolute URL.

  The check runs in development only, and the asymmetry is deliberate rather than a compromise.
  Throwing in production would turn a broken social card into a 500 on a page that otherwise renders,
  trading a defect for an outage. Throwing in development puts the failure in front of the only person
  who can fix it, at the moment they wrote it, and costs a production page nothing.

  Protocol-relative URLs (`//cdn.example.com/og.png`) and `data:` URIs are accepted: neither has an
  origin a crawler can resolve wrongly.

  Migration: pass an absolute URL. If your `ogImage` is relative today, the card is already broken for
  everyone but you.

- ab56b38: **Breaking (types):** `MiddlewareHandler` — what `middleware().handle(fn).build()` and
  `defineMiddleware(fn)` accept — changed from `(request, next) => Response` to
  `(request, context) => Response | void`. Return a `Response` to answer the request; return nothing to
  continue to the next middleware and then the route.

  The old shape described a continuation pipeline nothing in the framework implements, and it had zero
  runtime consumers: a middleware authored through the documented builder could not be invoked by the
  runner that loads `server/middleware/*.ts`. Any code written against the old signature never ran, so
  the compile error this raises is the first honest signal it could get.

  Express-style `(req, res, next)` middleware files are unaffected and keep working; both shapes now
  run, in filename order. Web-shaped middleware can also decorate the route's `ctx`, which no file
  middleware could do before.

- ed18294: `config.plugins` accepts a module specifier alongside a constructed plugin:
  `plugins: ['./src/plugins/audit.ts', inlinePlugin()]`. A string is resolved to that module's default
  export by both `theokit start` and the Vite dev server, so one declaration serves both.

  This exists because a constructed plugin closes over state and has no literal, which is why no
  generated deploy entry could ever carry one. Naming the module lets the build emit a static import
  for that module and nothing else. Purely additive — an app passing objects is unaffected.

  A specifier that cannot be loaded, or whose module has no default export, fails by name with its
  index. Skipping it would leave an app running with one fewer plugin than it declared and nothing
  saying so.

- 6982cfa: Reproducing production locally is one command, and a back navigation returns to where the reader left off.

  `theokit preview` builds and then serves, in that order, stopping at the first failure. It replaces
  `theokit build && theokit start`, whose failure mode is silent: `start` serves whatever `.theokit/`
  already holds, so a skipped or failed build serves the previous one and nothing says so — worst
  exactly when the two-step version is being used, which is to check whether a change works. It is not
  a third implementation of either step; both stay separately invocable, because CI builds and serves
  in different jobs. Scaffolded projects gain a matching `preview` script.

  `ScrollRestoration` is mounted once at the root of the generated route manifest. It was mounted
  nowhere, so a back navigation landed wherever the browser had left the offset. It sits beside the
  application's own root element rather than replacing it, so a layout still receives `<Outlet />` as
  its `children`.

  Mounting it costs nothing at render time and nothing in the document. In a `createBrowserRouter`
  application the component returns early — react-router's Framework Mode context is absent — so it
  renders `null` on the server and on the client alike, emits no `<script>` and needs no CSP nonce.
  That is what keeps the server tree byte-identical to the client one, the parity the renderer already
  protects with `hydrate: false` after a tree mismatch measured CLS 0.39. The restoration itself runs
  in `useScrollRestoration`, which needs only the data-router context `RouterProvider` supplies.

  One assertion changed shape rather than intent: the manifest imported `Outlet` only when a layout
  existed, and now always imports it, because the root's new element renders children through it.

- 4b6d612: Every route file declares who may call it, and absence stops meaning open.

  **Breaking**, for every application with routes under `server/routes/`. The route scanner refuses a
  file whose HTTP export declares no `policy`, so `theo build`, `theo start`, `theo dev`, `theo routes`
  and every deployment adapter fail until each route says something. The error names the file, the URL
  it serves and the methods that are silent.

  `RouteConfig.policy` shipped optional in 0.49.0, and optional meant a route nobody had thought about
  was indistinguishable from a route deliberately left open: both had no policy, and both were served
  to anyone. ADR 0001 calls that the fail-open-by-omission class and closes it by making the absence a
  build error rather than a silent default. `'public'` is still an answer — it is just an answer
  somebody has to write down, which is what turns "how much of this app is open" into a number you can
  `grep` for.

  ```diff
    export const GET = route()
  +   .policy('public')
      .handler(() => ({ status: 'ok' }))
      .build()
  ```

  `route()` gained `.policy()` in this release and `defineRoute({ policy, handler })` takes the same
  value; `requireOwner` from `theokit/server/define` is the per-record answer. Detection reads the
  export's AST, so a `policy` mentioned in a comment or a doc block declares nothing, and a re-export
  across a module boundary (`export { GET } from './shared'`) cannot be seen through — both come back
  undeclared, which is the deliberate direction: the cost is one explicit declaration, and the
  alternative cost is a route reported as protected because the scanner guessed.

  The gate is on file-scanned routes only. A `RouteConfig` built in memory and handed to
  `executeWebRequest` or `callProcedure` never passes a scanner and is untouched — the runtime still
  treats an undeclared policy as "not declared" rather than as denial. Refusing at request time
  instead would have turned every existing route in every consumer into a 403 with no build step in
  between, arriving one request at a time in production. `MIGRATION.md` has the per-situation guide.

- 2893c89: The exported `agent.run` span records the model the run used, as `gen_ai.request.model` — the
  attribute name OpenTelemetry's GenAI semantic conventions give it. Token counts alone convert to no
  cost, because price is per model, so a run whose provider reported no cost was unpriceable from its
  own trace. The value is the model that actually ran, resolved where a per-run override wins over the
  declared one and an agent that declared none reports the default it fell back to, and it travels on
  the turn's `finish` metadata — so Tauri and terminal surfaces receive it over the same path the web
  does. A producer that reports no model records no attribute rather than a guess.
- 59150e7: `theokit build` refuses a server-only module in the client bundle, and the error names both the
  module and the file that imported it.

  Three things are now server-only in the client graph: the `theokit/server` umbrella, every
  `theokit/server/*` subpath the package publishes, and every module under the project's own
  `serverDir` — except `actions/schemas/**`, which the `@theo/actions` facade deliberately bundles so
  a form can validate against the same zod schema the server does.

  The build already failed on these imports. It failed with `"resolve" is not exported by
"__vite-browser-external"`, pointing at a framework chunk, after thirty lines of externalisation
  warnings — the bundler's difficulty rather than the author's mistake. It also failed by accident:
  the cause was Node builtins not existing in a browser, so server code that imported none of them
  would have bundled and shipped. And `theokit/server/define` failed differently again, with `ENOTDIR`
  on a path built by string concatenation.

  This is a build-time behaviour change: a project whose client graph reaches server code fails where
  it may previously have built. That is the point of it, and the message says what to write instead.

- 2ec9180: An agent run reaches the collector as one trace instead of one trace per span. Spans now carry the
  trace they belong to and their own id, decided when the span starts; `agent.tool` and `agent.hitl`
  hang under the `agent.run` that opened them, and a request carrying a `traceparent` is continued
  rather than replaced. `ObservabilityAdapter.startSpan` takes an optional third argument placing the
  span in a trace — existing callers are unaffected, and `defineObservabilityAdapter` forwards it so a
  custom adapter is not trace-blind by construction.
- d635f7f: `theokit` now depends on `vite@^7`. It pinned `vite@^6` while the default scaffold's
  `@tailwindcss/vite@^4` pulls `vite@7`, so applications resolved two Vite majors and two `esbuild`
  copies — two `postinstall` binary downloads for one framework. With one major in the tree, one of
  each remains. An application using a Vite plugin built for v6 needs that plugin's v7 line.
- 4b6d612: `executeWebRequest` enforces CSRF unless you turn it off.

  **Breaking**, for anyone calling `executeWebRequest` from `theokit/server/http` directly. Routes
  served by `theo dev` or `theo start` go through `executeRoute`, whose CSRF gate has defaulted to
  strict all along, and are unaffected.

  `ExecuteWebRequestOptions.csrfMode` had no default. Both of the executor's gates compared the value
  against `'strict'`, so omitting the option meant no CSRF check ran on `POST`, `PUT`, `PATCH` or
  `DELETE`. Omitting it now enforces, and `'off'` is the only value that disables the gate.

  ```diff
  - // no csrfMode → no CSRF check
  - await executeWebRequest(request, routeModule)
  + // no csrfMode → gate enforced
  + await executeWebRequest(request, routeModule)
  +
  + // opt out explicitly, only if you have another defense
  + await executeWebRequest(request, routeModule, { csrfMode: 'off' })
  ```

  A route that legitimately receives third-party POSTs — a Stripe or GitHub webhook, an OAuth
  callback — declares `csrf: false` on its own config, which the Web executor now honours and
  previously ignored. Browsers using the generated action client need no change: it already sends
  `X-Theo-Action: 1`.

  The option existed, the safe value existed, and the default was the unsafe one, so the check ran
  only for a caller who already knew to ask — and this executor is the boundary the Cloudflare, Bun
  and Deno adapters are built on, each of them a caller that would have had to remember. Honest size
  of it: there is no production caller of the unsafe default in this repository today, so this closes
  a future boundary rather than a live exposure.

### Patch Changes

- e39ce98: Every agent endpoint now emits an HTTP span, and one agent is one series.

  **The aux and approve routes were invisible at the HTTP layer.** `POST /api/agents/<name>` ran the
  plugin lifecycle; the six routes beside it did not, in production or in dev. So the thread message
  and stream routes, MCP, the agent card, the pending-approvals listing, the durable run-stream
  reconnect and the HITL approve route answered without `onRequest` / `onResponse` / `onError` — no
  `http.request` span, no `http.requests`, no `http.errors`. Two of those spend tokens and one settles
  a human decision, and an operator watching latency or error rate saw no traffic for them, which
  reads exactly like no traffic. The thread route's `agent.run` spans did arrive, so a trace showed a
  run with no request above it.

  The lifecycle bracket is now one function (`serveThroughPluginLifecycle`) applied by every agent
  branch in both surfaces, and the aux dispatcher decides ownership (`matchAgentAuxRoute`) before it
  answers (`serveMatchedAuxRoute`) — which is what makes a bracket possible without converting a
  request in order to learn whose path it is. A seventh aux route added later inherits the lifecycle
  instead of having to remember it.

  **`theokit dev` also stopped 404ing four routes `theokit start` serves.** The dev middleware kept a
  hand-maintained subset of the dispatcher's route table (approvals and MCP), so the two thread routes
  and the durable run-stream reconnect were production-only. It now asks the table.

  **The `agent` span attribute is the agent's name on every route.** It was the agent module's
  absolute filesystem path on `POST /api/agents/<name>` and the string `agent "chat"` on the thread
  route, so the same agent split into two series on a dashboard, the path form changed with every
  deploy and directory rename, and the server's directory layout — on a developer machine, the user's
  account name — was exported to the telemetry backend on every span of every run. The compile label
  that names a fail-fast `AgentDefinitionError` stays human-readable; it is simply no longer the key
  an operator groups by. The module path is not emitted under another name either: if it is ever
  wanted, `code.filepath` is the registry spelling and it is an opt-in, not a default.

- 1410b93: The Cloudflare adapter now serves the HTML document, with the security baseline on it. With
  `ssrStreaming: false` it returned 404 for every non-API request while `wrangler.toml` declared a
  `[site]` bucket nothing read — so the page was missing, not merely unprotected. The config declares
  an `[assets]` binding with SPA fallback and the worker returns the asset through it.

  The per-target security notice also stops instructing you to configure `vercel` and `netlify`
  document headers, which this build has emitted since #412's first half; it now distinguishes a
  handler-served document, a platform this build configures, and a platform it owns no artifact for.

- ad3bcf6: `serialization: 'superjson'` now applies on the six Web-standards deploy targets (vercel,
  cloudflare, netlify, bun, deno-deploy, aws-lambda). The generated entry carried no transformer, so a
  deployed app fell back to `JSON.stringify` and never emitted `x-theo-transformer` — serialising one
  way locally and another in production without telling the client. The entry now resolves the
  selector through the same `resolveTransformer` the local server uses. `config.plugins` remains
  declared as unapplied on those targets: it holds constructed objects, which no literal can express.
- c8022db: Four separate defects the SAST gate was reporting, each fixed at its cause.

  **A generated property key could not contain a backslash.** The typed app-client emits a route
  segment that is not a plain identifier as a quoted key, escaping the quote but not the escape
  character — so a segment ending in `\` produced `'trail\'`, whose trailing backslash escapes the
  closing quote and swallows the rest of the emitted line. A backslash is a legal POSIX filename
  character, so it reaches this code from `server/routes/`.

  **An internal error could forge log entries.** `sendError` logs an `INTERNAL_ERROR` with its
  message and request id, and an exception message can be built from request data. A newline inside
  it reached the log verbatim, which is enough to append lines of one's own — a fabricated entry
  sitting in the log looking exactly like a real one. Both values are now rendered as one line.

  **Stripping TOTP padding was quadratic.** `base32Decode` removed trailing `=` with an anchored
  `/=+$/`, which retries from every start position, so a long run of `=` followed by anything else
  costs O(n²) — on an authentication path. The comment defending it argued the input was short
  enough ("10..50 chars typical"), which is an expectation rather than a bound. A scan back from the
  end is linear and needs no such argument.

  **The hook-output fence escaped only the first `<`.** `fenceHookOutput` neutralises an early
  fence-close by escaping its `<`, using a form of `replace` that stops at the first occurrence. The
  fence contains exactly one today, so nothing was wrong — and nothing said so, which made the
  correctness of a prompt-injection guard depend on a property of a string literal several lines
  away. `replaceAll` removes the dependency.

  Behaviour is otherwise unchanged: an identifier-safe key, a message without newlines, a normal
  base32 secret and a well-formed hook output all produce exactly what they produced before.

- 0e9e6dc: A human-in-the-loop tool call is one call on the wire again. A `@HumanInTheLoop` tool used to cross
  as TWO `tool-input-available` chunks under two different `toolCallId`s — the approval id the HITL
  plugin mints for its `approve/${approvalId}` callback, and the runtime tool-call id the SDK mints
  when it dispatches the tool. Neither producer can adopt the other's id: the SDK's `pre_tool_call`
  context carries `name`, `args`, `agentId` and `runId` and no call id at all, so the plugin has
  nothing to key on, and the approval has to be published before the tool exists.

  The translator correlates them now, so one logical call is announced once and its result carries the
  same id. `tool-approval-request` keeps the plugin's id in `approvalId` — the callback URL is
  unchanged and the same value still resolves the pause — and names the call it gates in `toolCallId`,
  which is what that field was always for.

  What this was costing: a consumer counting tool calls counted two, a UI grouping blocks by
  `toolCallId` rendered two cards for one call and left a permanently pending approval part next to the
  completed one, and the `agent.hitl` observability span opened on the approval id was never closed by
  a result arriving under the runtime id — so its duration approximated the whole run instead of the
  human's wait. That span now closes at the resume and carries `hitl.resume_observed: true`; the
  end-of-run sweep that marks the opposite is back to being the exceptional path it describes, reached
  when a pause genuinely never resumes (the client disconnected, the run failed mid-pause).

  Ungated tools are untouched — the correlation is identity for a call no approval ever claims.

- 4411a59: A web application can now render a human-in-the-loop approval prompt. `useAgent` returns
  `pendingApprovals` — one entry per decision the run is parked on, carrying the `approvalId` that
  `approve()` takes, the gated tool's name, the arguments it is about to run with, the question
  declared on the gate, and the window before it settles itself.

  Before this the hook exposed the settle half of the gate and no way to reach the other half. The
  store dropped the `tool-approval-request` frame on the way in, so its whole snapshot while a human
  was deciding was `messages`, `thread`, `status: 'streaming'` and `error` — and the paused tool sat in
  `state: 'input-available'`, which is exactly what an ungated tool looks like while it runs. An
  application could not tell "working" from "waiting for you", and could not have named the decision if
  it could. The only path left was polling `GET /api/agents/<name>/approvals` out of band.

  The transcript carries it too: the gated call's own part moves to `state: 'approval-requested'` with
  the id under `approval.id` while the decision is outstanding, and leaves that state when it is
  settled. That is the ai-sdk reader's own vocabulary, not a new one — the differential oracle compares
  the two readers on the paused run and the denied run and they reconstruct identically.

  What the gate is asking travels as a transient `data-approval` part rather than on the approval frame
  itself. The frame is shared vocabulary and `ai`'s validator for it is strict: a `question` added
  there would not give an ai-sdk client a poorer prompt, it would delete the whole approval frame for
  that client and re-create this defect on the other side of the wire. The tool's name and its
  resolved input are not repeated anywhere — the `tool-input-available` frame already announces both
  under the same call id, and both readers fold the frames into one part.

  `approve(approvalId, decision)` is unchanged; what changes is that the store now hands the id over.
  A tool with no gate produces exactly the same frames and exactly the same snapshot as before, with
  `pendingApprovals` empty.

- 2893c89: The `http.request` span joins the caller's trace instead of minting one of its own. A request
  carrying a W3C `traceparent` produced two disconnected traces once the agent run learned to continue
  it: the run joined the caller, the HTTP span did not, and the caller's trace id reached the collector
  as the `requestId` attribute rather than as the span's `traceId`. The span now continues the inbound
  trace on every route and names the caller's span as its parent; a request with no `traceparent`, or
  one carrying only an `x-request-id`, still roots a freshly minted trace as before.
- ca8156e: Three more places where a path was resolved twice now open one descriptor and answer both questions
  through it.

  `serveSpecFile` asked whether the OpenAPI spec existed and then opened it by name, so the file that
  answered the first question need not be the one that answered the second — which is the `413` cap
  being bypassable rather than enforced. `openSync` answers both at once: absent is `ENOENT` and keeps
  its own `503`, anything else keeps its `500`, and the size is now measured on the descriptor that is
  read.

  `.env` loading inspected the path for the symlink transparency note and then read it by name, so the
  note could describe a different file from the one whose values were loaded. The note is now produced
  after the descriptor is open, and the bytes come from that descriptor.

  `sendError`'s log escaping collapsed to a single exhaustive pass over both line terminators, which is
  the same guarantee stated once instead of twice.

  No response, no log line and no loaded value changes for a file that is not being swapped underneath
  the process.

- 7489975: An internal failure now discloses the same amount over every transport.

  The Node runner replaces an `INTERNAL_ERROR`'s message with a generic one in production, and so
  does the Web runner's error builder. An exception escaping a Web handler travelled through neither:
  it reached the client through a third path that built its `Response` by hand from the error
  envelope, shipping `err.message` and `err.cause` verbatim. The same route, failing the same way,
  disclosed a connection string over one transport and `"Internal server error"` over another — the
  `rules/three-target-parity.md` "one contract, three transports" rule broken by duplication rather
  than by design.

  The rule is now stated once, in `core/contracts/client-safe-error.ts`, and all three paths ask it.
  When it redacts, `cause`, `meta` and `ext` go with the message: they exist to describe the failure,
  and the point is that this failure is not describable to the caller. The code stays, so a client
  can still branch on it.

  `proxyFetch` had the same shape in its own corner: a failed upstream `fetch` reports why it failed,
  and the reason names the upstream — host, port, sometimes credentials — which it returned to the
  caller as the `detail` of a 502. It now redacts in production too. It states the rule locally
  rather than importing it, because `services/` is a declared leaf with no intra-package dependencies
  (ADR-0001 v3); reaching across that boundary to save two lines would trade a real architectural
  regression for a cosmetic one.

  Development behaviour is deliberately unchanged everywhere: the message is what makes a framework
  debuggable, and taking it away outside production buys nothing.

- da46294: A request with no inbound `traceparent` now produces ONE trace instead of two. The HTTP span and the
  agent run each resolved the request's trace by reading the header independently, which agrees only
  while a header is present — the common request (a browser, `curl`, an uninstrumented `fetch`) sent
  none, so each side minted its own and the request reached the collector split in half. The trace is
  now resolved once per request and shared, and the run hangs under the HTTP span rather than beside
  it.
- d15f888: OTLP span attributes with a fractional value are serialized as `doubleValue` instead of `intValue`.
  `cost.usd` was the attribute this broke: it reached the collector as `{"intValue":"0.0031"}`, a
  string that is not an integer in the field reserved for integers. Integral values are unchanged.
- c4a3b4d: A `POST` carrying a JSON body reaches its `/api` route under `theokit start`. Every such request hung
  forever — no status, no error, no timeout, the connection simply stayed open and the handler was
  never called — while `theokit dev` answered the identical request in single-digit milliseconds.

  The agent auxiliary branch ran for every URL and built a Web `Request` from the Node one _before_
  asking whether it owned the path. That conversion wraps the Node readable with `Readable.toWeb()`,
  which drains it, and a Node stream drains once. The API branch then reached `parseJsonBody`, attached
  an `'end'` listener to a readable that had already ended, and waited for an event that cannot fire
  twice. `theokit dev` was unaffected because its middleware matches the aux paths before it converts.

  `serveAgentAuxRoute` now takes a deferred `WebRequestSource` instead of a `Request`: it answers every
  fall-through from the URL, the method and the agent table alone, and calls `toRequest()` only on a
  path it is about to answer. The same ordering fault reached agent routes (`POST /api/agents/<name>`)
  and controller routes as a silently empty body rather than a hang; both are fixed by the same change.
  Actions (`/api/__actions/…`) were never affected — they matched their prefix before the aux branch
  ran.

  Second layer, so the next occurrence is legible rather than silent: `parseRequestBody` refuses a
  stream that has already ended, with a named `RequestBodyConsumedError` and a 500 — the framework
  drank the body, so it is not the caller's 400 to fix. A declared-empty body (`content-length: 0`)
  stays the absent body it is.

- 4f87d93: `createProductionLoader` now loads user-authored `.ts` modules through the importer that carries the
  tsx fallback, instead of calling `import()` and relying on the CLI bin having registered a global
  `tsx/esm` hook. A caller that reached it any other way — a test booting the real request handler, an
  application embedding the framework — failed with `ERR_UNKNOWN_FILE_EXTENSION`, or with
  `__filename is not defined in ES module scope`.

  Production is unchanged in cost: the importer tries the native import first, so with the hook
  registered it takes exactly the path it took before.

- b099d6d: The agent SSE response tells the path not to buffer it.

  It sent two headers, so any intermediary that buffers by default — nginx, a compressing reverse
  proxy, a CDN edge — was free to hold an entire agent run and hand the user one block at the end. The
  server streamed correctly and told nobody downstream, which breaks exactly where it is hardest to
  notice: behind someone else's proxy, in production, looking correct.

  `cache-control: no-cache` and `x-accel-buffering: no` now ship on every SSE response — the encoder,
  the thread route and the reconnect replay, which already shared one constant.

  The Vercel AI SDK, whose wire this mirrors, sends a fifth header that is deliberately not included:
  `connection: keep-alive` is hop-by-hop, Node manages keep-alive itself on HTTP/1, and on HTTP/2 Node
  drops it with `UnsupportedWarning: The provided connection header is not valid`. It would buy
  nothing on one protocol and print a warning per response on the other.

- 4205c22: `theo start` reads `HOST` and `PORT`, so a container built from the documented path is reachable and
  listens where its platform put it. Explicit `config.host` still wins, and `host: false` outranks the
  environment. The startup line now states the bound address instead of always printing `localhost` —
  a server bound to every interface and one bound to the loopback used to log the same thing.
- d222546: Both static-file servers now refuse to serve a file that lives outside the directory they were
  configured to serve, and each of them reads the file it checked rather than re-resolving the path.

  The traversal guards were operating on the path _string_ while the read operated on the
  _filesystem_, and a symlink is exactly the case where those two disagree. `serveStaticFile` resolved
  to absolute and compared the result against `clientDir`; `createStaticHandler` rejected `..` and `//`
  segments in the request pathname. Neither touches the disk, so an entry inside the served directory
  that pointed somewhere else passed both checks and the server returned the target's contents — any
  file the server process could open, to an unauthenticated `GET`. Serving a directory that also
  receives uploads, or unpacking an archive that carries a symlink, is enough to put one there.

  Containment is now decided by `realpath`, which asks the filesystem the question the string check
  cannot answer. Symlinks are not banned: one whose target stays inside the served tree is ordinary and
  is still served. Leaving is what is refused, and it is refused as "not here" rather than `403`, so
  the response does not confirm what exists outside. A URL that walks out with `..` still gets its
  `403`.

  The same lines carried a second defect. Each server resolved the path more than once — check the
  existence, stat the type or the size, then read the bytes — so what was checked was not necessarily
  what was served. Each now opens one descriptor and does both through it. Where a size _limit_ was
  enforced this was the limit being bypassable rather than enforced: the custom error pages
  (`MAX_ERROR_HTML_BYTES`) and the OpenAPI spec endpoint (`MAX_SPEC_BYTES`) both measured one file and
  could read another. `@theokit/http` additionally reported `content-length` from a separately sampled
  `stat.size` while the body came from its own read, so a file that changed size between the two
  produced a response whose declared length disagreed with its body; the length now comes from the
  bytes that were actually read.

  A path that stays inside its root behaves exactly as before — same status, same headers, same bytes.

- ad7078f: Every published subpath of `theokit` resolves in dev again.

  A Vite alias whose `find` is a **string** matches by prefix, and every entry in the plugin's alias
  cascade pointed at a _file_. So `theokit/client` → `client/index.ts` rewrote `theokit/client/core`
  into `…/client/index.ts/core`, and the build died with `ENOTDIR`. The only way around it was to
  import the barrel instead, which pulls React into code that was written to avoid it.

  The barrels are exact-match now, and one generic rule resolves everything else under the package.
  That is the part that matters: the previous fix for this same defect enumerated the known subpaths
  and put the bare alias last, which repaired the listed ones and left every unlisted one broken. A
  list that must grow with the exports map is the mechanism that failed twice.

  Two subpaths do not mirror the source layout and stay explicit — `theokit/react-query` (moved to a
  sibling file) and `theokit/devtools/entry` (source carries a `/dom/` segment the dist flattens).

  Also fixed by the same change: a package merely _named_ like ours — `theokit-anything` — was being
  rewritten by the bare prefix alias.

- fea9c59: The release gate can pass again.

  `changeset version` bumps the scaffold template's `theokit` pin to the version the Version Packages
  PR is what publishes, so in the window between the bump and the publish every job that installs a
  scaffolded app failed on `ERR_PNPM_NO_MATCHING_VERSION`. Three of those are required checks on
  `main`, which has `enforce_admins: true` — so the release could not be merged by anyone, and the
  integration test's own failure message asked for the impossible: "publish the pending release and
  re-run", when publishing requires the merge the failing check refuses.

  Two changes. The `Scaffolded app typechecks` job scaffolds with `--skip-install`: the CLI's install
  ran BEFORE the step that points the app at this working tree, so it resolved from npm — which also
  means the job had been measuring the published package rather than this tree whenever the pin
  happened to resolve, the defect #420 reports. The root install two steps later is what actually
  links the app, so the CLI's was redundant here.

  `tests/integration/pnpm-11-compat.test.ts` now skips that window instead of failing it, with the
  pins named in the skip reason. Its subject is pnpm 11's build-approval behaviour, and a dependency
  that cannot be resolved is not that subject. The decision is a pure function in
  `scripts/unpublished-pins.ts` with six unit tests, deliberately narrow: only first-party names, and
  only a range that names exactly one version — a missing third-party package still fails, and a range
  it cannot parse is never read as missing.

- 2893c89: A run's trace no longer depends on which endpoint started it. The thread message route
  (`POST /api/agents/<name>/threads/<sessionId>/message`) dropped the incoming `traceparent`, so the
  same header produced the caller's trace on the plain POST and a freshly minted one on the thread
  route. Both endpoints now open their spans through one function, so the trace continued is the trace
  of the request that started the run — including for a follow-up queued behind an active run, which
  outlives the request that queued it.
- 7606af3: The webhook signature validators are reachable from the package.

  `handleChannelWebhook(request, path, { validators, onMessage })` takes a REQUIRED `validators` map,
  and its own docblock demonstrates `{ slack: slack({...}), telegram: telegram({...}) }` — while
  `server/webhook` re-exported none of the six providers sitting beside it. Nothing shipped: the
  published bundle carried no `providers/` file, and the string `x-telegram-bot-api-secret-token`
  appeared nowhere in `dist/`.

  So the channel-webhook seam could not be wired by a consumer at all: the parameter was required and
  no value for it existed. The framework's own test imports the providers by relative source path,
  which is why nothing noticed — it proves the function works and says nothing about whether anyone
  can call it.

  `discord`, `github`, `slack`, `stripe` and `telegram` are now exported from `theokit/server/webhook`
  with their options types, covered by a test that failed with `expected 'undefined' to be 'function'`
  before the change. Found while writing the `theokit-gateways` scaffold skill and failing to write
  its example (theokit-gateways B-011).

- Updated dependencies [a896e4a]
- Updated dependencies [d9e98e0]
- Updated dependencies [da4db56]
- Updated dependencies [3762c7d]
- Updated dependencies [5f90ddd]
- Updated dependencies [c131170]
- Updated dependencies [bbdfc15]
- Updated dependencies [c8022db]
- Updated dependencies [0e9e6dc]
- Updated dependencies [4411a59]
- Updated dependencies [e29e22e]
- Updated dependencies [d4da51b]
- Updated dependencies [d222546]
- Updated dependencies [a5c6353]
- Updated dependencies [3126e58]
  - @theokit/agents@11.0.0
  - @theokit/presenter@0.8.0
  - @theokit/http@1.1.1

## 0.49.0

### Minor Changes

- Wave 0.5 of the framework-parity programme: the subsystems that shipped built, tested and unreachable are now wired, and the ones that could not be wired were deleted rather than left to look present.

  **Access control is the same decision on every transport.** A route can declare `policy`, and the Node executor, the Web executor and the in-process caller all evaluate it from one function — so a route reached from a desktop shell or a terminal gets the decision it would get from a browser. It ran no authorization at all in-process before. `requireOwner` answers "may this subject touch this record" once, where every action used to answer it alone.

  **BREAKING: `executeWebRequest` enforces CSRF unless it is explicitly turned off.** Omitting `csrfMode` used to mean no check. A route opts out per-route with `csrf: false`, which that executor now honours — the public contract had always promised it and only the Node executor delivered. See `MIGRATION.md`.

  **An agent run emits telemetry.** Spans for the run, each tool call, each human-in-the-loop pause, and the token usage and cost, read off the wire stream the agent already emits. The exporter drains on its interval and on SIGTERM instead of accumulating forever, and bounds what it holds. Production also stops discarding an incoming W3C `traceparent`, and the correlation header it falls back to is validated before it reaches the logs.

  **The cache subsystem works.** `revalidateTag`, `revalidatePath` and `updateTag` are public and threw in every application, because the engine they resolve was never initialized. It is initialized at boot, a configured `defaults` reaches it, and the `X-Theo-Cache` signal survives a production build.

  **Streaming SSR serves a document.** With `ssrStreaming: true` both renderers returned a bare React tree — no `<html>`, no `<head>`, no hydration data — so a streamed page loaded no stylesheet and re-fetched everything the server had just sent.

  **Routing and build output are correct.** Dynamic route precedence is compared per segment, so a request no longer reaches a generic handler past an authorization check placed on the specific route. Build-time scanners order by code unit rather than by collation, including the one that decides middleware execution order.

## 0.48.14

### Patch Changes

- `--example=<name>` no longer points at a repository that never existed. A bare name resolved against a hard-coded examples repository that returns 404 under both orgs, so the named form could only fail — by shelling out to `degit` and then printing that same dead URL as the place to browse examples. A bare name is now refused immediately, naming the form that works; `--example=https://github.com/user/repo` is unchanged.

  The theme contract is no longer re-exported from the Vite plugin. The re-export was kept "so existing importers keep working"; there are none — every consumer imports `core/contracts/theo-ui-theme.js` directly.

## 0.48.13

### Patch Changes

- **The server bundle no longer loads pages lazily, so SSR renders the whole document at once.**

  Pages were `React.lazy` in both builds. That is right for the browser, which downloads one page's
  JavaScript instead of all of them, and wrong for the server, which has every chunk on local disk. A
  lazy page suspends on first render regardless of caching — the `import()` settles a microtask after
  the render — so `onShellReady` flushed the layout alone and the page arrived afterwards inside a
  hidden div for a client script to move into place. Readers watched the document assemble itself:
  measured on a production site at CLS 1.12 against a 0.1 budget, with `<footer>` served ahead of
  `<article>`.

  The route manifest is now generated per environment: lazy for the browser, static imports for the
  server. Piping still happens on `onShellReady`, which React 19 requires — piping on `onAllReady`
  throws "React currently only supports piping to one writable stream" on every request. Nothing
  suspends now, so the shell IS the document. (usetheokit/theokit#323)

## 0.48.12

### Patch Changes

- Republish of 0.48.11 with the lint fixes applied. 0.48.11 reached the registry from a working tree
  whose commit was then rejected by the pre-commit hook, so the tag and the source did not match.
  No behaviour differs between the two.

## 0.48.11

### Patch Changes

- **Route preloading never actually preloaded anything on nested routes** — on the server or the
  client. `__theoPreloadMap` is keyed by absolute path (`'/docs/*'`), while `matchRoutes` reports each
  route's own `path`, which is relative to its parent (`'*'`). The `p in __theoPreloadMap` filter
  therefore matched nothing for any route below the root, and the lookup failed silently: no error, no
  warning, just a preload that did nothing.

  On the client that meant the Suspense-during-hydration safeguard in `entry.ts` had never fired for a
  nested route, despite the comment describing exactly the failure it was meant to prevent. On the
  server it meant the fix released moments earlier in 0.48.10 was inert.

  The manifest now emits `__theoPreloadPathsFor`, which rebuilds the absolute path by accumulating
  segments down the match chain, and both entries use it.

## 0.48.10

### Patch Changes

- **SSR no longer serves an empty shell first.** Pages are `React.lazy()` in the route manifest, and
  the server rendered without resolving those modules — so React suspended on the page component,
  `onShellReady` fired with the layout alone, and the actual page streamed afterwards inside a hidden
  div. Every reader watched the page assemble itself.

  Code-splitting earns its keep in a browser, which downloads one page's JavaScript instead of all of
  them. The server has every chunk on local disk and loads it regardless, so the suspension bought
  nothing and cost a two-phase render. The generated server entry now matches the URL against the
  routes and awaits the same `__theoPreloadMap` entries the client already awaits before
  `hydrateRoot`; `React.lazy` then resolves from cache without suspending. Streaming still applies to
  genuine data-fetching Suspense.

  Measured on a production documentation site: CLS 1.12 against a 0.1 budget, largest paint at 4.8s,
  and `<article>` absent from the DOM for the first ~700ms — the served HTML placed `<footer>` ahead
  of `<article>`, so the footer was laid out and then pushed down. (usetheokit/theokit#323)

## 0.48.9

### Patch Changes

- **`theokit start` now applies the rate limit for every config shape the schema accepts, and can key
  buckets correctly behind a reverse proxy.** Two security fixes that had to land together.

  The server only ever built a limiter for the legacy flat `{ windowMs, max }` shape. A per-route
  config — the shape that exists so an expensive endpoint can get a tighter budget than the rest of
  the app — produced no limiter at all, and the request handler skipped limiting on every request.
  Nothing warned: the app booted clean and the config validated. Measured on the app that found it, 20
  requests against a 12-per-minute budget and 150 against a 120-per-minute one returned zero 429s. The
  correct implementation already existed in `createRouteRateLimiter`, handling both shapes, and simply
  had no caller. (usetheokit/theokit#321)

  Rate limiting by IP also keyed on `req.socket.remoteAddress`, which behind Caddy, nginx, a load
  balancer or an ingress controller is the proxy — one bucket for the entire internet. That is worse
  than no limit: a handful of requests exhausts the budget and every other visitor is refused, so any
  single client can deny the endpoint to everybody. Rate limit config now takes `trustProxy`
  (`false` by default, `true` for one proxy, or a hop count), and resolves the client address from
  `x-forwarded-for` counting in from the right, past exactly the declared hops. It stays off by
  default because that header is client-writable, and honouring it uninvited turns the limiter into a
  one-header bypass. (usetheokit/theokit#322)

## 0.48.8

### Patch Changes

- Inline scripts written into `index.html` now receive the per-request CSP nonce in production, not
  only in dev. The nonce differs per request while the head half of the template is computed once at
  startup, so production was serving the template's scripts unstamped and a nonce-based CSP blocked
  them.

  The visible cost fell on the standard cure for a flash of the wrong theme on load: a small
  synchronous script in `<head>` that sets the theme attribute before the first paint. Blocked, the
  page painted with the default palette and repainted once React hydrated — a white flash on every
  reload of a dark-themed site, in production only.

## 0.48.7

### Patch Changes

- The template is no longer split at a `<div id="root">` that appears inside an HTML COMMENT. A
  comment that merely documents the mount point moved the split before `</head>`, so the "head"
  half held no `</head>`, head injection quietly did nothing, and every rendered page lost its
  metadata with no error anywhere. All three split sites (dev middleware, `theokit start`, the
  static adapter) now share `findRootDiv`, which masks comments first.

- Head hoisting now fails safe. When the metadata cannot be injected into the head, it stays in the
  body instead of being stripped from one place and added to neither — misplaced tags still work
  after hydration, deleted ones never do.

## 0.48.6

### Patch Changes

- Head hoisting now also applies to `theokit start`, not just the dev server. 0.48.5 fixed the dev
  middleware alone, so a production build still shipped each route's metadata inside the body —
  previews worked while developing and silently did not in the deploy, which is worse than not
  working at all. (usetheokit/theokit#319)

## 0.48.5

### Patch Changes

- A hyphenated agent name no longer generates code that cannot be parsed. `agents/ask-theo.ts` is
  named `ask-theo`, and the exported binding was emitted verbatim as `export const ask-theo` —
  breaking the generated `.theokit/agents.d.ts` and the virtual `@theo/agents` runtime module.
  Names now become camelCase identifiers (`askTheo`) while the route keeps its kebab form.
  (usetheokit/theokit#318)

- `ssr: true` hydrates again in development. The nonce for the CSP is now minted before
  `transformIndexHtml` and stamped onto the inline scripts it injects, so Vite's React refresh
  preamble is no longer blocked. Previously the page rendered and never hydrated, with a console
  error that blamed Vite. (usetheokit/theokit#319)

- A route's `<title>`, `<meta>` and `<link>` now reach the served `<head>` under SSR, on both the
  dev server and `theokit start`. React only hoists them in the browser after hydration, so they
  used to ship inside the body — invisible to every crawler that does not run JavaScript, which is
  every social-media unfurler. (usetheokit/theokit#319)

- `ui.theme` accepts the themes `@theokit/ui` actually ships. It was a closed enum of
  `violet-forge | noir | paper`, two of which never existed, so the only accepted value was the
  default and every real theme name was rejected.

## 0.48.4

Broken publish — shipped unresolved pnpm `workspace:` ranges and is uninstallable through npm.
Deprecated on the registry; use 0.48.5.

## 0.48.3

### Patch Changes

- Updated dependencies [7519927]
- Updated dependencies [0513d03]
- Updated dependencies [01735c7]
- Updated dependencies [4cd49ef]
  - @theokit/agents@10.0.0

## 0.48.2

### Patch Changes

- 9af5256: `theokit` now requires `@theokit/sdk@^4.52.1` as a peer (was `^4.49.0`).

  The old floor was already unreachable: `@theokit/agents` depends on `^4.52.1` and `theokit` depends
  on `agents`, so no real install tree ever resolved 4.49.x. The manifest advertised a combination
  nobody tested — the exact divergence the peer-range suite exists to catch.

- Updated dependencies [299a014]
- Updated dependencies [d6a5928]
- Updated dependencies [6b15741]
- Updated dependencies [b8f47a9]
- Updated dependencies [7825605]
- Updated dependencies [c70eadb]
- Updated dependencies [339852d]
- Updated dependencies [b30fe9f]
- Updated dependencies [e7c4d28]
- Updated dependencies [b023cef]
  - @theokit/agents@9.4.0

## 0.48.1

### Patch Changes

- Updated dependencies
  - @theokit/agents@9.0.0

## 0.48.0

### Minor Changes

- M79–M86 — o que o framework passou a oferecer para um produto de agente, tudo aditivo aqui.

  **`theokit doctor`.** `theokit info` responde "meu projeto parseia?"; a pergunta de um produto de
  agente é outra — **o que esta instalação vai fazer?**: qual credencial, quais servidores MCP, quais
  subagents. A regra dura: uma credencial é reportada como `present`/`absent`/`unreadable` e **nunca**
  como valor — nem prefixo, nem truncamento, nem comprimento. Um doctor que imprime segredo é o único
  comando feito para suporte que você não pode colar num pedido de suporte.

  Um `.mcp.json` **ausente** é aviso (a maioria dos projetos não usa MCP, e falhar aí faria uma
  instalação saudável sair não-zero, e o CI aprenderia a ignorar o comando); um que **existe e não
  parseia** é falha, porque o operador acredita que ele está em efeito.

  **`theokit agent <name>` sem mensagem entra em modo interativo.** Recusar era o que deixava a
  primitiva de roteamento de comando sem consumidor de produção, e fazia a primeira coisa que um
  usuário novo roda falhar com texto de uso — o que lê como "isto está quebrado", não como "passe um
  argumento". A superfície interativa é injetada: importá-la aqui faria toda instalação carregar um
  runtime Ink por causa de um comando ao qual a maioria passa mensagem.

  **`resolveProvider` / `registerProvider` / `ProviderDescriptor` deixam de ser inalcançáveis**
  (ADR 0041). Estavam marcados `@public` no próprio JSDoc e exportados por nada. A alternativa —
  deletar o registry e tirar as URLs de vendor de `packages/` — foi medida e rejeitada: o SDK não
  possui as baseUrl dos providers, então os três endpoints migrariam para a config de cada app,
  quebrando o `theokit dev` zero-config.

  **Os erros de agente entram na tabela de fronteira HTTP.** Um `GuardrailViolationError` — lançado
  quando um guard de prompt-injection ou PII **bloqueia** — atravessava como HTTP 500,
  indistinguível de falha real de servidor, e middleware de retry reenviava a entrada bloqueada.
  Agora: bloqueio ⇒ 400, budget ⇒ 429, aprovação pendente ⇒ 403.

## 0.47.0

### Minor Changes

- ed9197d: M67 — the config/trust/wiring family crosses the layered boundary, and the `@theokit/sdk` floor rises
  to `^4.49.0` to make that possible.

  **Installation-contract change.** `theokit` and `@theokit/presenter` publish `@theokit/sdk` as a
  `peerDependency`; raising the floor means a consumer pinned below 4.49.0 will now fail peer
  resolution. Sized as a minor rather than a major because the change is additive at the API level —
  nothing is removed or renamed — but the peer floor is a real break at install time and is called out
  explicitly here rather than left for the consumer to discover.

  Six values (`foldLayers`, `verifyLayerOrdering`, `applySecurityFloor`, `resolveTrustPosture`,
  `auditEnvReachability`, `recordWiring`) and two types (`WiredEntity`, `ToolResultContentBlock`) now
  cross `@theokit/agents`. Four more arrived with the floor: `classifySessionArtifact` +
  `SessionArtifact`, `atomicWriteTempTarget`, `writableRootsFor`, `assertSecureModes`.

### Patch Changes

- Updated dependencies [762c446]
- Updated dependencies [ed9197d]
- Updated dependencies [92b962a]
  - @theokit/agents@7.5.0
  - @theokit/presenter@0.7.0

## 0.46.1

### Patch Changes

- 95b8e94: `publishConfig.provenance` sai dos pacotes: ele nunca produziu attestation e impedia o publish
  manual (#169).

  O npm recusa attestation de provenance para repositório-fonte **privado** (E422), e este repo é
  privado. Medido: nenhuma versão publicada de nenhum pacote daqui tem `dist.attestations` não-nulo —
  o campo era aspiracional desde o primeiro release.

  O custo não era só cosmético. `provenance: true` no `publishConfig` vence a flag `--no-provenance` e
  a variável `npm_config_provenance`, então com o CI quebrado o `theokit` ficou **sem via de release
  nenhuma**: nem automática, nem manual.

  Quando o repo for público, o campo volta junto com `NPM_CONFIG_PROVENANCE` e os trusted publishers.

## 0.46.0

### Minor Changes

- a6dd4c1: O piso de `@theokit/sdk` passa a ser o mesmo em todo o monorepo — `^4.40.0` (#183).

  Três pacotes declaravam o mesmo requisito de três formas: `@theokit/agents` exigia `^4.40.0` como
  dependência direta, `theokit` aceitava `^4.0.1` no peer, e `@theokit/presenter` aceitava `>=3.5.0` —
  uma major inteira abaixo.

  Um app que **honrasse o peer** e instalasse, digamos, `@theokit/sdk@4.5.0` satisfazia `theokit` e não
  satisfazia o `agents`, então o resolvedor instalava uma **segunda cópia**. Duas cópias produzem dois
  tipos nominalmente idênticos e estruturalmente incompatíveis, com a mensagem mais confusa do
  ecossistema:

  ```
  SandboxBackend is not assignable to SandboxBackend
  ```

  Isso já custou uma sessão de debug a um consumidor.

  **Nenhuma configuração que funciona hoje quebra.** Quem já está em `>= 4.40.0` não é afetado; quem
  está abaixo já recebia a cópia dupla — a mudança troca uma falha confusa de tipo por um erro claro
  de instalação. O que a declaração permitia e não funcionava, ela deixa de permitir.

### Patch Changes

- Updated dependencies [a6dd4c1]
  - @theokit/presenter@0.5.0
  - @theokit/agents@7.3.1

## 0.45.0

### Minor Changes

- O TheoKit passa a ser dono do wire `UIMessageStream`: instalar `theokit` não traz mais o `ai`.

  Schema, parser e reconstrutor vivem em `@theokit/presenter/wire`. **O formato da frame não muda** —
  um cliente ai-sdk continua conversando com um servidor TheoKit, e nenhum app existente precisa
  migrar. `ai` deixa de ser `peerDependency`; quem o declarava só por causa do TheoKit pode removê-lo.

  Por que **minor** e não major: nada que um consumidor faz deixa de funcionar. Remover um peer é
  relaxamento, não quebra; os tipos são estruturalmente compatíveis (medido: as declarações do ai-sdk
  não têm brand), então código que ainda importa de `ai` segue compilando. O `@theokit/presenter` ganha
  `zod` como peer — a única exigência nova, e ele está em 0.x.

  Correções que vêm junto, todas de defeitos que existiriam em qualquer parser de wire escrito sem
  elas:

  - O frame terminal `data: [DONE]` não é JSON. Sem guarda, um parser quebraria no **último frame de
    toda resposta**.
  - Terminadores CRLF/CR passam a ser normalizados. Sem isso, um proxy que os reescreve produzia
    silêncio total — nem erro, nem renderização.
  - Um erro de provider no meio do stream preserva o texto já entregue e só então falha.

  `ai` permanece como `devDependency`: um teste diferencial alimenta o mesmo stream nele e no nosso
  parser, exigindo saída idêntica variante por variante. É o que torna a reimplementação verificável
  em vez de uma aposta.

### Patch Changes

- Updated dependencies
  - @theokit/presenter@0.4.0
  - @theokit/agents@7.1.0

## 0.44.3

### Patch Changes

- Updated dependencies
  - @theokit/agents@7.0.0

## 0.44.2

### Patch Changes

- Updated dependencies [24c8011]
  - @theokit/agents@6.0.0

## 0.44.1

### Patch Changes

- Updated dependencies [6aa5b6d]
  - @theokit/agents@5.0.0

## 0.44.0

### Minor Changes

- f099ff9: M79 — o CLI sobe para a linha 4.x de `@theokit/agents`, colapsando as duas cópias.

  O fonte já declarava `"@theokit/agents": "workspace:^"`; o pin `^0.44.6` existia apenas no pacote
  publicado, porque o CLI não era republicado desde que `agents` foi para a linha 4.x. O skew de quatro
  majors do mesmo pacote dentro de um processo era **atraso de publicação**, não acoplamento
  arquitetural.

  A razão registrada para não fazer isso estava obsoleta há vários milestones: um comentário no
  consumidor afirmava que o CLI usava a free function `agent()` removida no M57, e por isso a segunda
  cópia seria "inevitável". Ele não usa — zero chamadas no fonte, apenas uma menção em comentário.
  `tests/unit/cli-agents-line.test.ts` é o oráculo que faltava, com contraprova para não valer por
  vacuidade.

  Acompanha `@theokit/agents@4.19.0`, onde os três `@theokit/sdk*` deixaram de ser `peerDependencies` e
  viraram `dependencies` — peer permanece só para o genuinamente substituível (`zod`, `ai`,
  `@theokit/http`).

### Patch Changes

- Updated dependencies [9aea11c]
  - @theokit/agents@4.25.0

## 0.43.12

### Patch Changes

- Updated dependencies [fcd1536]
  - @theokit/agents@4.0.0

## 0.43.11

### Patch Changes

- Updated dependencies [96c0b05]
  - @theokit/agents@2.0.0

## 0.43.10

### Patch Changes

- Updated dependencies [b77cf03]
  - @theokit/agents@1.0.0
  - @theokit/http@1.0.0

## 0.43.9

### Patch Changes

- Updated dependencies [5793ec1]
  - @theokit/agents@0.47.0

## 0.43.8

### Patch Changes

- Updated dependencies [70a4daa]
  - @theokit/agents@0.45.0

## 0.43.4

### Patch Changes

- 95bc32e: M35 (multimodal) — `streamAgentTurnInProcess` (the in-process agent-turn seam the TUI runs on) now accepts an optional `images` field on its input and threads it to `streamAgentUIMessages`, so an image sent from the composer reaches `agent.send({ text, images })`. Absent ⇒ the string turn is byte-unchanged (back-compat). Requires `@theokit/agents` >= 0.44.5.

## 0.43.2

### Patch Changes

- 6bcfafa: Surface in-process agent stream errors in the unified client. A provider failure (401/429/5xx) arrives as a `{ type: 'error', errorText }` chunk rather than a thrown rejection; `consumeChunkStream` now captures it via `readUIMessageStream`'s `onError` + `terminateOnError` and rethrows, so `AgentClient`/`useAgent` settle to `status: 'error'` with `error.message` set instead of silently ending in `'done'`. This makes a failed turn visible (e.g. the scaffold's `<Notice variant="error">` renders) instead of leaving a dead UI. The stale-drive abort path is covered so an aborted turn's error chunk never clobbers a newer live turn. Fixes #136.

## 0.43.1

### Patch Changes

- Updated dependencies [d398561]
  - @theokit/agents@0.43.0

## 0.43.0

### Minor Changes

- Ecosystem integration guarantee for the `@theokit/sdk` seam (M48) — the load-bearing seam (the SDK is the only agent runtime) is now drift-guaranteed to the same FAANG-grade posture as the `@theokit/ui` and TheoCloud seams.

  - **Tool handlers now see `ctx.threadId` (the run's session identity, #119) and `ctx.messages` (the turn transcript, SE12).** The local `CustomTool` type mirror is synced to the SDK and kept in sync by a `.test-d.ts` type gate, so a future SDK `ctx` change fails `tsc` instead of drifting silently — a stateful tool can scope state per session instead of leaking it.
  - **`theokit start` fails fast when the installed `@theokit/sdk` is incompatible** — a typed `SdkIncompatibleError` (found-vs-required) at boot, instead of only a per-request error. An api-only app with no SDK installed still boots (the SDK is an optional peer).
  - **Closed the SDK-family peer ranges** (`@theokit/sdk-tools` `>=0.11.0` → `^0.11.0`) and added a consumer + producer contract test plus a version-drift guard so a breaking SDK change is caught in CI or at publish, never in production.

  No action needed for apps already on `@theokit/sdk ^4.0.1`.

### Patch Changes

- Updated dependencies
  - @theokit/agents@0.42.0

## 0.42.0

### Minor Changes

- Adopt `@theokit/sdk@^4.0.1`. Agent conversation history now persists **automatically** via the SDK's native Claude-shaped `.jsonl` transcript — no storage adapter to wire. The framework roots each app's transcript under `<projectRoot>/.data/agent-sessions` (git-ignore `.data/`).

  **Breaking:** the pluggable conversation-storage surface is removed (SDK 4.0 no longer ships it). `AgentBuilder.conversationStorage()` and the `@Conversation` decorator are gone. Apps that passed a storage adapter should delete that wiring — persistence is on by default. Sessions still thread by `sessionId` for resume.

### Patch Changes

- Updated dependencies
  - @theokit/agents@0.41.0

## 0.41.0

### Minor Changes

- 2cfc717: Opt into `.theokit/` file-based config with `.settingSources([...])`.

  A code-created agent can now discover its skills, subagents, hooks, MCP servers, context, and cron jobs from files under `.theokit/` — config-as-git. Add `.settingSources(['project'])` to the `agent()` builder and the framework wires the SDK's `local.settingSources` + the app-root `cwd`, so the SDK discovers `<cwd>/.theokit/` (and `~/.theokit/` with `'user'`).

  ```ts
  export default agent()
    .model('openai/gpt-4o-mini')
    .system(BASE_INSTRUCTIONS)
    .settingSources(['project']) // ← discover .theokit/ from the app root
    .build()
  ```

  - `.settingSources([...])` is an Axis-A "SWAP" value (per the `agent-dynamic-config` blueprint): an explicit, non-empty list wins; `[]` is treated as unset; an agent that declares inline `.skills()` still falls back to `['project']` (back-compat). Discovery is now **decoupled from inline skills** — an agent can use `.theokit/hooks.json` / `mcp.json` / subagents / context with no inline skill.
  - The app-root `cwd` is the **framework-resolved project root** threaded through `mountAgent`, NOT `process.cwd()` (which is not guaranteed to be the app root) — so discovery reliably points at `<app>/.theokit/`.
  - The SDK owns discovery + execution (skill loading, hook shell execution, MCP launch); theokit only wires `local.settingSources` + `cwd` (G2 / ADR-0040 — no runtime reimplementation).
  - **Security:** enabling `'project'` enables shell-executing hooks from `.theokit/hooks.json`. This is opt-in because `.theokit/` is your own repo (informed consent).

  Verified end-to-end in a real browser: a showcase agent with `.settingSources(['project'])` discovered a `.theokit/skills/` skill and listed it alongside its inline skill.

### Patch Changes

- Updated dependencies [2cfc717]
  - @theokit/agents@0.40.0

## 0.40.0

### Minor Changes

- f61b77f: Adopt `@theokit/sdk@3.x` (SE36 uniform `X.create()` API).

  SDK v3.0 removed the standalone factory functions in favor of static `X.create()` namespace methods. The `@theokit/agents` bridge now binds the new names — `Tool.create` (was `defineTool`), `SkillReadTool.create` (was `defineSkillReadTool`), `Retry.create` (was `withRetry`) — and the scaffold's code-defined skill uses `Skill.create` (was `createSkill`). While migrating, the tool-handler wrapper (`withRunContext`) was fixed to forward the **full** tool `ctx` — the SE12 `messages` transcript projection was being dropped, which would have silently broken a tool that reads the turn transcript; the handler types now track the SDK's canonical `CustomTool['handler']` instead of a hand-maintained duplicate.

  **Breaking (peer requirement):** `theokit` and `@theokit/agents` now require `@theokit/sdk >= 3.5.0` (and `@theokit/sdk-tools >= 0.9.1`, the SE36-migrated build). Apps on `@theokit/sdk@2.x` must upgrade — run `npx @theokit/codemod-sdk-3-0 --write` to migrate app code that calls the old factories directly.

### Patch Changes

- Updated dependencies [f61b77f]
  - @theokit/agents@0.39.0

## 0.39.1

### Patch Changes

- 083ad1e: Fix `ReferenceError: agentHandle is not defined` in the browser when binding an agent by handle (`import { chat } from '@theo/agents'; useAgent(chat)`).

  The generated runtime `@theo/agents` module re-exported `agentHandle` (`export { useAgent, agentHandle } from 'theokit/client'`) and then called it — but `export { x } from '…'` re-exports the name without creating a local binding, so `agentHandle('/api/agents/chat')` threw at module evaluation and the whole chat surface fell into the error boundary. `agentHandle` is now `import`ed (a local binding) and only `useAgent` is re-exported. Regression-guarded by a unit test over the extracted `generateAgentsRuntimeModule`, and verified end-to-end in a real browser (message → streamed agent reply). Shipped in `theokit@0.39.0` (M47); fixed here.

## 0.39.0

### Minor Changes

- acdf585: `@Expose` decorator — make an agent's exposure visible in one code review (M47, ADR-0059).

  Put a `@Controller('/api/agents')` class with `@Expose(chatAgent, { csrf: true })` (+ `@UseGuards(...)`) next to your other controllers, and a reviewer sees in one file WHAT the agent is (`chatAgent`, built separately in `agents/chat.ts`), WHERE it's served (`POST /api/agents/chat`), and its security. The agent stays built separately; the exposure is explicit and opt-in — the zero-config `agents/*.ts` convention is unchanged.

  On the frontend, `import { chat } from '@theo/agents'; useAgent(chat)` binds with **no magic string and no duplicated input type**: the path comes from the generated typed handle and `send` is inferred from the agent's `.input()` (cmd-click `chat` → `agents/chat.ts`). The same handle drives every surface — web `useAgent(chat)`, terminal `useAgent(chat.inProcess(run))`, desktop `createAgentClient(chat.channel(source))`.

  - `@theokit/http` gains the `Expose` decorator + `ExposeOptions`/`ExposeEntry` types, the `WalkResult.agent` field, a `serveAgent` seam on `createDecoratorHandler` (http stays agent-runtime agnostic), and `@UseGuards` widened to a `PropertyDecorator` (per-agent auth on the `@Expose` property).
  - `theokit` gains `AgentHandle` / `agentHandle` in `theokit/client`, a `useAgent(handle)` overload, and codegen that emits one typed handle per agent.
  - One runtime under it all (`mountAgent`): `@Expose`, `@Agent`, and the file convention are authoring surfaces, not competing paths (a grep gate proves no parallel agent streamer ships).

### Patch Changes

- Updated dependencies [acdf585]
  - @theokit/http@0.7.0

## 0.38.0

### Minor Changes

- c8ceb5e: `useAgent` now exposes the whole conversation as `thread`, not just the current turn (M46, #125, ADR-0058).

  The client store (`theokit/client/core`) accumulates a surface-agnostic `thread: UIMessage[]` — committed turns + the current user message + the in-flight streaming assistant — with stable message ids, committed exactly once, cleared only by `reset()`. Render `const { thread } = useAgent(...)` (or `createAgentClient(...).getState().thread` from the React-free core) instead of hand-rolling a transcript from per-turn `messages`. Same shape on web, desktop (Tauri) and TUI.

  - Per-turn `messages` keeps its exact back-compat semantics — `thread` is purely additive; existing call sites are untouched.
  - The `@theo/agents` codegen types `thread` automatically (it emits the `UseAgentReturn` interface name).
  - An errored or aborted turn is dropped rather than corrupting committed history; stale (aborted) drives never append.
  - **create-theokit:** the scaffolded web, TUI, and desktop apps now render `useAgent().thread` directly — the ~88-line hand-rolled transcript (local history + commit-once effect + inflight-merge) is gone from all three surface templates.

- 55afcec: Decorator controllers now reach parity with file-based `route()` inside a theokit app (#122).

  Put a `@Controller` class in `server/controllers/*.controller.ts` and in `theokit dev` its routes are **served** alongside file-based routes — sharing CSRF, security headers, CORS, rate-limit, and plugins — and **typed** in `@theo/client` as `client.<ns>.<method>()` with the response type inferred from the handler and `:id` params typed from the route pattern. File-based routes take precedence; a controller only answers paths they miss.

  - File-based routes, the deploy manifest, and the routes-only typed client are unchanged (the swc transform is a strict no-op outside `controllers/`; controllers stay out of `generateManifest`).
  - Request `@Body`/`@Query` types are `unknown` for now — parameter decorators are invisible to the type system (#124); runtime `@Body` Zod validation is unaffected.
  - Production `theokit start` serving of controllers is tracked separately (#123).
  - `@theokit/http` gains `transformControllerSource`, `createDecoratorHandler`, `isControllerClass`, `loadControllerWithSwc`, `loadControllersFromGlob` + supporting types so the framework reuses http's swc + dispatch rather than duplicating them.

### Patch Changes

- Updated dependencies [55afcec]
  - @theokit/http@0.6.0

## 0.37.0

### Minor Changes

- a3cf6e8: Plugin hooks now receive a Web `Request` as `ctx.request` in every runtime (#119, ADR-0056). Previously the
  Node server (`theokit dev` / `theokit start`) passed plugin `onRequest` / `preHandler` / `onResponse` /
  `onError` hooks a Node `IncomingMessage`, while the edge adapters passed a Web `Request` — so a hook reading
  `ctx.request.headers.get(...)` worked on the edge but threw on Node (and vice versa for `.headers[...]`).
  `PluginContext.request` is now typed `Request` and built once per request from the `IncomingMessage`
  (headers/URL/method; the body is read by the handler via `ctx.body`). Sibling of the #117 route-handler fix.

  **Migration (breaking type change):** a plugin hook that read `ctx.request` as a Node `IncomingMessage`
  (`.socket`, `.rawHeaders`, `.on('data')`, `.headers[name]`) must switch to the Web `Request` API
  (`ctx.request.headers.get(name)`, `ctx.request.url`, `ctx.request.method`). An audit of the first-party
  plugins found no hooks affected.

## 0.36.1

### Patch Changes

- fc3cc06: Fix (#117): route handlers now receive a Web `Request` as `ctx.request` in the Node server (dev + `theokit start`),
  matching the public `request: Request` handler type and ADR-0028 R3a. Previously the Node executor leaked
  the raw `IncomingMessage`, so any Web-standard use of `ctx.request` — e.g. `ctx.request.headers.get(...)` or
  `createSessionManagerWeb.getSession(ctx.request)` — threw `request.headers.get is not a function` at runtime
  even though it type-checked. This made the framework's own Web session primitive unusable from a handler in
  the Node server. The handler request carries method + URL + headers (the request body remains available via
  the typed `ctx.body`, since the Node stream is already parsed before the handler runs).

## 0.36.0

### Patch Changes

- Bump the `@theokit/agents` floor to `^0.38.0` — the runtime auto-wires the `skill_read` tool for agents
  that declare inline skills via `.skills([...])`. No theokit API change.

## 0.35.0

### Patch Changes

- Bump the `@theokit/agents` floor to `^0.37.0` so the framework compiles agents that declare inline
  `createSkill` skills via `.skills([...])`. theokit's own code is unchanged, but the compile path
  (`compileAgentModule` → `compileAgentDefinition`) must be the version that splits a mixed skills list
  into `skills.enabled` + `skills.inline`; an older `@theokit/agents` would mis-map an inline object into
  `enabled`. No app-facing API change.

## 0.34.0

### Minor Changes

- **`theokit generate schedule` now emits the framework-native `defineCron`, discovered from
  `agents/schedules/`.** The previous template used the SDK's programmatic `Cron.create` (needs a manual
  `Cron.start()`, no deploy integration). The generated schedule is now
  `export default defineCron(name, { schedule, handler })` — auto-discovered by `theokit build` and
  translated to the deploy target's native cron (Vercel/Cloudflare/AWS). The build-time cron scanner now
  walks BOTH `server/crons/` (backend trigger) and `agents/schedules/` (scheduled agent run, kept in the
  agent domain) via the new `scanCronDirs([...])`, with a unified duplicate-name guard across both homes.
  A scheduled agent run stays in the agent domain AND is a first-class framework cron.

## 0.33.0

### Minor Changes

- **Capability generators now live in the agent domain and connect to the agent.** `theokit generate
workflow|eval|sandbox|schedule|memory <name>` emits under `agents/<capability>/` (not the app root) —
  these are facets of the agent domain, not standalone top-level concerns. The folder-semantic scanner
  now also skips `agents/{workflows,evals,memory}` (it already skipped `sandbox`/`schedules`), so none
  become phantom routes. The emitted examples are wired to the agent: `sandbox` is a `tool()` you add
  with `.tool(...)`; `memory` shows `.conversationStorage(...)` (new in `@theokit/agents@0.36.0`);
  `eval`/`schedule` mirror the agent's model + system prompt; `workflow` documents `agentStep`.

## 0.32.0

### Minor Changes

- **Capability generators.** `theokit generate <capability> <name>` now scaffolds a minimal, runnable
  example of five SDK capabilities — `workflow`, `eval`, `sandbox`, `schedule`, `memory` — alongside the
  existing `route`/`action`/`page`/`ws`/`controller`/`agent`/`toolbox`/`resource` kinds. Each emitted file
  type-checks against `@theokit/sdk`; `workflow` and `sandbox` run standalone. Learn the API by reading real
  code (`rails g` style) instead of hunting docs.

## 0.30.0

### Minor Changes

- de88047: **M44 — standalone typed agent client-SDK (no React) over the same store.**

  Consume an agent from a node script, a CLI, a test, or a non-React UI — the same seam, no React in your
  bundle. `createAgentClient(transport, { context? })` (from the new React-FREE entry `theokit/client/core`)
  returns a plain handle over the framework-agnostic `AgentClient` store: `send` / `abort` / `reset` /
  `approve` / `reconnect` / `subscribe` / `getState`, plus an ergonomic `stream(input): AsyncIterable<UIMessage>`
  that yields the assistant message as it streams (the last value is the final result; a failed turn rejects
  the iterator). It drives ANY transport (`HttpTransport` over node fetch, `InProcessTransport`,
  `ChannelTransport`) and supports the M43 per-request `context`. `theokit/client/core` imports no React
  (verified by an import-graph test); `theokit/client` also re-exports `createAgentClient` for React apps'
  convenience. No new store (wraps the existing `AgentClient` — G12), no runtime change (G2). Completes the
  theokit↔sdk DX track (M41 web+TUI, M42 Tauri, M43 context, M44 standalone). ADR-0053.

## 0.29.0

### Minor Changes

- fe62624: **M43 — request-context / auth parity across every transport.**

  Attach per-request context — an auth token, a tenant id, a provider selection — once on `useAgent`, and
  it reaches EVERY transport uniformly. `useAgent(pathOrTransport, { context })` accepts a `RequestContext`
  (`{ headers?, metadata? }`) or a resolver evaluated on every send/reconnect (so a rotating JWT is never
  stale — reuses M41's live-ref pattern). Each transport maps context to its native mechanism:
  `HttpTransport` → `context.headers` become request headers; `InProcessTransport` → `context.metadata` is
  forwarded to the runner as `InProcessRunInput.context`; `ChannelTransport` → `context.metadata` is
  forwarded to the injected `start(turn)` as `turn.context`. Threaded through the seam's existing
  `ChatRequestOptions` (`headers`/`metadata`) — no new channel. Context stops at the transport boundary
  (never enters the SDK runtime — G2). Calls without `context` behave exactly as before (back-compat).
  ADR-0052.

## 0.28.0

### Minor Changes

- 8bdfd8c: **M42 — Tauri desktop on the unified client: `ChannelTransport` (push) + reconnect parity.**

  The Tauri desktop webview now consumes agents through the SAME `useAgent` as web + terminal. Ships
  `ChannelTransport` — a `ChatTransport<UIMessage>` (the M41 seam) over an INJECTED Tauri-`Channel`-shaped
  push source (`{ start(turn, { onLine, onClose, onError }), settle? }`), so core imports no `@tauri-apps/*`
  and the transport is unit-tested with a fake. `sendMessages` bridges pushed JSONL `UIMessageChunk` lines
  into a `ReadableStream` (a malformed line is skipped, never fatal); `abortSignal` tears down the source;
  `reconnectToStream` returns `null` — the honest parity for a single-process push surface (the M36 sidecar
  runs the turn directly; durable `runId` reconnect stays web-only, M37); `approve` routes to the injected
  `settle`. `useAgent(channelTransport)` drives the desktop webview with the same return shape — no bespoke
  `channel.onmessage` reader. The shared `extractLastUserText` helper is factored out (DRY across the
  in-process + channel transports). Runtime/definition/compile untouched (G2). ADR-0051.

## 0.27.0

### Minor Changes

- 069df66: **M41 — Unified typed agent client on the AI SDK `ChatTransport` seam (web + TUI).**

  `useAgent` is now ONE hook over one seam, driving the agent identically on every surface. It adopts the
  AI SDK's `ChatTransport` (already a peer dependency) as the transport interface and ships two
  implementations: `HttpTransport` (web — wraps the existing `POST /api/agents/<name>` UIMessageStream SSE,
  the `x-theokit-run-id` header, and the M37 durable reconnect endpoint, byte-identical to before) and
  `InProcessTransport` (terminal/desktop — wraps `streamAgentTurnInProcess`; `reconnectToStream` → `null`,
  mirroring the AI SDK's `DirectChatTransport`). `useAgent(pathOrTransport)` drives both: pass a path string
  (web, wrapped in `HttpTransport`) or an `AgentTransport` (the TUI passes an `InProcessTransport`). The
  hook's logic lives in a framework-agnostic `AgentClient` store bound via React's native
  `useSyncExternalStore` — no new dependency.

  The return shape gains two additive methods (existing call sites keep working): `approve(id, decision)`
  settles a paused HITL approval via the transport's HITL path (HTTP `POST /approve/<id>` for web; the
  inline callback in-process), and `reconnect()` resumes an interrupted stream (M37 for web; a no-op
  in-process). The generated `@theo/agents` client keeps the name-typed `useAgent<K>(name)` overload and
  adds a `useAgent(transport)` overload. Runtime, agent definition, and compile are untouched (client /
  boundary only — G2). Foundation of the theokit↔sdk integration DX track: M42 (Tauri `ChannelTransport` +
  reconnect parity), M43 (request-context/auth parity), M44 (standalone typed client-SDK) build on the same
  seam. See ADR-0050.

## 0.24.0

### Minor Changes

- **M37 — resumable / reconnectable agent streams (durable transport over SSE).**

  The durable-transport half of Mastra-style durable agents, over the existing `agents/*.ts → SSE` surface. Every agent run now carries a stable transport `runId` in the `x-theokit-run-id` response header, and each SSE frame gains a monotonic `id:` line. A new `GET /api/agents/<name>/runs/<runId>/stream` endpoint replays the frames a dropped client missed (via SSE-native `Last-Event-ID`) then follows the live tail — so a client can reconnect, or a second client observe a run a first started, without missing chunks. Frames are buffered in a per-run `RunEventCache` (in-memory default; a persistent backend plugs in behind the interface — no broker in core); the atomic `attach()` guarantees no gap / no dup across the reconnect boundary. Transport-only (ADR-0046): wraps `streamAgentUIMessages`, never a new loop — the agent loop + suspend/resume stay in `@theokit/sdk`. `untilIdle` + a shipped persistent cache backend are named follow-ups.

## 0.23.1

### Patch Changes

- Republish fix: 0.23.0 was accidentally published with an unresolved `@theokit/agents: workspace:^` dependency (npm publish does not rewrite the pnpm workspace protocol; #92 regression). 0.23.1 is published via `pnpm publish`, which rewrites it to a real version range. 0.23.0 is deprecated on npm.

## 0.23.0

### Minor Changes

- 0e01bc6: M35 — TUI terminal-only in-process surface (Model A).

  - `theokit/server` exports `streamAgentTurnInProcess(mod, apiKey, { message, awaitApproval? })`: run an
    agent turn in a SINGLE process — no HTTP loopback, no port, no CSRF — reusing `compileAgentModule` +
    `streamAgentUIMessages` (zero runtime reimplementation, G2). HITL is resolved INLINE via a caller
    `awaitApproval` callback (the Claude Code / Codex single-process shape); a gated agent run without a
    resolver throws `InProcessApprovalRequiredError` (fail-closed — the #99 lesson). Parity with the HTTP
    mount is by construction: both call the same `streamAgentUIMessages`.
  - `@theokit/agents` now publicly exports the `HitlDecision` type — the settled approval decision an
    `awaitApproval` resolver may return (bare boolean OR `{ approved, reason?, payload? }`).

### Patch Changes

- Updated dependencies [0e01bc6]
  - @theokit/agents@0.35.0

## 0.22.1

### Patch Changes

- Security: MCP `tools/call` no longer bypasses HITL approval (#99). A tool gated by `.approval()` /
  `@HumanInTheLoop` was executed unguarded when invoked via MCP `tools/call`; now `callTool` receives
  `compiled.hitl` and refuses a gated tool with an `isError` result before invoking the handler
  (fail-closed). Non-gated tools are unaffected.

## 0.16.0

### Minor Changes

- eb1b70e: Agent capabilities batch M9–M17.

  - **M9 Guardrails** — `defineAgent({ guardrails })`: input/output guards at the boundary (`promptInjectionDetector`, `piiDetector`, `unicodeNormalizer`, `costGuard`, `outputModeration`), input applied fail-fast, output moderated before reaching the client.
  - **M10 Lifecycle hooks** — `createToolHooksPlugin({ beforeToolCall, afterToolCall, beforeLLMCall, afterLLMCall })` over the SDK's native tool/LLM hooks.
  - **M11 Conversation scoping** — `deriveConversationId`/`parseConversationId` for collision-safe `{resource, thread}` isolation.
  - **M12 Delegation hooks** — `onDelegationStart`/`onDelegationComplete` on `delegate()` (+ abortSignal, docs).
  - **M13 Per-request skills resolver** — `defineAgent({ skills: (ctx) => string[] })` resolved against the run-context at mount.
  - **M14 HITL surface** — `defineAgent({ approvals })`, `GET /api/agents/:name/approvals`, `toolName` forwarded to the registry.
  - **M15 A2A** — `buildAgentCard` + served at `/.well-known/<name>/agent-card.json`; `createA2ATool` client with auth.
  - **M16 MCP** — `buildMcpToolDescriptors`/`mcpServerInfo` + served at `POST /api/agents/<name>/mcp` (JSON-RPC).
  - **M17 ACP** — `AcpMessageDecoder`/`encodeAcpMessage` framing, `AcpClient`, and `createACPTool` + `NodeAcpTransport` (subprocess) with a required `onPermissionRequest` gate.

  Governance: ADR-0040 (runtime-vs-home boundary).

### Patch Changes

- Updated dependencies [eb1b70e]
  - @theokit/agents@0.31.0

## 0.15.2

### Patch Changes

- 3a812f2: Fix: a fresh `npx create-theokit` failed `npm install` with an `@theokit/ui` peer `ERESOLVE`. `theokit`'s optional `@theokit/ui` peer range (`^0.14.0 || ^0.18.0 || ^0.19.0`) did not include the published stable major `@theokit/ui@1.0.0` that the default template pins (`^1.0.0`). npm is strict on optional-peer conflicts (pnpm only warns, which is why the M6 pnpm dogfood missed it). The peer range now includes `^1.0.0`. Proven end-to-end: a fresh scaffold installs (0 vulnerabilities) and `theokit build` succeeds. Regression-guarded by the `@theokit/ui` peer-range tests.

## 0.15.1

### Patch Changes

- 2302dcb: M6 dogfood fixes — two real V1 bugs surfaced by a live `npx create-theokit` run.

  - **Tool calls crashed** (`TypeError: ... reading 'def'`): `buildSdkTools` re-ran `defineAgentTool`'s
    already-lowered JSON-Schema tool through the SDK's `defineTool` (which expects a live Zod schema).
    It now routes by `inputSchema` shape — Zod schema → `defineTool`; already-SDK-ready `CustomTool`
    (JSON-Schema `inputSchema`) → forwarded raw. Regression test + confirmed minimal repro.
  - **Fresh scaffold failed to start** (`ERR_PACKAGE_PATH_NOT_EXPORTED` on `@theokit/sdk/compaction`):
    the default template pinned `@theokit/sdk@^1.1.0`, below the `@theokit/agents@0.30.0` peer floor
    (`>= 2.13.0`). Bumped the template + fixture pins to `^2.13.0`.

- Updated dependencies [2302dcb]
  - @theokit/agents@0.30.1

## 0.15.0

### Minor Changes

- 604bca9: Cohesive agent harness (M4, Eixo C) — make the shipped-but-dead `@HumanInTheLoop` + `@Checkpoint`
  decorators functional as an adapter over `@theokit/sdk`, with no parallel runtime (ADR 0038).

  - **`@HumanInTheLoop`** now pauses the run before a gated tool: the stream emits the ai-sdk-native
    `tool-approval-request` chunk and the run stays paused (the SDK's own awaited `pre_tool_call`
    hook) until `POST /api/agents/<name>/approve/<approvalId>` resolves it — approve runs the tool,
    deny/timeout surfaces the denial and the run continues.
  - **`@Checkpoint({ storage: 'filesystem' })`** emits a transient `data-checkpoint` part and selects
    the SDK's durable `FileSystemConversationStorage`, so a same-session follow-up request resumes.
  - The M2 file convention gathers a class agent's `@Mixin` toolboxes so a gated tool actually gates
    through the endpoint. `@theokit/agents` adds `createHitlPlugin`; `theokit` adds the approve route
    - in-process approval registry. Additive — the M2 surface is unchanged.

- 55d11ca: Terminal harness (M5, Eixo D) — run a local agent in the terminal, reusing the M4 harness with a
  Node-stdlib render surface (no new runtime, no TUI dependency; ADR 0039).

  - `theokit agent <name> "<message>"` scans `agents/<name>.ts`, compiles it via the M4
    `compileAgentModule` (through the framework's own Vite transpile), and runs it through
    `streamAgentUIMessages` — rendering streaming text, tool cards, a checkpoint notice, and errors to
    the terminal.
  - A `@HumanInTheLoop`-gated tool prompts `Approve <tool>? (y/N)` inline and resolves the SAME
    in-process approval registry the web approve-route uses (single-process CLI = the registry
    singleton's exact fit). A non-interactive terminal auto-denies (fail-safe).
  - New: `renderAgentStreamToTerminal` + `promptTerminalApproval` + `runAgentInTerminal` (injectable
    I/O for testability). Additive — the M2/M4 surface is unchanged.
  - `theokit agent` loads `.env` before resolving the provider key (parity with `theokit dev`), exits
    non-zero when the run ends in an error, and the approval prompt shares the gated tool's
    `@HumanInTheLoop` timeout so it can never hang the CLI after the run has settled.

### Patch Changes

- Updated dependencies [604bca9]
  - @theokit/agents@0.30.0

## 0.14.0

### Minor Changes

- 7a03feb: BREAKING — remove the pre-M2 proprietary agent surface (M3 clean break, no compat layer). Pre-1.0 convention: a breaking change rides a MINOR bump (0.13.0 → 0.14.0) until the deliberate 1.0 stability milestone — see the ROADMAP 1.0 stability lock. This is NOT the 1.0 release.

  Deleted: the `AgentEvent` SSE protocol (`theokit/core/contracts` `AgentEvent` + variants), the server producers `defineAgentEndpoint` / `streamAgentRun` / `createConversationHistory` (and the `theokit/server/agent` subpath export, removed entirely), and the client cluster `useAgentStream` / `deriveLiveText` / `deriveError` / `consumeAgentStream` / `parseSSEChunk` / `useAgentToolCards` / `foldAgentToolCards` / `defaultResolveEnvelope` (`theokit/client`).

  Use the M2 surface (shipped in 0.13.0): create a top-level `agents/<name>.ts` that `export default defineAgent({ input, model, system, tools })` (from `@theokit/agents`) — auto-served at `POST /api/agents/<name>` on the ai-sdk `UIMessageStream` wire — and consume it with `useAgent` / `consumeUIMessageStream` (`theokit/client`). `defineAgentTool`, `provider-resolver`, and the `@Agent` decorator are unchanged.

  Migration guide: `docs/migration/0.13-to-0.14-agent-surface.md`.

## 0.13.0

### Minor Changes

- a1182ae: Ship an agent by writing one file — the zero-config `agents/<name>.ts` convention (theokit-ai-first M2, Eixo B).

  Create a top-level `agents/support.ts` that default-exports `defineAgent({ input, model, system, tools })` and TheoKit auto-serves `POST /api/agents/support` at both `theokit dev` and the built server — streaming the M0/M1 canonical `UIMessageStream`. On the client, `import { useAgent } from '@theo/agents'` gives a typed React hook: `useAgent('support').send(input)` where `input` is inferred end-to-end from the agent's Zod schema via the generated `.theokit/agents.d.ts` — zero manual type wiring. The hook reconstructs the streamed assistant messages with the `ai` package's own `readUIMessageStream` (the exact reader `@ai-sdk/react`'s `useChat` runs — no reinvented parser); `theokit/client` also exports the pure `consumeUIMessageStream` and the base `useAgent(path)`.

  `@theokit/agents` gains `defineAgent` — the canonical zero-config surface (ADR 0037) — a pure normalizer to the same SDK-ready shape the `@Agent` class decorator produces, so both surfaces converge on one runtime (`@theokit/sdk` stays the sole agent runtime). New exports: `defineAgent`, `compileAgentModule`, `streamAgentUIMessages`, `AgentDefinitionError`, `InferAgentInput`.

  The build scans a top-level `agents/` directory and records each agent in the manifest; dev and prod mount through a single shared `mountAgent` point so they never drift. The request body accepts both the `useChat` shape (`{ messages }`) and a simple `{ message }`. Agent endpoints enforce CSRF (the `X-Theo-Action` header + Origin match, strict by default) at the same mode as routes/actions — a cross-origin POST that would spend LLM tokens is rejected with 403 before it reaches the SDK. A non-agent file or an unknown route fails fast with a typed error. `/api/agents/` is a reserved prefix (a manual route there is shadowed by design, like `/api/__actions/`).

  Agents live in a top-level `agents/` (sibling of `server/`) per the LOCKED naming decision (ADR 0037). Non-breaking: additive API on both packages; the existing route/action/ws scanners still ignore `agents/`.

### Patch Changes

- Updated dependencies [a1182ae]
  - @theokit/agents@0.29.0

## 0.12.1

### Patch Changes

- 2ddfab9: Fix the coordinated-release frozen-lockfile catch-22 (#64): `packages/theo` now consumes `@theokit/agents` and `@theokit/http` via `workspace:^` instead of published-version ranges. pnpm resolves the local package in dev (the lockfile no longer churns on a same-release version bump) and converts `workspace:^` to the identical `^X.Y.Z` range at publish time — the published manifest is byte-identical, so no consumer-visible change. Matches the existing `@theokit/agents → @theokit/http = workspace:*` pattern.
- Updated dependencies [2ddfab9]
  - @theokit/agents@0.28.0

## 0.12.0

### Minor Changes

- 403fdd7: A theokit agent's text stream now speaks the Vercel AI SDK `UIMessageStream` protocol, so `@ai-sdk/react`'s `useChat` renders it with no custom adapter (theokit-ai-first M0 walking skeleton).

  `@theokit/agents` adds `translateToUIMessageStream(events, { textId })` — a pure mapping of the agent text stream to ai-sdk `UIMessageChunk`s (`start → text-start → text-delta* → text-end → finish`), surfacing an upstream stream error as an ai-sdk `error` chunk before a graceful `finish` (never swallowed, never thrown past the boundary). `theokit/server/define` adds `uiMessageStreamResponse(chunks)`, which serializes them to an SSE `Response` on the exact wire `useChat` parses (`x-vercel-ai-ui-message-stream: v1` header + `data: [DONE]` terminal). `ai` is an optional `peerDependency` (with a devDependency for local build/tests) — zero runtime weight on the agent path; `@theokit/sdk` stays the sole runtime. Additive and backward-compatible: the existing `AgentEvent` SSE path is untouched (its removal is the M3 clean break).

### Patch Changes

- Updated dependencies [8842bc6]
- Updated dependencies [403fdd7]
  - @theokit/agents@0.27.0

## 0.11.7

### Patch Changes

- Updated dependencies [c85145d]
  - @theokit/agents@0.26.0

## 0.11.6

### Patch Changes

- 068fda0: Fix `defineAgentEndpoint` returning an empty (0-byte) SSE stream for every prompt on Node ≥ 23.

  Node 23 added `http.IncomingMessage.prototype.signal` — an `AbortSignal` that fires `abort` the instant the request body is fully received (`req.complete === true`), NOT when the client disconnects. `resolveAbortSignal` duck-typed a Web `Request` as "has `.signal` with `aborted` + `addEventListener`"; on Node 24 the Node `IncomingMessage` also satisfies that shape, so the wrapper returned the request-lifecycle signal — already aborted by the time the handler primes — and closed the stream before the first `yield`. Every agent response (chat, tool calls) came back empty on Node 24.

  The fix discriminates a Node `IncomingMessage` (an `EventEmitter`, `typeof r.on === 'function'`) from a Web `Request` (no `.on`): `r.signal` is trusted directly only when the request is not a Node object. For the Node path, client-disconnect is wired to the underlying socket close (`req.socket.on('close')` — the only event that means "client gone", never fires at request-body-end), with `req`'s own `'close'` guarded by `complete` to ignore Node ≥ 23 body-end noise. Regression covered by `tests/unit/regression-2-define-agent-endpoint-node23-signal.test.ts`.

## 0.11.5

### Patch Changes

- Updated dependencies
  - @theokit/agents@0.25.0

## 0.11.4

### Patch Changes

- f5fa904: Fix `theokit build --target theo-cloud` rejecting the current manifest schema. The manifest builder emits `version: 2` whenever a project name is configured, but the TheoCloud adapter hard-rejected anything other than `version === 1`, so the build failed the version gate before producing any artifact (usetheodev/theokit#9). The adapter now accepts both v1 (deprecated) and v2 manifests and reports the consumed `schemaVersion`; truly unknown versions still throw the forward-compat guard.

## 0.11.3

### Patch Changes

- Updated dependencies [6830737]
  - @theokit/agents@0.24.0

## 0.11.2

### Patch Changes

- Updated dependencies [a4f668f]
  - @theokit/agents@0.23.0

## 0.11.1

### Patch Changes

- Updated dependencies [9c04863]
  - @theokit/agents@0.22.0

## 0.11.0

### Minor Changes

- 2f5513c: Add `AgentThinkingEvent` (`{ type: 'thinking'; content: string }`) as a fifth variant of the `AgentEvent` wire contract, exported from `theokit/client`. Additive and non-breaking — the four existing variants are unchanged and consumers that switch only on the known types are unaffected. It mirrors the `@theokit/agents` stream-layer `ThinkingEvent`, so agent apps can carry the model's reasoning end-to-end instead of dropping it at the consumer's translation boundary. The framework's own SSE producer does not emit the variant yet (documented follow-up); the immediate consumer is theocode via the `@theokit/agents` `AgentRunner.stream()` path.

## 0.10.1

### Patch Changes

- Updated dependencies [20338f5]
  - @theokit/agents@0.21.0

## 0.10.0

### Minor Changes

- 8182aba: Add a `response` Zod slot to `RouteConfig` (runtime output validation in both the Node and Web runtimes) and a `params` schema to `defineAgentEndpoint` (typed, validated path params). The Web runtime now honors `config.status` for plain-object returns, matching the Node runtime.

## 0.9.15

### Patch Changes

- Updated dependencies [45f229a]
  - @theokit/agents@0.20.0

## 0.9.14

### Patch Changes

- Updated dependencies [01e9ea8]
  - @theokit/agents@0.19.0

## 0.9.13

### Patch Changes

- Updated dependencies [6d02c56]
  - @theokit/agents@0.18.0

## 0.9.12

### Patch Changes

- Updated dependencies [6ec6124]
  - @theokit/agents@0.17.0

## 0.9.11

### Patch Changes

- Updated dependencies [208ea7f]
  - @theokit/agents@0.16.0

## 0.9.10

### Patch Changes

- Updated dependencies [d69f7b4]
  - @theokit/agents@0.15.0

## 0.9.9

### Patch Changes

- Updated dependencies [6f1a757]
- Updated dependencies [a4e1c25]
  - @theokit/agents@0.14.0

## 0.9.8

### Patch Changes

- Updated dependencies [8811577]
  - @theokit/agents@0.13.0

## 0.9.7

### Patch Changes

- Updated dependencies [47dd837]
  - @theokit/agents@0.12.0

## 0.9.6

### Patch Changes

- Updated dependencies [b1c6a71]
  - @theokit/agents@0.11.0

## 0.9.5

### Patch Changes

- Updated dependencies [13a4abc]
  - @theokit/agents@0.10.0

## 0.9.4

### Patch Changes

- Updated dependencies [079f725]
  - @theokit/agents@0.9.0

## 0.9.3

### Patch Changes

- 45b1028: Declare `@theokit/sdk` as an **optional** `peerDependency` (`>=2.9.0`). Apps using the agent layer (`@theokit/agents`, which theokit depends on) need `@theokit/sdk >=2.9.0`; previously that requirement was only carried transitively via `@theokit/agents@0.8.0`'s peer. Now theokit signals it directly so consumers get a clear install-time message. Optional — apps that don't use the agent layer are unaffected (mirrors the `@theokit/ui` optional-peer pattern).

## 0.9.2

### Patch Changes

- Updated dependencies [0620275]
- Updated dependencies [0620275]
  - @theokit/agents@0.8.0

## 0.9.1

### Patch Changes

- V3-2 follow-up — extend the `@theokit/ui` peer to also accept `^0.19.0`. The V3-2 valibot security bump shipped as `@theokit/ui@0.19.0` (its `[Unreleased]` carried Added entries → minor), but the peer published in `theokit@0.9.0` only covered `^0.14.0 || ^0.18.0`, which excludes `0.19.0` (`^0.18.0` := `>=0.18.0 <0.19.0`) — re-opening the ERESOLVE the slice set out to fix. Peer is now `^0.14.0 || ^0.18.0 || ^0.19.0`; the loop (`theokit + @theokit/ui@0.19.0`) resolves without `--force`.

## 0.9.0

### Minor Changes

- 65266c1: V3-2 — widen the optional `@theokit/ui` peer from `^0.14.0` to `^0.14.0 || ^0.18.0`. The old range caused an `ERESOLVE` when an app installed `theokit` alongside `@theokit/ui@0.18.x` (`peerOptional @theokit/ui@"^0.14.0" from theokit` conflicting with `@theokit/ui@0.14.4`), pinning consumers to the 0.14.x line — which transitively carried the HIGH-severity `valibot` ReDoS advisory GHSA-vqpr-j7v3-hqw9 (cleared in `@theokit/ui@0.18.x`). Widening the peer is additive: existing 0.14.x consumers are unaffected (guarded by `tests/unit/ui-peer-range.test.ts`), and 0.18.x now resolves without `--force`.

## 0.8.3

### Patch Changes

- Updated dependencies
  - @theokit/agents@0.7.0

## 0.8.2

### Patch Changes

- Updated dependencies [d9012b4]
  - @theokit/agents@0.6.0

## 0.8.1

### Patch Changes

- Updated dependencies [fa1518b]
  - @theokit/agents@0.5.0

## 0.8.0

### Minor Changes

- eeb044a: M7 (Tema F) — HTTP dual-surface consolidation for the convention/filesystem-route server.

  - Typed errors / 404: `theokit/server/http` now exports `TheoError`, `fromUnknown`, `NotFoundError` (throw it for an ergonomic typed 404), `serverErrorToEnvelope`, and `envelopeCodeToStatus`. The legacy Node error path routes typed errors through the same envelope translator the web path uses (untyped errors keep the legacy `INTERNAL_ERROR` 500 + masking).
  - Health/readiness: `theokit/server/define` ships `defineHealthRoute`/`defineReadyRoute`, served on the reserved `/__theo/health` (always 200 `{status:"ok"}`) and `/__theo/ready` (200/503 from your probe — a throwing probe is not-ready, never a 500) before the user catch-all.
  - Programmatic boot: new `theokit/boot` subpath ships `createConventionFetchHandler({ reservedRoutes? })` returning a socketless `{ fetch, close }` handle.

  Zero new runtime dependencies.

## 0.7.0

### Minor Changes

- f0f8270: Agent chat surfaces now have ready-made views over the event stream — no manual reducing in your components.

  - `useAgentStream` returns two new derived fields: `liveText` (the assistant's reply so far, concatenated from every message chunk) and `error` (the last error event, with its `code`/`retriable` flags intact for branching).
  - New `useAgentToolCards` hook (and the pure `foldAgentToolCards` reducer behind it) turns the raw event stream into correlated tool cards — each with `running` / `success` / `error` status — so a tool-call UI is a `.map()` instead of a state machine. Cards correlate by event `id`, with a FIFO-by-name fallback when the transport omits ids; the success/error verdict comes from an injectable `resolveEnvelope` so you can match your own tool result shape.
  - All of the above are also exported as pure functions (`deriveLiveText`, `deriveError`, `foldAgentToolCards`, `defaultResolveEnvelope`) for use outside React.

## 0.6.1

### Patch Changes

- 18d8841: Internal architecture cleanup — no public API or behavior change:

  - The framework now enforces module `_internal/` privacy at the architecture-boundary level (a build-only guard; nothing changes at runtime).
  - `core/` is kept free of Node built-in imports; the public `validateProjectStructure` export is unchanged.
  - The Vite integration no longer depends on the framework server's internal file layout, so internal reorganizations won't ripple into build tooling.

## 0.6.0

### Minor Changes

- Dynamic **page** routing — file-system page routes now support `[param]` and catch-all `[...slug]` segments (parity with API routes).
- Web-Standards request path resolves route params and runs a middleware chain (`executeWebRequest` accepts `opts.params` + `opts.middleware`; middleware may mutate `context` or short-circuit with a `Response`).

### Patch Changes

- `defineAgentTool` now accepts a zod 4 `z.object(...)` input schema (the previous check only recognized the removed zod 3 `_def.typeName`, so every agent tool was rejected under zod 4 with "inputSchema must be a ZodObject"). This unblocks the default chat surface end-to-end.
- Server-action `FormData` → Zod coercion now coerces array elements; OpenAPI emitter migrated to zod 4 internals; `csrf?: false` exposed on `ActionConfig`.
- Native-bindings preflight restored (ABI-mismatch safeguard) and `engines.node >=22.12.0` declared.

## 0.4.0-beta.0

### Major Changes

- **BREAKING — Router convention lockdown.** Scanner rejects dotted route basenames (`auth.[provider].login.ts`) with `RouterConventionError`. Use directory-nested form (`auth/[provider]/login.ts`). Codemod `theokit migrate router` handles the upgrade automatically. See [`docs/migration/0.3-to-0.4-router.md`](../../docs/migration/0.3-to-0.4-router.md).
- **BREAKING — Bundled 0.3.0 security cutover.** CSRF default flips `warn` → `strict`; CSP default flips `report-only` → `enforce`. Apps not previously sending `X-Theo-Action: 1` on POSTs now get 403. Inline `<script>` without per-request nonce now blocks. Opt-out: `security.csrf: 'warn'` and `security.cspMode: 'report-only'` in `theo.config.ts`. See [`docs/migration/0.2-to-0.3.md`](../../docs/migration/0.2-to-0.3.md).
- **Skips 0.3.0 → goes directly to 0.4.0-beta.0** because the 0.3.0 cutover calendar window was abandoned in favor of bundling both breaking surfaces in one release.

### Added

- **`theokit migrate router` CLI subcommand** — dotted-to-nested codemod with `--dry-run`, `--force` (skip EC-2 dev-server pre-flight), idempotent re-run, partial-failure observability, EC-5 case-insensitive collision detection, EC-4 test/spec file filter. Rewrites relative imports inside moved files automatically.
- **`RouterConventionError` class** (`theokit/server/scan` barrel) emitted by `scanServerRoutes` when a dotted basename is encountered.
- **`vite-plugin/server-routes-hmr.ts`** — Vite watcher invalidation for `server/routes/**` with 50 ms debounce (EC-6) so the codemod's rename storm doesn't crash the dev server.

### Fixed

- **23 routes silently transitioned from unreachable to working** in the canonical dogfood-app after migration. Every dotted route was producing either a wrong `paramNames` shape OR a URL pattern with a literal dot that the client code never hit (audit: [`docs/audit/g6-router-dogfood-app-migration-2026-06-04.md`](../../docs/audit/g6-router-dogfood-app-migration-2026-06-04.md)).

## 0.2.1

### Patch Changes

- Align `theokit` version with `create-theokit@0.2.1` per the linked-changeset invariant. `create-theokit` was bumped on 2026-05-30 to ship the stranger-template fix (`openai/` model id prefix for OpenRouter routing); `theokit` was left at 0.2.0 by oversight. No functional changes — this is a version-sync patch only.

## 0.2.0

### Minor Changes

- e761aac: Add cache primitives to `theokit/server` — closes the largest production gap vs Next.js.

  Ships 5 new public primitives:
  - **`defineCachedRoute(engine, config)`** — cache HTTP route responses with SWR + tag invalidation. Set-Cookie auto-bypasses, status `>= 400` not cached by default, GET/HEAD only (override via `cache.methods`).
  - **`defineCachedFunction(engine, fn, opts)`** — memoize server functions. Built-in `.invalidate(...args)` method on the returned wrapper.
  - **`revalidateTag(tag, opts?)`** — fan-out invalidation by tag.
  - **`revalidatePath(path, opts?)`** — sugar over `revalidateTag('_THEO_T_/path')`.
  - **`updateTag(tag)`** — Server-Action-safe immediate invalidation.

  Plus the storage layer:
  - **`CacheStorageAdapter`** interface with 7 methods (`get`, `set`, `delete`, `deleteByTag`, `size`, `clear`, `keys`).
  - **`InMemoryCacheAdapter`** default implementation — LRU + reverse tag index, O(matched-keys) `deleteByTag`.
  - **`createCacheEngine({ storage })`** factory exposing `getOrCompute`, `invalidate`, `invalidateTag`, `revalidatePath`.
  - **`initCacheEngine(config)` / `getCacheEngine()` / `_resetCacheEngine()`** singleton resolver for framework wiring.

  Helpers:
  - **`getCacheControlHeader({ maxAge, swr, isPrivate? })`** — RFC 7234-compliant header builder.
  - **`deriveCacheKey(req, opts?)`** — URL+sorted-query key derivation with `DEFAULT_EXCLUDED_QUERY_PARAMS` (25 tracking params auto-stripped, mirrors Astro list).
  - **`compileRouteRules` / `resolveRouteRule`** — first-match-wins glob matching for `theo.config.ts cache.routeRules`.
  - **`validateCacheTags` / `validateCacheMaxAge` / `validateCacheExpire`** — defensive validators.
  - **Constants**: `CACHE_TAG_MAX_LENGTH = 256`, `CACHE_TAG_MAX_ITEMS = 128`, `THEO_T_PREFIX = '_THEO_T_'`, `CACHE_DEFAULT_MAX_AGE = 1`, `CACHE_DEFAULT_MAX_ENTRY_SIZE = 10 MB`.

  Config schema (`theo.config.ts`):

  ```ts
  cache: {
    enabled: true,
    storage: 'memory',                        // or custom CacheStorageAdapter
    maxEntries: 1000,
    defaults: { maxAge: 1, cacheErrors: false },
    routeRules: { '/api/static/**': { maxAge: 300, swr: 600 } },
  }
  ```

  Edge cases handled (catalogued in `docs/reviews/edge-case-plan/caching-and-revalidation-edge-cases-2026-05-23.md`):
  - **EC-1**: `validateTags` defensive guard for non-array input.
  - **EC-2**: `varies: ['cookie']` auto-filtered + warn-once (Astro `IGNORED_VARY_HEADERS` pattern).
  - **EC-3**: Response body > 10 MB bypasses cache + warn-once (configurable via `cache.maxEntrySize`).
  - **EC-4**: Cache middleware structurally runs AFTER user middleware — auth/session/CSRF always gate first (no data leak vector).
  - **EC-5**: `picomatch` declared as direct production dependency (was relying on Vite transitive — broken in production runtime).
  - **EC-8**: Clock-skew negative-age clamped via `Math.max(0, age)`.
  - **EC-9**: `validate` callback throws → treated as miss + `onError` invoked.
  - **EC-10**: Loader returning `undefined` warn-once + skipped from cache.
  - **EC-11**: `Transfer-Encoding: chunked` responses NOT cached.
  - **EC-19**: `cache.maxEntrySize` validated at config-time.

  New dep: `picomatch ^4.0.0` (direct, production — was transitive via Vite which broke prod).

  Documentation: `docs/concepts/caching.md` (full 5-pattern guide + Redis adapter recipe + comparison vs Next.js / Nitro / Astro / TanStack).

  Reference research: `.claude/knowledge-base/reference/caching-and-revalidation.md` (4 frameworks deep-read, 14 edge cases catalogued).

  Plan: `docs/plans/caching-and-revalidation-plan.md` (13 tasks across 8 phases, 13 ADRs, 138 RED tests, 100% coverage matrix).

  Fixture: `fixtures/cache-basic/` (all 5 primitives exercised + integration test).

  Backward compatibility: 100%. The `cache` config field is optional; existing apps without `cache:` in `theo.config.ts` see zero behavior change.

- ee1b596: **theokit-evolution-ci-and-dx onda — CI gates + template DX + devtools observability.**

  This release ships 6 deliverables from the `theokit-evolution-ci-and-dx-plan.md` v1.1:

  **Templates dogfood primitives 0.5.0 (Phase 2B):**
  - `default` + `dashboard` ship `server/crons/cleanup-conversations.ts` (daily GC of stale `.theokit/agents/*` >30d)
  - `api-only` ships `server/routes/webhooks/echo.ts` (HMAC-SHA256 self-signed pattern)
  - `postgres` ships `server/jobs/log-message.ts` (defineJob enqueue pattern, ADR-0003 transactional outbox compliant)
  - `saas` ships `server/routes/billing/stripe-webhook.ts` (Stripe HMAC verify) + wires `trackAgentRun` in `server/routes/agent.ts`

  **README docs link (Phase 2A):**
  - All 5 templates ship `📚 Full docs: https://docs.theokit.dev` in header

  **Devtools `Agents` tab (Phase 3):**
  - New tab in devtools panel showing per-run telemetry: time, user, model, tokens in/out, cost USD, status
  - `dispatcher.onAgentRun(record)` wired from `trackAgentRun` in dev mode
  - Tree-shaken in prod via universal `__IS_DEV` IIFE guard (Vite OR tsup) — devtools-treeshake test stays GREEN
  - Ring buffer cap RING_BUFFER_CAP (50) for high-throughput resilience
  - Reducer: `AGENT_RUN_ADD` + `RESET_AGENT_RUNS` actions

  **Internals:**
  - `AgentRunRecord` type + `CHANNEL_AGENT_RUN` channel in `devtools/shared.ts`
  - `trackAgentRun` extended with optional `status` field (default 'finished')

  No breaking changes; all wiring is additive + opt-in via dev mode.

- 4b97fee: TheoUI default integration — `npx create-theokit my-app` now scaffolds a working agent surface out of the box.

  **`theokit`** (`0.1.0-alpha.2`)
  - `defineAgentEndpoint({ handler })` (`theokit/server`) — sugar over `defineRoute` that turns an `async *handler(): AsyncGenerator<AgentEvent>` into a Server-Sent Events response. Standards-compliant `text/event-stream` framing; respects `request.signal` for prompt cancellation; emits a final `{ type: 'error', message }` event when the generator throws.
  - `useAgentStream(path, options?)` (`theokit/client`) — React hook returning `{ events, status, send, abort, reset }`. Transport is `fetch + ReadableStream` (not `EventSource` — POST + body required). Cleans up on unmount (StrictMode-safe).
  - `consumeAgentStream(path, options)` + `parseSSEChunk(line)` (`theokit/client`) — the pure primitive the hook glues, exposed for non-React consumers and for tests.
  - Runtime `AgentEvent` discriminated union (`message | tool_call | tool_result | error`) exported from `theokit/server` and `theokit/client`. Server emits, client consumes — no cross-package type coupling with `@theokit/ui`.
  - Auto-injection of `@theokit/ui` in the dev/build pipeline: when the user's project declares `@theokit/ui` as a dependency and the package resolves, the Vite plugin emits `import '@theokit/ui/styles.css'`, `import '@theokit/ui/fonts.css'` (or `fonts-cdn.css` when configured), and wraps `RouterProvider` in `<TheoUIProvider theme={{ defaultTheme }}>`. New optional `ui` field in `theo.config.ts` (`false | { theme, fonts }`) for opt-out and theme selection. Conservative detection: package must be declared in `package.json` AND resolvable — prevents false positives in monorepos.

  **`create-theokit`** (`0.1.0-alpha.2`)
  - Default template now scaffolds an **agent surface**: `app/page.tsx` ships `AgentComposer` + `AgentTimeline` from `@theokit/ui`, `server/routes/chat.ts` is a mock SSE endpoint emitting three `AgentEvent`s. Replace the mock with your real LLM provider.
  - New `--bare` flag — skips the TheoUI defaults for users who want a minimal scaffold. Atomic rollback: if the bare transform fails for any reason (filesystem perms etc.), the entire target directory is removed so no half-scaffolded project is left behind. `--bare` is only valid with `--template=default`.
  - `@theokit/ui ^0.1.0-next.0` is now a direct dependency of the default template.

- ee1b596: **0.2.0 — Exit alpha + enforcement cutover (CSRF strict + CSP enforce).**

  This release ends the `0.1.0-alpha.*` series and ships TheoKit's first `minor` on the `latest` npm tag. It combines the maturity work consolidated under the macro-roadmap convergence list (items #1-#6 done: scaffold + agent surface + canonical chat via `@theokit/sdk` + `defineAgentTool` + `streamAgentRun` + `createConversationHistory` + example `full-stack-agent`) with the security defaults flip previously planned as 0.3.0 (commit `3ee9dac`).

  **BREAKING (per pre-1.0 semver — `minor` = breaking until 1.0):**
  - `config.security.csrf` default flipped from `'warn'` → **`'strict'`**. Every non-GET request without the `X-Theo-Action: 1` header now returns 403 `CSRF_INVALID`. The framework's own `useAgentStream` already attaches this header (`packages/theo/src/client/agent-stream-core.ts:75`); custom fetchers, raw `<form>` posts, third-party clients, and curl-based integrations must attach the header explicitly or set `csrf: 'warn'` / `csrf: 'off'` in `defineConfig` during migration.
  - `config.security.headers.cspMode` default flipped from `'report-only'` → **`'enforce'`**. Inline scripts without a per-request nonce are blocked. The SSR hydration data script the framework emits carries the nonce automatically (T7.4 wiring verified by `tests/e2e/ssr-nonce.spec.ts` 3/3 GREEN). Third-party widgets (gtag, intercom, sentry, Plausible) and any user-authored inline `<script>` must either use the nonce mechanism or set `cspMode: 'report-only'` during migration.

  **Migration path:**
  - See `docs/migration/0.2-to-0.3.md` for the audit-grep recipes (`grep '"event":"csrf.warn"' logs.json | jq '.path'` to enumerate affected endpoints).
  - Run `theokit check --upgrade-readiness 0.3` (CLI command shipped) for a static analysis of inline scripts in your `app/**` tree.
  - If you cannot fix immediately: opt out in `theo.config.ts` via `defineConfig({ security: { csrf: 'warn', headers: { cspMode: 'report-only' } } })` and migrate at your pace.

  **Also in this release:**
  - All maturity-hardening primitives (jobs / crons / webhooks / cost tracking / transactional outbox / W3C trace context).
  - TheoCloud adapter Wave 2 stub registered (Wave 3 K8s manifest emission ships in 0.6.0).
  - Devtools overlay (auto-injected dev-only floating chip + 5-tab panel).
  - Argon2id password hashing in `examples/agent-saas` via `hash-wasm`.
  - Playwright coverage for all 5 templates (`default`, `dashboard`, `api-only`, `postgres`, `saas`).
  - Native bindings preflight (`scripts/preflight-native-bindings.mjs`) detects + auto-rebuilds `better-sqlite3` ABI mismatch on test setup. See CLAUDE.md > "Native bindings discipline".

  **Honest residual:**

  The 4-6 week warn-mode telemetry window from the original 0.3.0 plan is collapsed into a single 0.2.0 release for shipping pragmatism. Consumers who need a true warn-mode interim should pin `0.1.0-alpha.17` (last alpha) and use the migration guide to transition deliberately.

### Patch Changes

- ee1b596: **FAANG-grade provider routing — Strategy + Registry pattern.**

  Provider resolution moved from per-template conditionals into a centralized Strategy + Registry inside `theokit/server`. Consumers (template `chat.ts`, fixtures) now ship **zero conditionals on provider** — the framework resolves `apiKey` + `baseUrl` automatically from the highest-priority env var present (`OPENROUTER_API_KEY` > `OPENAI_API_KEY` > `ANTHROPIC_API_KEY`).

  Inspired by Dapr Conversation Registry (`dapr/pkg/components/conversation/registry.go`) and Encore Manager provider array (`encore/runtimes/go/pubsub/manager_internal.go`).

  **New public API in `theokit/server`:**
  - `resolveProvider(): ResolvedProvider` — throws actionable error if no env var present
  - `tryResolveProvider(): ResolvedProvider | null` — graceful degradation
  - `registerProvider(descriptor: ProviderDescriptor): void` — runtime extension point (idempotent by name)
  - `resetProviderRegistry(): void` — test-only / dev escape hatch
  - `listProviders(): readonly ProviderDescriptor[]` — sorted by priority

  **`createConversationHistory` upgrade:** auto-injects `apiKey` + `providers.routes[0]` (capability=chat) into SDK options when consumer omits `options.apiKey`. Explicit `options.apiKey` always wins (escape hatch preserved).

  **Template `chat.ts` is now FAANG-clean** — pure `model: { id: 'gpt-4o-mini' }`, no `process.env.*` reads, no provider conditionals, no manual error yields.

  **Wire protocol:** OpenAI Chat Completions (universal — every provider implements it). Anthropic uses native Messages API behind the same Strategy abstraction.

- ee1b596: **Chaos helper `chaos-providers.sh` invalid-key scenario: env injection fix.**

  Previously the helper edited the sandbox `.env` to set an invalid OPENROUTER_API_KEY,
  but the parent shell's exported `OPENROUTER_API_KEY` (valid) won the precedence
  contest (process.env > .env file). The chaos test never exercised the actual
  auth-failure code path → false-negative "no error surfaced" finding.

  Fix: helper now passes invalid key via explicit `env "OPENROUTER_API_KEY=..."`
  before `theokit dev`, overriding parent shell. Now confirmed end-to-end:
  - OpenRouter returns HTTP 401
  - SDK surfaces error
  - Template `chat.ts` try/catch yields `{type:'error',message:'...auth_failed (HTTP 401)...'}`
  - Helper detects error in SSE response → PASS

  Vendored copy at `theokit/scripts/dogfood/chaos-providers.sh` byte-identical
  to meta-repo source (parity test `dogfood-helpers-vendor-parity.test.ts`
  enforces).

  Phase 5 dogfood QA final state: **100/100** (4/4 chaos PASS + 4/4 multi-template
  PASS + 6/7 lifecycle PASS — the 1 remaining lifecycle SKIP is INTERACTIVE_ONLY
  phases per plan design).

- 57cc1e4: Consolidate `theokit/react-query` as a subpath of the canonical `theokit` package.

  Previously the React Query bridge lived in two places:
  - `theokit/client` (canonical implementation)
  - A separate `packages/theokit-react-query/` package that was set to publish as `@theokit/react-query@0.2.0` but never made it to the registry (scope didn't exist).

  The split duplicated code and forced consumers to manage an extra npm dependency for what is naturally a subpath of TheoKit. The standalone package has been removed from the monorepo.

  **New surface:**

  ```ts
  import { stableQueryKey, buildUseTheoQueryConfig } from 'theokit/react-query'
  ```

  Aliases `buildUseTheoQueryInternals`, `FetcherFn`, and `UseTheoQueryInternals` are re-exported under the same subpath to preserve the names that pre-release builds of the standalone package exposed.

  This is a purely additive change — `theokit/client` continues to expose the same primitives. No code needs to change for existing users.

- ee1b596: **Templates DX overhaul + scaffold SDK wiring (fix EC-S2/S3/S6 do dogfood-stranger run 2026-05-28)**
  - **`create-theokit` templates** (default/dashboard/api-only/postgres/saas):
    - Scripts completos: `dev` + `build` + `start` + `typecheck` declarados em todos
    - `.nvmrc` com `22.12` em todos
    - `public/favicon.ico` em todos (resolve 404 cosmético EC-S8)
    - `drizzle-kit` em devDeps de postgres + saas (EC-10 SHOULD TEST)
  - **`theokit` framework** (theokit/packages/theo):
    - `vite-plugin/theoui-detect.ts` refatorado: substituído `createRequire(...).resolve()` por filesystem walk + leitura de `package.json:exports[subpath]`. **Resolve EC-S4 root cause** (Page não hidratava) — Chrome MCP confirmou `<main>`, `<header>`, `<textarea>` agora renderizam.
    - `vite-plugin/auto-detect.ts` refatorado: mesma técnica filesystem walk (eliminação de `createRequire`).
    - D13 invariant gated por `tests/integration/no-require-on-esm-only-deps.test.ts` (2 BDD it()) — previne regressão de require em `@theokit/ui` (ESM-only by design).
    - Playwright spec `tests/e2e/scaffold-page-hydrates.spec.ts` (4 BDD it()) — required CI check para hydration regression.

  ADRs:
  - [`theokit/docs/adr/0021-dogfood-stranger-coverage-expansion.md`](docs/adr/0021-dogfood-stranger-coverage-expansion.md) — D4-D14
  - [`theokit/docs/adr/0022-create-theokit-republish-with-sdk-wired.md`](docs/adr/0022-create-theokit-republish-with-sdk-wired.md) — D2/D3/D10

  Plan: [`.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md`](../../.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md) v1.1 FAANG-grade.

- ee1b596: **Finding A fix: fail-fast when no provider env + no explicit apiKey.**

  Pre-fix: `createConversationHistory` called `tryResolveProvider()` (non-throwing
  graceful), then passed undefined apiKey to SDK's `Agent.getOrCreate`. SDK
  exhibited an undocumented silent-fallback behavior — returning a canned LLM-
  shape response `"Hello! How can I assist you today?"` regardless of input.
  Stranger sem KEY pensava que o agente funcionava.

  Post-fix: `createConversationHistory` now throws actionable error when:
  - No `options.apiKey` passed (consumer override)
  - AND no `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` env

  Template's try/catch yields `{type:'error',message:'Agent error: No LLM provider API key...'}`
  SSE event with link to OpenRouter signup. Stranger now sees actionable instruction.

  Workaround for users with manual auth flow: pass `options.apiKey` explicitly —
  auto-resolution is bypassed.

  Empirically validated end-to-end (sdk-residual-behavior-2026-05-28.md):
  - `POST /api/chat` without provider env → `{type:'error',message:'...'}`
  - Unit tests: 2 new regression gates (`Finding A: throws...` + `Finding A: explicit apiKey bypasses...`)
  - Full suite 21/21 GREEN

- 4b97fee: Hotfix: default template now declares `react-router` and `zod` (theokit peer dependencies). Without these, `pnpm dev` failed immediately on a freshly scaffolded project — entry-client couldn't resolve `react-router`, and `server/routes/chat.ts` couldn't resolve `zod`. Found by running `pnpm dlx create-theokit my-app` end-to-end against the published packages. Regression test added in `tests/unit/scaffold-default-agent.test.ts` to keep peer deps locked to the template.

  Also bumps the template's `theokit` pin to `^0.1.0-alpha.4` so freshly scaffolded projects pick up this hotfix.

- ee1b596: **Template default chat.ts: surface provider errors as AgentEvent `error`.**

  Pre-fix: `streamAgentRun(run)` could silently close SSE when SDK throws on
  invalid OPENROUTER_API_KEY / rate-limit / model-not-found / 5xx. Client saw
  a closed stream with no actionable message — stranger lost context.

  Post-fix: full agent lifecycle wrapped in try/catch + caught exceptions
  yield `{ type: 'error', message: ... }` AgentEvent. Dogfood chaos Phase 12
  (invalid-key) now PASSES end-to-end.

  Validated via `run-headless.sh` Phase 5 dogfood automation
  (`dogfood-fixes-and-coverage-expansion-plan.md` v1.1 Phase 5).

- ee1b596: **Template fix: `pnpm.onlyBuiltDependencies: ["esbuild"]` para destravar pnpm 11+ approve-builds gate.**

  Sem esse hint, `pnpm install` + `theokit dev` falham com `ERR_PNPM_IGNORED_BUILDS` em pnpm 11+ (security default: build scripts de transitivas como esbuild não rodam sem aprovação explícita). Como esbuild é dep transitiva mandatória do Vite, declaramos o opt-in nos 5 templates oficiais (default, dashboard, api-only, postgres, saas).

  Stranger executando `npx create-theokit my-app && cd my-app && pnpm install && pnpm dev` agora funciona end-to-end sem `pnpm approve-builds` interactive prompt.

- ee1b596: **Template SDK bump → `@theokit/sdk@^1.2.0` (D14 fault injection available).**

  New scaffolds get the SDK with `THEOKIT_TEST_RESPONSE_OVERRIDE` fault-injection seam built in. Documented in the SDK's `docs.md` § "Test fault injection (v1.22+)". Use in `dogfood-stranger` Phase 13 (rate-limit chaos) for zero-cost / zero-quota-burn deterministic 429 / 5xx / 401 scenarios.

  No theokit code changes — this is a template-side dep bump.

- ee1b596: Bump `@theokit/ui` peerDep range from `^0.11.0-next.0` to `^0.12.0-next.0` (alinha com create-theokit templates pós-T1.1 dist-tag move).

## 0.1.0-alpha.17

### Patch Changes

- **Finding A fix: fail-fast when no provider env + no explicit apiKey.**

  Pre-fix: `createConversationHistory` called `tryResolveProvider()` (non-throwing
  graceful), then passed undefined apiKey to SDK's `Agent.getOrCreate`. SDK
  exhibited an undocumented silent-fallback behavior — returning a canned LLM-
  shape response `"Hello! How can I assist you today?"` regardless of input.
  Stranger sem KEY pensava que o agente funcionava.

  Post-fix: `createConversationHistory` now throws actionable error when:
  - No `options.apiKey` passed (consumer override)
  - AND no `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` env

  Template's try/catch yields `{type:'error',message:'Agent error: No LLM provider API key...'}`
  SSE event with link to OpenRouter signup. Stranger now sees actionable instruction.

  Workaround for users with manual auth flow: pass `options.apiKey` explicitly —
  auto-resolution is bypassed.

  Empirically validated end-to-end (sdk-residual-behavior-2026-05-28.md):
  - `POST /api/chat` without provider env → `{type:'error',message:'...'}`
  - Unit tests: 2 new regression gates (`Finding A: throws...` + `Finding A: explicit apiKey bypasses...`)
  - Full suite 21/21 GREEN

## 0.1.0-alpha.16

### Patch Changes

- **Chaos helper `chaos-providers.sh` invalid-key scenario: env injection fix.**

  Previously the helper edited the sandbox `.env` to set an invalid OPENROUTER_API_KEY,
  but the parent shell's exported `OPENROUTER_API_KEY` (valid) won the precedence
  contest (process.env > .env file). The chaos test never exercised the actual
  auth-failure code path → false-negative "no error surfaced" finding.

  Fix: helper now passes invalid key via explicit `env "OPENROUTER_API_KEY=..."`
  before `theokit dev`, overriding parent shell. Now confirmed end-to-end:
  - OpenRouter returns HTTP 401
  - SDK surfaces error
  - Template `chat.ts` try/catch yields `{type:'error',message:'...auth_failed (HTTP 401)...'}`
  - Helper detects error in SSE response → PASS

  Vendored copy at `theokit/scripts/dogfood/chaos-providers.sh` byte-identical
  to meta-repo source (parity test `dogfood-helpers-vendor-parity.test.ts`
  enforces).

  Phase 5 dogfood QA final state: **100/100** (4/4 chaos PASS + 4/4 multi-template
  PASS + 6/7 lifecycle PASS — the 1 remaining lifecycle SKIP is INTERACTIVE_ONLY
  phases per plan design).

## 0.1.0-alpha.15

### Patch Changes

- **Template default chat.ts: surface provider errors as AgentEvent `error`.**

  Pre-fix: `streamAgentRun(run)` could silently close SSE when SDK throws on
  invalid OPENROUTER_API_KEY / rate-limit / model-not-found / 5xx. Client saw
  a closed stream with no actionable message — stranger lost context.

  Post-fix: full agent lifecycle wrapped in try/catch + caught exceptions
  yield `{ type: 'error', message: ... }` AgentEvent. Dogfood chaos Phase 12
  (invalid-key) now PASSES end-to-end.

  Validated via `run-headless.sh` Phase 5 dogfood automation
  (`dogfood-fixes-and-coverage-expansion-plan.md` v1.1 Phase 5).

## 0.1.0-alpha.14

### Minor Changes

- **theokit-evolution-ci-and-dx onda — CI gates + template DX + devtools observability.**

  This release ships 6 deliverables from the `theokit-evolution-ci-and-dx-plan.md` v1.1:

  **Templates dogfood primitives 0.5.0 (Phase 2B):**
  - `default` + `dashboard` ship `server/crons/cleanup-conversations.ts` (daily GC of stale `.theokit/agents/*` >30d)
  - `api-only` ships `server/routes/webhooks/echo.ts` (HMAC-SHA256 self-signed pattern)
  - `postgres` ships `server/jobs/log-message.ts` (defineJob enqueue pattern, ADR-0003 transactional outbox compliant)
  - `saas` ships `server/routes/billing/stripe-webhook.ts` (Stripe HMAC verify) + wires `trackAgentRun` in `server/routes/agent.ts`

  **README docs link (Phase 2A):**
  - All 5 templates ship `📚 Full docs: https://docs.theokit.dev` in header

  **Devtools `Agents` tab (Phase 3):**
  - New tab in devtools panel showing per-run telemetry: time, user, model, tokens in/out, cost USD, status
  - `dispatcher.onAgentRun(record)` wired from `trackAgentRun` in dev mode
  - Tree-shaken in prod via universal `__IS_DEV` IIFE guard (Vite OR tsup) — devtools-treeshake test stays GREEN
  - Ring buffer cap RING_BUFFER_CAP (50) for high-throughput resilience
  - Reducer: `AGENT_RUN_ADD` + `RESET_AGENT_RUNS` actions

  **Internals:**
  - `AgentRunRecord` type + `CHANNEL_AGENT_RUN` channel in `devtools/shared.ts`
  - `trackAgentRun` extended with optional `status` field (default 'finished')

  No breaking changes; all wiring is additive + opt-in via dev mode.

## 0.1.0-alpha.13

### Patch Changes

- **Template fix: `pnpm.onlyBuiltDependencies: ["esbuild"]` para destravar pnpm 11+ approve-builds gate.**

  Sem esse hint, `pnpm install` + `theokit dev` falham com `ERR_PNPM_IGNORED_BUILDS` em pnpm 11+ (security default: build scripts de transitivas como esbuild não rodam sem aprovação explícita). Como esbuild é dep transitiva mandatória do Vite, declaramos o opt-in nos 5 templates oficiais (default, dashboard, api-only, postgres, saas).

  Stranger executando `npx create-theokit my-app && cd my-app && pnpm install && pnpm dev` agora funciona end-to-end sem `pnpm approve-builds` interactive prompt.

## 0.1.0-alpha.12

### Patch Changes

- **Template SDK bump → `@theokit/sdk@^1.2.0` (D14 fault injection available).**

  New scaffolds get the SDK with `THEOKIT_TEST_RESPONSE_OVERRIDE` fault-injection seam built in. Documented in the SDK's `docs.md` § "Test fault injection (v1.22+)". Use in `dogfood-stranger` Phase 13 (rate-limit chaos) for zero-cost / zero-quota-burn deterministic 429 / 5xx / 401 scenarios.

  No theokit code changes — this is a template-side dep bump.

## 0.1.0-alpha.11

### Patch Changes

- **FAANG-grade provider routing — Strategy + Registry pattern.**

  Provider resolution moved from per-template conditionals into a centralized Strategy + Registry inside `theokit/server`. Consumers (template `chat.ts`, fixtures) now ship **zero conditionals on provider** — the framework resolves `apiKey` + `baseUrl` automatically from the highest-priority env var present (`OPENROUTER_API_KEY` > `OPENAI_API_KEY` > `ANTHROPIC_API_KEY`).

  Inspired by Dapr Conversation Registry (`dapr/pkg/components/conversation/registry.go`) and Encore Manager provider array (`encore/runtimes/go/pubsub/manager_internal.go`).

  **New public API in `theokit/server`:**
  - `resolveProvider(): ResolvedProvider` — throws actionable error if no env var present
  - `tryResolveProvider(): ResolvedProvider | null` — graceful degradation
  - `registerProvider(descriptor: ProviderDescriptor): void` — runtime extension point (idempotent by name)
  - `resetProviderRegistry(): void` — test-only / dev escape hatch
  - `listProviders(): readonly ProviderDescriptor[]` — sorted by priority

  **`createConversationHistory` upgrade:** auto-injects `apiKey` + `providers.routes[0]` (capability=chat) into SDK options when consumer omits `options.apiKey`. Explicit `options.apiKey` always wins (escape hatch preserved).

  **Template `chat.ts` is now FAANG-clean** — pure `model: { id: 'gpt-4o-mini' }`, no `process.env.*` reads, no provider conditionals, no manual error yields.

  **Wire protocol:** OpenAI Chat Completions (universal — every provider implements it). Anthropic uses native Messages API behind the same Strategy abstraction.

## 0.1.0-alpha.8

### Patch Changes

- Bump `@theokit/ui` peerDep range from `^0.11.0-next.0` to `^0.12.0-next.0` (alinha com create-theokit templates pós-T1.1 dist-tag move).

## 0.1.0-alpha.6

### Minor Changes

- e761aac: Add cache primitives to `theokit/server` — closes the largest production gap vs Next.js.

  Ships 5 new public primitives:
  - **`defineCachedRoute(engine, config)`** — cache HTTP route responses with SWR + tag invalidation. Set-Cookie auto-bypasses, status `>= 400` not cached by default, GET/HEAD only (override via `cache.methods`).
  - **`defineCachedFunction(engine, fn, opts)`** — memoize server functions. Built-in `.invalidate(...args)` method on the returned wrapper.
  - **`revalidateTag(tag, opts?)`** — fan-out invalidation by tag.
  - **`revalidatePath(path, opts?)`** — sugar over `revalidateTag('_THEO_T_/path')`.
  - **`updateTag(tag)`** — Server-Action-safe immediate invalidation.

  Plus the storage layer:
  - **`CacheStorageAdapter`** interface with 7 methods (`get`, `set`, `delete`, `deleteByTag`, `size`, `clear`, `keys`).
  - **`InMemoryCacheAdapter`** default implementation — LRU + reverse tag index, O(matched-keys) `deleteByTag`.
  - **`createCacheEngine({ storage })`** factory exposing `getOrCompute`, `invalidate`, `invalidateTag`, `revalidatePath`.
  - **`initCacheEngine(config)` / `getCacheEngine()` / `_resetCacheEngine()`** singleton resolver for framework wiring.

  Helpers:
  - **`getCacheControlHeader({ maxAge, swr, isPrivate? })`** — RFC 7234-compliant header builder.
  - **`deriveCacheKey(req, opts?)`** — URL+sorted-query key derivation with `DEFAULT_EXCLUDED_QUERY_PARAMS` (25 tracking params auto-stripped, mirrors Astro list).
  - **`compileRouteRules` / `resolveRouteRule`** — first-match-wins glob matching for `theo.config.ts cache.routeRules`.
  - **`validateCacheTags` / `validateCacheMaxAge` / `validateCacheExpire`** — defensive validators.
  - **Constants**: `CACHE_TAG_MAX_LENGTH = 256`, `CACHE_TAG_MAX_ITEMS = 128`, `THEO_T_PREFIX = '_THEO_T_'`, `CACHE_DEFAULT_MAX_AGE = 1`, `CACHE_DEFAULT_MAX_ENTRY_SIZE = 10 MB`.

  Config schema (`theo.config.ts`):

  ```ts
  cache: {
    enabled: true,
    storage: 'memory',                        // or custom CacheStorageAdapter
    maxEntries: 1000,
    defaults: { maxAge: 1, cacheErrors: false },
    routeRules: { '/api/static/**': { maxAge: 300, swr: 600 } },
  }
  ```

  Edge cases handled (catalogued in `docs/reviews/edge-case-plan/caching-and-revalidation-edge-cases-2026-05-23.md`):
  - **EC-1**: `validateTags` defensive guard for non-array input.
  - **EC-2**: `varies: ['cookie']` auto-filtered + warn-once (Astro `IGNORED_VARY_HEADERS` pattern).
  - **EC-3**: Response body > 10 MB bypasses cache + warn-once (configurable via `cache.maxEntrySize`).
  - **EC-4**: Cache middleware structurally runs AFTER user middleware — auth/session/CSRF always gate first (no data leak vector).
  - **EC-5**: `picomatch` declared as direct production dependency (was relying on Vite transitive — broken in production runtime).
  - **EC-8**: Clock-skew negative-age clamped via `Math.max(0, age)`.
  - **EC-9**: `validate` callback throws → treated as miss + `onError` invoked.
  - **EC-10**: Loader returning `undefined` warn-once + skipped from cache.
  - **EC-11**: `Transfer-Encoding: chunked` responses NOT cached.
  - **EC-19**: `cache.maxEntrySize` validated at config-time.

  New dep: `picomatch ^4.0.0` (direct, production — was transitive via Vite which broke prod).

  Documentation: `docs/concepts/caching.md` (full 5-pattern guide + Redis adapter recipe + comparison vs Next.js / Nitro / Astro / TanStack).

  Reference research: `.claude/knowledge-base/reference/caching-and-revalidation.md` (4 frameworks deep-read, 14 edge cases catalogued).

  Plan: `docs/plans/caching-and-revalidation-plan.md` (13 tasks across 8 phases, 13 ADRs, 138 RED tests, 100% coverage matrix).

  Fixture: `fixtures/cache-basic/` (all 5 primitives exercised + integration test).

  Backward compatibility: 100%. The `cache` config field is optional; existing apps without `cache:` in `theo.config.ts` see zero behavior change.

### Patch Changes

- **Templates DX overhaul + scaffold SDK wiring (fix EC-S2/S3/S6 do dogfood-stranger run 2026-05-28)**
  - **`create-theokit` templates** (default/dashboard/api-only/postgres/saas):
    - Scripts completos: `dev` + `build` + `start` + `typecheck` declarados em todos
    - `.nvmrc` com `22.12` em todos
    - `public/favicon.ico` em todos (resolve 404 cosmético EC-S8)
    - `drizzle-kit` em devDeps de postgres + saas (EC-10 SHOULD TEST)
  - **`theokit` framework** (theokit/packages/theo):
    - `vite-plugin/theoui-detect.ts` refatorado: substituído `createRequire(...).resolve()` por filesystem walk + leitura de `package.json:exports[subpath]`. **Resolve EC-S4 root cause** (Page não hidratava) — Chrome MCP confirmou `<main>`, `<header>`, `<textarea>` agora renderizam.
    - `vite-plugin/auto-detect.ts` refatorado: mesma técnica filesystem walk (eliminação de `createRequire`).
    - D13 invariant gated por `tests/integration/no-require-on-esm-only-deps.test.ts` (2 BDD it()) — previne regressão de require em `@theokit/ui` (ESM-only by design).
    - Playwright spec `tests/e2e/scaffold-page-hydrates.spec.ts` (4 BDD it()) — required CI check para hydration regression.

  ADRs:
  - [`theokit/docs/adr/0021-dogfood-stranger-coverage-expansion.md`](docs/adr/0021-dogfood-stranger-coverage-expansion.md) — D4-D14
  - [`theokit/docs/adr/0022-create-theokit-republish-with-sdk-wired.md`](docs/adr/0022-create-theokit-republish-with-sdk-wired.md) — D2/D3/D10

  Plan: [`.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md`](../../.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md) v1.1 FAANG-grade.

## 0.1.0-alpha.5

### Patch Changes

- Consolidate `theokit/react-query` as a subpath of the canonical `theokit` package.

  Previously the React Query bridge lived in two places:
  - `theokit/client` (canonical implementation)
  - A separate `packages/theokit-react-query/` package that was set to publish as `@theokit/react-query@0.2.0` but never made it to the registry (scope didn't exist).

  The split duplicated code and forced consumers to manage an extra npm dependency for what is naturally a subpath of TheoKit. The standalone package has been removed from the monorepo.

  **New surface:**

  ```ts
  import { stableQueryKey, buildUseTheoQueryConfig } from 'theokit/react-query'
  ```

  Aliases `buildUseTheoQueryInternals`, `FetcherFn`, and `UseTheoQueryInternals` are re-exported under the same subpath to preserve the names that pre-release builds of the standalone package exposed.

  This is a purely additive change — `theokit/client` continues to expose the same primitives. No code needs to change for existing users.

## 0.1.0-alpha.4

### Patch Changes

- Hotfix: default template now declares `react-router` and `zod` (theokit peer dependencies). Without these, `pnpm dev` failed immediately on a freshly scaffolded project — entry-client couldn't resolve `react-router`, and `server/routes/chat.ts` couldn't resolve `zod`. Found by running `pnpm dlx create-theokit my-app` end-to-end against the published packages. Regression test added in `tests/unit/scaffold-default-agent.test.ts` to keep peer deps locked to the template.

  Also bumps the template's `theokit` pin to `^0.1.0-alpha.4` so freshly scaffolded projects pick up this hotfix.

## 0.1.0-alpha.3

### Minor Changes

- TheoUI default integration — `npx create-theokit my-app` now scaffolds a working agent surface out of the box.

  **`theokit`** (`0.1.0-alpha.2`)
  - `defineAgentEndpoint({ handler })` (`theokit/server`) — sugar over `defineRoute` that turns an `async *handler(): AsyncGenerator<AgentEvent>` into a Server-Sent Events response. Standards-compliant `text/event-stream` framing; respects `request.signal` for prompt cancellation; emits a final `{ type: 'error', message }` event when the generator throws.
  - `useAgentStream(path, options?)` (`theokit/client`) — React hook returning `{ events, status, send, abort, reset }`. Transport is `fetch + ReadableStream` (not `EventSource` — POST + body required). Cleans up on unmount (StrictMode-safe).
  - `consumeAgentStream(path, options)` + `parseSSEChunk(line)` (`theokit/client`) — the pure primitive the hook glues, exposed for non-React consumers and for tests.
  - Runtime `AgentEvent` discriminated union (`message | tool_call | tool_result | error`) exported from `theokit/server` and `theokit/client`. Server emits, client consumes — no cross-package type coupling with `@theokit/ui`.
  - Auto-injection of `@theokit/ui` in the dev/build pipeline: when the user's project declares `@theokit/ui` as a dependency and the package resolves, the Vite plugin emits `import '@theokit/ui/styles.css'`, `import '@theokit/ui/fonts.css'` (or `fonts-cdn.css` when configured), and wraps `RouterProvider` in `<TheoUIProvider theme={{ defaultTheme }}>`. New optional `ui` field in `theo.config.ts` (`false | { theme, fonts }`) for opt-out and theme selection. Conservative detection: package must be declared in `package.json` AND resolvable — prevents false positives in monorepos.

  **`create-theokit`** (`0.1.0-alpha.2`)
  - Default template now scaffolds an **agent surface**: `app/page.tsx` ships `AgentComposer` + `AgentTimeline` from `@theokit/ui`, `server/routes/chat.ts` is a mock SSE endpoint emitting three `AgentEvent`s. Replace the mock with your real LLM provider.
  - New `--bare` flag — skips the TheoUI defaults for users who want a minimal scaffold. Atomic rollback: if the bare transform fails for any reason (filesystem perms etc.), the entire target directory is removed so no half-scaffolded project is left behind. `--bare` is only valid with `--template=default`.
  - `@theokit/ui ^0.1.0-next.0` is now a direct dependency of the default template.

## [Unreleased]

> Cross-Domain Uplift: 18 tasks from `docs/plans/cross-domain-uplift-plan.md`, lifting TheoKit toward 0.2.0. Server (plugin system), adapters (5 new targets), CLI (3 new commands), router (streaming SSR), client (batching + transformer + react-query), Vite integration API. Release engineer bumps the version when shipping.

### Added

- **TheoUI default integration — Phase 6: Dogfood checks** — `scripts/dogfood-smoke.sh` extended from 15 to 19 checks. Four new theoui-specific gates: (#16) default template ships `@theokit/ui` + `AgentTimeline` + `server/routes/chat.ts`, (#17) vite-plugin auto-detects TheoUI and injects CSS + `TheoUIProvider` wrap in entry.ts, (#18) `create-theokit --bare` opt-out with EC-4 atomic rollback (`applyBareTransform` + `rmSync`), (#19) `defineAgentEndpoint` + `useAgentStream` + `consumeAgentStream` surfaces all exported. Current run: **19/19 PASS**.
- **TheoUI default integration — Phase 5: `defineAgentEndpoint` + `useAgentStream`** — closes the loop between server-emitted `AgentEvent`s and React state, with no manual SSE parser in user code.
  - **`defineAgentEndpoint({ handler })`** (server): sugar over `defineRoute` (ADR D4). Accepts `async *handler(ctx): AsyncGenerator<AgentEvent>` and returns a `RouteConfig` whose handler responds with `text/event-stream` (`data: <JSON>\n\n` framing, `cache-control: no-cache, no-transform`, `connection: keep-alive`). Observes `request.signal` and calls `generator.return()` on abort — infinite streams shut down in &lt; 100ms. Errors thrown mid-stream emit a final `{ type: 'error', message }` event before the stream closes. Re-exported via `theokit/server`.
  - **`useAgentStream(path, options?)`** (client): React hook returning `{ events, status, send, abort, reset }` where `status` is `idle | streaming | done | error`. Internally uses `fetch + ReadableStream` — **not `EventSource`** (EC-3: EventSource is GET-only and cannot carry a request body). New `send(body)` cancels any in-flight stream before opening a new connection; unmount cleanup aborts the controller (EC-8, StrictMode-safe). Re-exported via `theokit/client`.
  - **Pure SSE primitive `consumeAgentStream(path, options)` + `parseSSEChunk(line)`** extracted to `theokit/client` so the wire behavior is testable without React/DOM (handles chunk re-assembly across `read()` boundaries, malformed JSON tolerance, comment/blank-line skipping). Re-exported via `theokit/client`.
  - 7 unit tests for `defineAgentEndpoint` (header/happy/error/abort/empty/ctx) + 12 for `useAgentStream` (3 parser + 6 primitive + 3 architectural EC-3 checks).
- **`@theokit/react-query` published as its own package (closes T5.3 ressalva)** — moved the React Query primitives from `theokit/client` into `packages/theokit-react-query/`. Idiomatic install path is now `pnpm add @theokit/react-query @tanstack/react-query`. The original exports under `theokit/client` remain in place for backward compatibility (a single source of truth lives in the new package and `theokit/client` re-exports it conceptually — the implementation is duplicated as a small file rather than a runtime dependency, so `theokit` does not pull in `@tanstack/react-query`). New package version: `0.2.0`. 3 unit tests cover the public surface of the standalone package.
- **T1.2 Deno Deploy runtime wiring (CLOSURE)** — Deno adapter now drives the full `executeRoute` pipeline. Earlier iteration documented this as "blocked"; re-evaluation showed the web-shim is Web Standards-only (`Uint8Array`/`Response`/`TextEncoder`/`Headers` — no `Buffer`) and Deno Deploy supports `node:fs`/`node:path`/`node:url` compat. Template imports `theokit/server` and `theokit/adapters/web-shim` via `npm:` specifier (Deno Deploy ≥ 1.40 native). 2 new tests confirm the npm specifier wiring and pipeline import surface.
- **`scripts/dogfood-smoke.sh`** — reproducible 10-check dogfood proxy. Validates TS strict, sequential vitest, build, publint, zero-any audit, adapter dispatcher coverage, plugin/integration exports, web-shim presence, client surface. Exit code reflects PASS/FAIL with a `Health Score: X/Y` line that mirrors `/dogfood full`. Designed for environments where the slash skill cannot be invoked (CI, automation, Ralph Loop iterations). Current run: **10/10 PASS**.
- **README: `## Plugins` and `## Integrations` sections** — public-facing documentation for the new extension surfaces. Plugins section covers `defineTheoPlugin`, hook lifecycle, `decorateRequest`, and `theo.config.ts` wiring. Integrations section covers `defineTheoIntegration`, `addRoute`/`addVirtualModule`, and the EC-5/EC-6 guards. CLI section updated to enumerate all 8 build targets and the 3 new commands (`check`/`add`/`info`).
- **Web→Node shim + Phase 1 runtime pipeline wiring** — closed the "~5% remaining" gap on Bun, Netlify, and AWS Lambda adapters by extracting `createWebShim(request)` to a new entry-point `theokit/adapters/web-shim`. The shim builds a minimal IncomingMessage/ServerResponse pair around a Web Standard `Request` and resolves `toResponse()` once `res.end()` is called. **Bun adapter** now drives the full `executeRoute` pipeline through the shim — Zod validation, plugins, sessions all run inside Bun. **Netlify Functions adapter** now drives the same pipeline — including lazy module/route caching for cold-start. **AWS Lambda adapter** now converts API Gateway v2 events to Web Requests, runs the pipeline through the shim, and converts the resulting Response back to v2 result format with base64 encoding for binary content types. New exports under `theokit/server`: `scanServerRoutes`, `matchRoute`, `executeRoute`, `sendError`, `sendJson`, `createProductionLoader`, `createViteLoader`, types `ServerRouteNode`, `LoadModule`. New entry: `theokit/adapters/web-shim`. `tsup.config.ts` updated with the new entry. Tested with 6 new unit tests for the shim (request side, response side, binary preservation). Deno Deploy intentionally left un-wired in this iteration: Deno's stdlib lacks `Buffer`/`node:http` by default and forcing the shim there bloats the bundle — pending a separate refactor to make `executeRoute` accept Web Standard Request natively.
- **Deno Deploy adapter (T1.2)** — new `deno-deploy` build target. Emits `.theo/deno/server.ts` with `Deno.serve`, `Deno.env`-based config, and a runtime presence guard (`typeof Deno === 'undefined'` throws). Build orchestration is DI-friendly via `runNodeBuild`/`writeEntry`/`ensureDir`. Tested with 9 BDD unit tests.
- **Netlify Functions adapter (T1.3, EC-2 covered)** — new `netlify` build target. Emits `.netlify/functions/theo.mjs` and **non-destructively** merges `netlify.toml`. The merge is idempotent (re-running does not duplicate the `/api/*` redirect) and preserves arbitrary unknown sections like `[build]`, `[[headers]]`, `[context.production.environment]`. When an existing `[[redirects]]` block has `from = "/api/*"` pointing somewhere other than our function, the build aborts with `NetlifyConflictError` listing the conflicting target — no silent overwrite. In-house TOML scanner avoids a new runtime dependency. Tested with 12 BDD unit tests.
- **AWS Lambda adapter (T1.4)** — new `aws-lambda` build target. Emits `.theo/aws/handler.mjs` compatible with API Gateway HTTP API v2 (default). Pure helpers `eventV2ToRequestShape` and `responseToLambdaResultV2` handle event→Request conversion and base64 encoding for binary content types (`application/octet-stream`, `application/pdf`, `application/zip`, `image/*`, `audio/*`, `video/*`). Tested with 13 BDD unit tests.
- **Static adapter closure (T1.5)** — default `renderHtml` is now wired: if `.theo/server/entry-server.js` exists, dynamic-imports it and calls its `render(url)` export, injecting the rendered HTML into the `index.html` template at the `<div id="root">` split point. Falls back to the bare client shell when no SSR build is present (acceptable degradation when the user chose `ssr: false`). Default `loadStaticPaths` dynamic-imports `static-paths.ts` files and invokes their default export. Tested with 2 new integration tests using temp project directories.
- **CLI `theokit check` (T2.1)** — runs typecheck (`npx tsc --noEmit`), project scan, and optional ESLint when a config is detected. Reports per-step status (`ok`/`fail`/`skipped`) with aggregated exit code (0 if all pass, 1 if any fails). Skips `typecheck` cleanly when `tsconfig.json` is absent. Skips `eslint` when no eslintrc-like config is present. Tested with 7 BDD unit tests using full DI for spawn/fs.
- **CLI `theokit add <package>` (T2.2)** — installs a known TheoKit adapter or plugin from a hardcoded whitelist (`bun`, `deno`, `netlify`, `aws-lambda`, `static`). Detects package manager via lockfile precedence (pnpm > bun > yarn > npm; npm fallback). EC-4 security: input validated against `/^[a-z0-9][a-z0-9-]*$/` BEFORE any registry lookup — rejects shell metacharacters (`;`, `&&`, `|`), path traversal (`../`, `/`), scope syntax (`@scope/name`), uppercase, and empty input. Spawn uses array args and `shell: false` — no string concat, no shell interpolation ever. Unknown package names emit suggestion via Levenshtein distance when within edit distance 3. Tested with 17 BDD unit tests including 5 security-focused assertions.
- **CLI `theokit info` (T2.3)** — prints a Markdown diagnostic of the project: `package.json` name+version (or `(missing)`), runtime detection (Node/Bun/Deno via global checks), config load status, and route count. Never crashes — corrupted/missing `package.json` reports `(missing)`, invalid config reports `Config: INVALID — <reason>`, scan failure reports `Scan failed: <message>`. Tested with 7 BDD unit tests.
- **Vite extension API: `defineTheoIntegration` (T3.1)** — build-time integration system mirroring Astro Integrations. Public API: `defineTheoIntegration({ name, hooks })` where hooks declare any subset of `theo:config:setup` / `theo:build:start` / `theo:build:done` / `theo:dev:start`. Each hook receives a context with `addVirtualModule(id, code)` and `addRoute(path, handler)`. EC-6 enforced: virtual module IDs must start with `virtual:integration:<name>/` — anything else throws `IntegrationVirtualModulePrefixError` (prevents collisions with `/@theo/*` internals and other integrations). EC-5 enforced: `addRoute(path, handler)` throws `IntegrationRouteCollisionError` when `path` collides with a user route OR with another integration's route — no silent override. Hooks fire in registration order. Hook errors propagate wrapped with the offending integration name. Tested with 11 BDD unit tests. Exposed via `theokit/vite-plugin`.
- **Pluggable response transformer (T5.2)** — `TheoTransformer` interface (`name`, `serialize`, `deserialize`) with two built-ins: `superjsonTransformer` (default, preserves Date/Map/Set/BigInt) and `jsonTransformer` (lightweight, plain JSON). `resolveTransformer(selector)` accepts the string keys `'superjson'` / `'json'` or a custom object — validates the shape (`serialize` and `deserialize` must be functions) and throws a clear error on unknown strings or malformed customs. Tested with 10 BDD unit tests. Exposed via `theokit/server`.
- **Client batching (T5.1)** — `createBatcher({ transport, max? })` returns a `Batcher` whose `dispatch(req)` collapses all calls made within the same microtask into a single transport invocation. Per-item error isolation: a `{ error }` result in the batch response rejects only that caller's promise — other items in the same batch still resolve normally. `max` (default 32) splits oversized batches into multiple parallel transport calls. Transport failures (e.g., network) reject all pending dispatches in that batch. Tested with 6 BDD unit tests. Exposed via `theokit/client`. The default HTTP transport (`POST /api/__theo_batch__`) is left for the consumer to compose, keeping the core primitive testable without network.
- **React Query adapter primitives (T5.3)** — `stableQueryKey(path, options)` produces a deterministic `queryKey` that is equal across calls when query/body/params content is logically equal, regardless of property order or inline-object identity (EC-10: prevents inline `{ query: { search: input } }` → infinite refetch loops). `buildUseTheoQueryConfig(path, options, fetcher)` returns the `{ queryKey, queryFn }` pair to pass directly to `useQuery` from `@tanstack/react-query`. Tested with 8 BDD unit tests. Exposed via `theokit/client`. Ships inside `theokit/client` rather than a separate `@theokit/react-query` package for 0.2.0; package split is cheap to add later when downstream adopters appear.
- **T6.1 closure — `theokit start` consumes `renderStreaming`** — when `config.ssrStreaming === true` AND the SSR build emitted `renderStreaming`, the production server now uses the streaming path: pipes the React shell as soon as `onShellReady` fires, propagates an `AbortController` derived from `req.on('close')` (EC-11 client disconnect → `stream.abort()`), and falls back to a 500 with `custom500Html` on stream errors. Single-shot `render()` remains the path when `ssrStreaming` is false or `renderStreaming` is absent (backward compatible).
- **Streaming SSR (T6.1, opt-in)** — `generateEntryServer({ streaming })` now branches between the legacy `renderToString`-style single-shot entry and a new `renderToPipeableStream` streaming entry that flushes the React shell as soon as it's ready (`onShellReady`) and streams Suspense boundaries progressively. Enabled per project via new `ssrStreaming` field in `theo.config.ts` (default `false` to preserve current behavior). The streaming entry sets `Transfer-Encoding: chunked`, propagates `request.signal` into `createStaticHandler`, and registers an abort listener that calls `stream.abort()` when the client disconnects (EC-11). Single-shot `render()` export is preserved alongside the new `renderStreaming()` for backward compatibility. The Vite plugin reads `options.ssrStreaming` and passes it through. Adapter wiring (Node/CF/Bun consuming `renderStreaming` instead of `render`) is the remaining piece, tracked separately. Tested with 11 unit tests.
- **Bun adapter (T1.1)** — new `bun` build target. `theokit build --target bun` runs the standard Node Vite build, then writes `.theo/bun/server.mjs` — a Bun-runtime entry that uses `Bun.serve` + `Bun.file` (no `node:http` import). The emitted entry embeds: dev-mode guard (EC-1: `NODE_ENV !== 'production'` → `process.exit(1)`), Bun version check (`Bun.version` parsed; requires `>= 1.1`), runtime presence check (`typeof Bun === 'undefined'` aborts), and a basic static + SPA fallback request loop. Full `executeRoute` pipeline (Zod, plugins, sessions) wiring against Bun's `Request`/`Response` is left for a follow-up. `'bun'` added to `BuildTarget` enum + `VALID_TARGETS`. Adapter dispatcher updated. Tested with 11 unit tests (`buildBun` orchestration is DI-friendly via `runNodeBuild`/`writeEntry`/`ensureDir` overrides).
- **Plugin system config wiring (Phase 4 closure)** — new `plugins` field in `theo.config.ts` schema (validates as `z.array(z.unknown())` for Zod compatibility, structurally validated at runtime). New `createPluginRunnerFromConfig(plugins)` helper returns a `PluginRunner` ready to pass to `executeRoute`, or `undefined` when no plugins are configured (preserves zero-overhead path). `InvalidPluginShapeError` thrown for malformed entries with the offending index. `createApiMiddleware` extended to accept either the legacy `RateLimitConfig` directly or a new `ApiMiddlewareOptions` object including `pluginRunner` (backward compatible — discriminated by `windowMs` presence). `theokit start` now loads plugins from `config.plugins` and passes the runner to every `executeRoute` invocation. New fixture `fixtures/plugin-example/` with a real plugin (`request-id-echo`) demonstrating all four hooks plus `decorateRequest`. Tested with 8 unit tests covering null/undefined/empty/valid inputs and the three failure modes (non-object, missing name, missing register).
- **Server plugin system (T4.1 + T4.2 + T4.3 + T4.4)** — Fastify-style typed hook system for cross-cutting concerns (auth, tracing, metrics, error capture) without touching every route. Public API: `defineTheoPlugin({ name, register })` where `register(app)` receives a `TheoApp` exposing `addHook(name, fn)` for the four lifecycle hooks (`onRequest`, `preHandler`, `onResponse`, `onError`) and `decorateRequest<T>(key, value)` for type-safe ctx extension. `executeRoute` accepts an optional `PluginRunner` parameter; callers that omit it preserve 100% of the previous behavior (backward compatible). Hook ordering is registration-order. Hooks short-circuit when the response is ended (`writableEnded`/`headersSent`). EC-7 covered: `DuplicateDecorationError` thrown when two plugins decorate the same ctx key. EC-9 covered: `inErrorPath` flag prevents `onResponse` → `onError` → `onResponse` recursion. Errors thrown inside `onError` hooks are swallowed with a console.error log (no recursion possible). Exports: `defineTheoPlugin`, `PluginRunner`, `DuplicatePluginError`, `DuplicateDecorationError`, and the types `TheoPlugin`, `TheoApp`, `PluginContext`, `PluginErrorContext`, `HookName`, `HookResult`, `OnRequestHook`, `PreHandlerHook`, `OnResponseHook`, `OnErrorHook`, `RunHookOptions`. Tested with 15 unit tests (PluginRunner) + 5 integration tests (end-to-end pipeline through `executeRoute`).
- **Static adapter (T1.5, partial — pure logic + adapter shell shipped, Vite SSR render pending)** — new `static` build target that pre-renders pages to HTML files in `.theo/static/`. Supports `[id]` dynamic routes and `[...slug]` catch-all routes via `static-paths.ts` convention (EC-3 covered). Aborts the build with `StaticApiRoutesDetectedError` when `server/routes/` is present, since static export cannot host runtime API handlers. Pure path-resolution logic (`parseSegment`, `collectStaticPaths`, `StaticPathsRequiredError`) is fully tested (11 unit tests). Adapter orchestration (`buildStatic`, `staticAdapter`, `detectApiRoutes`, `StaticRenderError`) is tested with 12 unit tests using dependency injection for I/O. The default `renderHtml` throws a clear "not yet wired" error — wiring to real Vite SSR render is queued for a follow-up iteration. New `'static'` value added to `BuildTarget` enum and `VALID_TARGETS`. Fixture in `fixtures/adapter-static/` demonstrates root page, static `/about`, dynamic `/blog/[id]`, and catch-all `/docs/[...slug]`.

### Changed

- License set to **Apache-2.0** (was unset in `package.json`). Aligns with Theo open-core pillars — see root `CLAUDE.md` strategic review of 2026-05-14.

## [0.1.0-alpha.0] - 2026-05-09

### Added

- `defineConfig` identity function with Zod schema validation via `loadConfig`
- `defineRoute` with typed query, body, params via Zod generics
- `defineAction` with required Zod input schema
- `defineMiddleware` with `await next()` pattern using Web Standards Request/Response
- `validateProjectStructure` for opinionated project validation
- File-based routing via React Router v7 with nested layouts, error boundaries, and not-found pages
- `theoPlugin` Vite plugin with virtual modules (`/@theo/entry-client`, `/@theo/route-manifest`)
- API route execution pipeline with Zod validation, requestId, and structured error responses
- Server actions with CSRF protection (origin + custom header)
- Middleware + context system with `runMiddlewareAndContext()` unified pipeline
- `theo build` command producing `.theo/client/` with Vite build
- `theo start` production server with static files, API routes, and SPA fallback
- `theo dev` development server with HMR
- Cookie helpers (`getCookie`, `setCookie`, `deleteCookie`) with OWASP-compliant defaults
- Structured JSON logging with `x-request-id` on all API responses
- 21 type tests proving end-to-end Zod inference
- Zero `any` in production code
