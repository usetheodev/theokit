---
'@theokit/agents': minor
---

An operator can refuse every hook a foreign configuration root declares

`.claude/hooks.json` runs shell commands out of a working directory that usually arrived with the
clone, and the operator tier had no switch for it: an operator who inherited an untrusted checkout
could not decline hook execution without editing files inside it. `disableAllHooks` in the managed
policy now drops the `hooks` surface where `resolveCompatSources` grants the root — one place, and
the place whose own refusal message already says that root "includes hooks.json, which executes
shell". It applies whether the consumer took the whole root or narrowed it, and when hooks were the
only surface asked for, nothing is granted at all.

Unlike every other key in this policy, a malformed value fails CLOSED: `"disableAllHooks": "true"`
as a string is read as `true`, with a warning naming what happened. The asymmetry is the reason —
fail-open is silent and unsafe, fail-closed is loud and recoverable. An absent key still means hooks
run, so no existing consumer changes behaviour.
