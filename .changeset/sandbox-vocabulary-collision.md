---
'@theokit/agents': patch
---

Documents that `sandbox` here is not the Claude Code CLI's `sandbox.*` settings block, at the door a
reader of the local vocabulary meets (`@theokit/agents/sandbox`) and in a new measured surface note,
`docs/surfaces/sandbox-vocabulary.md`.

They share an enforcement mechanism — bubblewrap and seccomp on Linux — and differ in what they
expose above it. This package offers an execution BACKEND (`SandboxBackend`, `LocalSandbox` /
`LinuxSandbox`) whose policy is three modes and four `SandboxConfig` fields. The CLI's is a SETTINGS
POLICY of 38 keys spanning per-path filesystem rules, a network allowlist with proxies and TLS
termination, and per-variable credential masking.

The gap that matters is network: this package has no network policy at any level, so a checklist
that greps for `sandbox`, finds this module and stops reports a domain allowlist that does not
exist. Every one of the 38 keys is enumerated with a verdict — absent, coarser, or not applicable to
a library — rather than dismissed in aggregate.

Two corrections fell out of doing it. The count is 38, not the 39 previously recorded: two
independent fetches of the reference returned the same 38 keys while the summarising step attached a
different total to each. And `sandbox.failIfUnavailable` has no equivalent here — `createSandboxBackend`
degrades to an unconfined `LocalSandbox` after one warning when bubblewrap is missing, and an
operator who believes they are sandboxed cannot make that a hard failure.
