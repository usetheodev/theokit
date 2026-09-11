---
'@theokit/agents': patch
---

Say at `DelegateOptions.cwd` that a worktree gets no gitignored files

Pointing a sub-agent at a git worktree you created gives it a checkout without `.env`, without local
config, without credentials — and the resulting failure reads as a broken agent rather than as a
missing file. The option now says so.

No copier was built, and the reason is that there is nothing to copy into: this layer creates no
worktree. Measured with controls — zero `git worktree` invocations, zero `isolation` options, the
four files mentioning the word being a trust comment, a memory-scope comment, a detector for running
inside one, and a sentence in a prompt. A `.worktreeinclude` implementation would be a mechanism for
an event that never happens here.

The absence is held falsifiable rather than merely asserted: a test fails the day something does
create a worktree, and names the obligation that arrives with it.
