---
'@theokit/agents': minor
---

Resolve the memory root a subagent's `memory:` frontmatter promises

`.claude/agent-memory/` was not a surface. Measured with controls: `agent-memory` returned 0 files in
this package, and the 7 hits in `@theokit/sdk@5.5.0` are the internal module names
`local-agent-memory*.ts` — the SDK's `MemorySettings` is a different feature, a vector store with
embeddings. A subagent whose frontmatter said `memory: project` began every run with nothing while
its own definition said otherwise.

`resolveAgentMemory` resolves all three roots and reads `MEMORY.md` under the documented caps — 200
lines and 25KB, both applied, with truncation REPORTED rather than silent.

The three roots are decided together, because they differ in who can see the notes: `project` is
committed and shared, `local` is kept out of version control, `user` crosses projects. An
unrecognised scope is refused rather than defaulted — guessing `project` would publish, on the next
commit, notes somebody wrote expecting privacy. A subagent name that would escape the root is refused
for the same reason: the name comes from a file that arrives with the repository.
