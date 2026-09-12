---
'@theokit/agents': minor
---

Let a consumer read what the operator policy refuses

`disableAllHooks` shipped in 13.2.0 working and unreadable. `OperatorPolicy` and
`currentOperatorPolicy` were never exported, so nothing downstream could ask whether a policy was in
force — a diagnostic could report `hooks: none` and never `hooks: refused by operator policy`, which
is the ambiguity the switch exists to remove, restored one layer up in the type system.

Found by auditing all 628 exported symbols against the built `.d.ts`, distinguishing DECLARED from
merely MENTIONED: `OperatorPolicy` was declared in none of them, and `currentOperatorPolicy` appeared
only inside a docblock, where a grep reads it as present.

`OperatorPolicy`, `currentOperatorPolicy` and `mcpServerAdmitted` are now exported from
`@theokit/agents/config`. Nothing about the policy's enforcement changes; what changes is that a
consumer can see it and say so.
