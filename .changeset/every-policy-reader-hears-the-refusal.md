---
'@theokit/agents': patch
---

Report a malformed operator policy to every reader, not just whichever ran first

`currentOperatorPolicy` memoises, and the memo took the warn channel with it: the first caller in the
process received the warnings and every caller after passed a channel that was never invoked.
Measured with a policy declaring `disableSkillShellExecution: "true"` — a string where a boolean is
required — the first reader heard one warning and the second heard none.

Three modules read this policy and nothing orders them, so whether an operator learned their policy
was malformed depended on which code path a given application happened to run first. The whole
operator tier is a set of refusals; one that silently fails to apply, in a process where nobody is
told, is the failure the tier exists to remove.

The warnings are now kept beside the policy and replayed to each reader. A well-formed policy
collects nothing, so nothing is replayed and no new noise appears.
