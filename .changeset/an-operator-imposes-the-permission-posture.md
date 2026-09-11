---
"@theokit/agents": patch
---

The two permission vocabularies meet, and the mirrored `permissionMode` field says what it mirrors.

Measured: `permissionMode` appeared in exactly one file, as a mirrored field nothing branches on;
`dontAsk`, `autoMode`, `useAutoModeDuringPlan` and `classifyAllShell` all returned 0 files. This
layer offers `suggest | auto-edit | full-auto` — the values a real consumer put in front of users —
while the runtime resolves `default | plan | acceptEdits | bypass`. A reader of either had no way to
the other.

`approvalModeToPermissionMode` translates them. `suggest` maps to `default`, **not** to something
that asks unconditionally: `default` means the rules decide and an unmatched call asks, so mapping it
otherwise would discard every allow rule the operator shipped. `full-auto` maps to `bypass`, which
allows everything **except an explicit deny** — mapping the most permissive local mode onto something
that also cleared denies would turn a UI convenience into a policy override.

The signature takes `ApprovalMode`, so a fourth local mode is a compile error rather than a silent
fallthrough to a posture nobody chose.

**`plan` has no local counterpart, deliberately.** It is an explore-only posture an *operator*
imposes, not something this surface offers, and inventing a fourth local name would put a decision
that belongs to the operator into the user's mode picker. The absence is named rather than filled.

`PermissionGate`'s mirrored field is now the SDK's own `PermissionMode` instead of a bare `string`. A
mirror that accepts any word mirrors nothing in particular — `"readonly"`, what somebody writes when
they mean `plan`, would have sat there looking applied. Restating the union by hand was the first
attempt and the package's own type test refused it: the shape must fit `PreToolCallContext`
structurally, and a copy that drifts by one member stops fitting. Importing the source makes it a
mirror by construction.

Unchanged, and still the documented decision: the gate ignores the mode. `bypass` does not disable
it, because a standing grant is the operator's and not the run's.
