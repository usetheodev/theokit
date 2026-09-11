---
'@theokit/agents': patch
---

A hook's `matcher: "*"` now fires on every tool, as the format defines it.

`new RegExp("*")` throws — "nothing to repeat" — and the catch in `matches()` reads a throw as
no-match. So the spelling an author is most likely to write for "always" was the one spelling that
meant "never", while the two synonyms worked.

Measured end to end before the fix, a vetoing `pre_tool_call` against tool `Bash`:

```
matcher "*"           -> allowed through   <- documented match-all, guard never ran
matcher ""            -> VETOED
matcher "Bash"        -> VETOED
matcher omitted       -> VETOED
matcher "Edit, Write" -> allowed through   <- documented exact-list form, matched nothing
```

The comma-separated list is the second half: as a regex it required the space to be part of a tool
name, so it matched nothing at all. It is now read as the list it is.

Both shapes are recognised **before** the regex engine sees them, because neither is valid regex and
one of them throws.

**Unchanged and deliberate:** a matcher that cannot compile still does not match. A broken matcher
must not take down the turn — that trade is the reason the `catch` exists, and this fix does not
touch it.
