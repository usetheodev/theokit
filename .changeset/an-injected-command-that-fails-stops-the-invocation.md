---
"@theokit/agents": minor
---

A failed injected command now aborts the expansion instead of building a prompt out of its own error message, and a fenced command block is refused instead of ignored.

**BREAKING:** `expandCommandTemplate` used to promise it never throws. It now throws in exactly two
cases, both of which produce NO prompt rather than a wrong one.

**The failure path.** The spec is explicit — "A failed command aborts the entire skill invocation…
Claude never sees the skill content for that invocation." What happened instead was substitution plus
a warning: a command whose `gh pr diff` failed produced a prompt containing
`fatal: not a git repository`, handed to a model that had been asked to review a diff, which answered
as though that *were* the diff.

The previous behaviour was decided, and the reasoning it was decided against is worth keeping:
substituting SILENCE renders as a command that ran and returned nothing, which the model cannot
detect. That is correct, and it weighed the wrong two options. Substituting the ERROR is worse than
silence, not better — `fatal:` reads as prose, while silence at least leaves a gap. The third option
is the one the spec names, and the only one where the caller learns anything.

**A missing `@file` is still a warning**, deliberately. The line is what the template CAUSED versus
what it merely POINTED at: only the first can hand the model a plausible lie.

**The fenced form.** A ```` ```! ```` block containing real commands came back byte-identical — the
model received the command text as markdown, nothing ran, and nothing said so. It is now refused with
a message naming the inline form, rather than implemented: "run a multi-line block" has real
unanswered semantics (each line a command, or one script? which shell? what is the exit status of
four lines?), and inventing them would ship behaviour under a name that promises the spec's. The
detector is anchored to a line of its own, so an ordinary ```` ```bash ```` block is untouched.

Callers that relied on best-effort expansion should catch `ConfigurationError` with code
`command_template_segment_failed` or `command_template_fenced_block`.
