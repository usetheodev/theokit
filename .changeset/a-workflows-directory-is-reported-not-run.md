---
'@theokit/agents': patch
---

Report a `.claude/workflows/` directory instead of passing over it in silence

A project that declares the `claude-code` dialect and ships workflow scripts now learns, on load,
that they were found and not executed — with the reason and with the supported alternative. It was
previously the one surface of the dialect that produced no message at all, so an author who watched
rules, skills, subagents and commands load out of the same folder had no way to tell a broken
workflow from a workflow nothing reads.

The scripts are still not executed, deliberately. Every configuration surface this package loads is
data; a workflow file is code, and executing JavaScript found under a caller-supplied directory is a
trust decision that belongs to the consumer rather than to a library. The orchestration itself is
unaffected — `Workflow`, `agentStep` and `createSquad` from `@theokit/sdk` build the same pipeline
from an import the consumer writes.
