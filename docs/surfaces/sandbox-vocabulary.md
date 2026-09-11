# Two things named `sandbox`, and which 38 keys we do not have

Measured 2026-09-11 against `@theokit/sdk/sandbox` (`packages/sdk/src/sandbox/{types,bwrap,index}.ts`
in `theokit-sdk`, re-exported by `packages/agents/src/sandbox-entry.ts`) and against the Claude Code
settings reference at <https://code.claude.com/docs/en/settings-reference>, which is the only
place the list can be re-derived. Re-measure before trusting.

**The count is 38, not the 39 that `B-064` recorded.** Two independent fetches of the reference
returned the same 38 keys; the summarising step attached a different total to each run (39, then 37)
while the list itself did not move. So the enumeration is the measurement and the total is derived
from it — which is the whole reason the item asked for the keys to be enumerated rather than
dismissed in aggregate. An aggregate figure is exactly the kind of claim that survives unchecked
because nobody can disagree with it without doing the work.

This is the fourth same-word collision this backlog has recorded, after `checkpoint` (B-059),
`MEMORY.md` (B-054) and `plugins` (B-055). It is written down for the reason those were: a checklist
that greps for `sandbox`, finds our module and stops has just reported a network policy that does not
exist here.

## They are not unrelated — they share the enforcement and differ in the policy

The tempting summary, "same word, different thing", is not quite true and the inaccuracy matters.
Both confine a shell command with **bubblewrap + seccomp** on Linux. What sits above that mechanism
is what differs:

| | this framework | the CLI's `sandbox.*` |
|---|---|---|
| What it is | an execution **backend** an agent's tools run commands through | a **settings policy** for the CLI's own Bash tool |
| Entry point | `createSandboxBackend` → `LocalSandbox` \| `LinuxSandbox` | `.claude/settings.json` |
| Filesystem policy | three modes: `read-only`, `workspace-write`, `danger-full-access` | per-path `allowRead` / `denyRead` / `allowWrite` / `denyWrite` |
| Network policy | **none** | domain allow/deny lists, proxies, TLS termination, Unix sockets |
| Credential policy | one knob: `env` (`inherit-scrubbed` by default — drops `*KEY*`, `*SECRET*`, `*TOKEN*`, `*PASSWORD*`, `*_AUTH*`) | per-variable and per-file masking, AWS SigV4 handling |
| Shape | `SandboxConfig` — `workDir`, `timeoutMs`, `maxOutputBytes`, `env` | 38 keys |

**The gap that matters is network.** A per-path filesystem policy is a refinement of something we
have; a domain allowlist is a category we do not implement at all.

## The 38 keys, each with a verdict

Verdicts are one of:

- **absent** — no equivalent here, and nothing approximates it
- **coarser** — we express the same concern with less resolution
- **N/A here** — the key configures the CLI as a program, not a sandbox policy, so it has no meaning
  for a library that is handed a backend

### Top level (12)

| Key | Verdict | Note |
|---|---|---|
| `sandbox` | coarser | ours is a backend selection (`createSandboxBackend`), not a settings object |
| `sandbox.enabled` | coarser | expressed by WHICH backend you construct, not by a flag |
| `sandbox.failIfUnavailable` | **absent** | `createSandboxBackend` treats missing bubblewrap as a degradation: it warns once and returns an unconfined `LocalSandbox`. There is no way to demand the opposite. `SandboxNotAvailableError` exists for a custom backend to throw, and nothing in the package throws it |
| `sandbox.allowUnsandboxedCommands` | N/A here | there is no retry-outside-the-sandbox path to permit or forbid |
| `sandbox.autoAllowBashIfSandboxed` | N/A here | permission prompting is the CLI's, not a library's |
| `sandbox.excludedCommands` | **absent** | no per-command escape list |
| `sandbox.ignoreViolations` | **absent** | violations are not reported as a stream that could be filtered |
| `sandbox.bwrapPath` | **absent** | `detectBwrap` probes `PATH`; no override |
| `sandbox.socatPath` | N/A here | no proxy relay exists, so no binary to point at |
| `sandbox.ripgrep` | **absent** | `grep` is derived from `execute` by shelling out, not by a bundled binary |
| `sandbox.enableWeakerNestedSandbox` | **absent** | no nested-container mode |
| `sandbox.enableWeakerNetworkIsolation` | N/A here | there is no network isolation to weaken |

### `sandbox.filesystem` (7)

| Key | Verdict | Note |
|---|---|---|
| `sandbox.filesystem` | coarser | our whole filesystem policy is the three-value `SandboxMode` |
| `sandbox.filesystem.allowWrite` | coarser | `writableRootsFor(mode, cwd)` derives the roots from the mode; a caller cannot add one |
| `sandbox.filesystem.denyWrite` | **absent** | no subtractive write rule |
| `sandbox.filesystem.allowRead` | **absent** | reads are not policed per path |
| `sandbox.filesystem.denyRead` | **absent** | same |
| `sandbox.filesystem.disabled` | **absent** | filesystem and network isolation cannot be separated, because there is no network isolation |
| `sandbox.filesystem.allowManagedReadPathsOnly` | **absent** | depends on `denyRead`, and on an operator tier that governs this surface |

### `sandbox.network` (13)

Every row is **absent**, and this is the one block where "dismissed in aggregate" would have been
honest — but enumerating it is what makes the shape of the absence visible: it is not one missing
knob, it is three missing subsystems (an allowlist, a proxy, and a socket policy).

| Key | Note |
|---|---|
| `sandbox.network` | no network policy exists at any level |
| `sandbox.network.allowedDomains` | no allowlist |
| `sandbox.network.deniedDomains` | no denylist |
| `sandbox.network.strictAllowlist` | nothing to be strict about |
| `sandbox.network.allowManagedDomainsOnly` | same, plus no operator tier over this surface |
| `sandbox.network.httpProxyPort` | no proxy |
| `sandbox.network.socksProxyPort` | no proxy |
| `sandbox.network.tlsTerminate` | no proxy, so nothing terminates TLS |
| `sandbox.network.allowLocalBinding` | macOS-only in the reference; no equivalent |
| `sandbox.network.allowUnixSockets` | no socket policy |
| `sandbox.network.allowAllUnixSockets` | same |
| `sandbox.network.allowMachLookup` | macOS XPC; no equivalent |
| `sandbox.allowAppleEvents` | macOS; no equivalent. Top-level in the reference — grouped here because it is a host-access permission, and the path is written as the reference spells it rather than as the grouping would suggest |

### `sandbox.credentials` (6)

| Key | Verdict | Note |
|---|---|---|
| `sandbox.credentials` | coarser | one knob, `SandboxConfig.env` |
| `sandbox.credentials.envVars` | coarser | `inherit-scrubbed` drops variables matching `*KEY*`, `*SECRET*`, `*TOKEN*`, `*PASSWORD*`, `*_AUTH*`. A pattern, not a list, and it cannot mask — only drop |
| `sandbox.credentials.files` | **absent** | file reads are not intercepted |
| `sandbox.credentials.sigv4` | **absent** | no AWS request handling |
| `sandbox.credentials.awsPairs` | **absent** | same |
| `sandbox.credentials.allowPlaintextInject` | **absent** | depends on masking, which does not exist |

## What this does NOT claim

It does not claim the 39 keys should be implemented. Several are meaningless for a library
(`autoAllowBashIfSandboxed` configures a permission prompt we do not own), and the macOS-specific
ones describe a platform the Linux backend does not target. The verdict column separates those from
the genuine gaps on purpose.

The one line worth carrying forward on its own is `sandbox.failIfUnavailable`. Our default is to
degrade silently to an unconfined backend after a single warning, and an operator who believes they
are sandboxed has no way to make that a hard failure. That is the same fail-open shape this backlog
has closed elsewhere, still open here.

## Cross-references

- Local end of the collision: `packages/agents/src/sandbox-entry.ts`
- Earlier collisions documented the same way: `checkpoint` (B-059), `MEMORY.md` (B-054, in
  `packages/agents/src/bridge/define-agent.ts`), `plugins` (B-055, in
  `packages/agents/src/bridge/agent-builder.ts`)
