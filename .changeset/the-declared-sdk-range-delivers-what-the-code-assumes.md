---
"@theokit/agents": major
"theokit": major
---

The declared `@theokit/sdk` range no longer admits a floor that delivers zero parity.

`packages/agents` declared `^4.52.1 || ^5.0.0` and `packages/theo` peer-declared the same. Measured
by unpacking the published tarballs, against a control of `AgentOptions` (83-86 files in every one):

| surface | 4.52.1 | 5.0.0 | 5.3.0 | 5.4.0 |
|---|---|---|---|---|
| `CompatSurface` | 0 | 10 | 10 | 10 |
| `.claude/rules/*` discovery spec | 0 | 4 | 4 | 4 |
| `settings.local.json` | 0 | 4 | 4 | 4 |
| `CLAUDE_PROJECT_DIR` | 0 | 14 | 14 | 14 |

The boundary is the 4→5 major exactly, and the lower half of the declared range delivered **zero**
parity. Not one missing surface — every surface at once, invisibly, because the package resolves,
compiles and runs. This repository's own lockfile resolved 4.52.1, so its green suite was green
against an SDK where `compatSources` does not exist as an option.

**Why the range rather than a fourth runtime guard.** Three version guards already exist
(`HOOK_GATE_SINCE`, `COMPAT_IMPORT_SINCE`, and the `compatSources` warning), and every one is on a
path where this layer PASSES AN OPTION to the SDK. The surfaces above are not like that: nothing is
passed, the SDK reads a file or it does not, so there is no call site to guard. A fourth check could
not have been written. The reason the floor stayed low is recorded in the code and has expired —
*"Until this package's floor can name a stable 5.x"*; `@theokit/sdk@5.5.0` is `latest`, and stable
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
*proven* to work, not necessarily the first — the two releases between them are not in the measured
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
  *"revisit when the floor moves past 4.x"* — this is that revisit.
- `assembleM8CreateOptions`'s `deps.sdkVersion`, documented "Injectable for tests", reached the hook
  gate and **not** the narrowed-import gate. So that gate could only ever read the ambient
  installation, and its test passed because the machine happened to resolve 4.52.1. The seam now
  reaches both, and the refusal is pinned with a version on each side rather than one.
- `effectiveToolNames` entered the root bar in 5.x and was invisible here. Recorded `out` with
  measured evidence (0 callers in this repo, 0 in the downstream product, against probe controls of
  3 and 90) rather than by taste.

**Breaking:** a consumer pinned to `@theokit/sdk@4.x` can no longer install these packages. That
consumer was already receiving none of the `.claude` compatibility the packages advertise, and
`HookGateUnsupportedError` was already refusing them outright if they declared a hook gate. `theo`
moves with `agents` because it depends on it: a peer range advertising a major its own dependency
rejects is unsatisfiable at install time and says nothing until then.
