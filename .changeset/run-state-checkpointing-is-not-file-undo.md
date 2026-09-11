---
"@theokit/agents": patch
---

`@Checkpoint` says, at the name, that it is run-state checkpointing and not file undo.

Two different things share the word and only one of them exists here. What this package has is
run-state checkpointing — enough to resume a conversation. What it does not have is file
checkpointing: snapshot and restore of the files an agent edited, the thing an interactive coding
agent needs to offer an undo.

Measured: `rewindFiles`, `rewind_files`, `restoreFile` and `backup` returned 0 files here, 0 in the
SDK `.d.ts` and 0 in `@theokit/sdk-tools`, while `checkpoint` returned six — all of them run state.

**The harm is not the missing feature, it is the collision.** Any parity checklist that greps for
`checkpoint` is satisfied by the wrong one and reports a capability that does not exist. A consumer
reads the checklist, believes undo is available, and finds out when a user asks for it.

The absence is stated **at the colliding name**, which is the only place a grep will reach, and a
test pins both the statement and the reason it matters — a docblock nothing checks is a docblock that
gets tidied away. It fails if a file-restore surface ever appears under the run-state name without
the statement being updated with it.

Not implemented here, and the reason is stated rather than implied: there is no pre-write seam on the
edit tools to hang snapshot and restore on, which makes it a feature with its own design questions
rather than a wiring job. Half-building it under a name that already means something else would make
the collision worse.
