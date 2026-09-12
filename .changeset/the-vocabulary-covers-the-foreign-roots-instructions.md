---
"@theokit/agents": minor
---

A caller can now name the foreign root's instructions — `context` is a `CompatSurface`.

`.claude/rules/*.md` had no name a consumer could write. The union was `'commands' | 'hooks' |
'plugins' | 'skills' | 'subagents'` — five names for a root that feeds six things — and the gate's
own docblock had already written the rule that violated: "An enumeration used to NARROW a root must
cover every surface that root feeds: a name absent from the vocabulary is a surface the caller
cannot ask for and cannot be told it lost."

It was measured from the other end. `theokit-sdk` #652: `FileContextManager` consulted no
foreign-dialect grant at all, so a cloned repository's `.claude/rules/*.md` reached the system
prompt of a consumer who had declared only its own `.theokit/` — while that same directory's hooks,
skills, subagents and plugins were correctly withheld. Closing that gate is what makes the missing
name here load-bearing: once the SDK honours a `context` grant, a caller with no word for it loses
the rules silently.

**This ships BEFORE the SDK release that honours it, and the ordering is safe in exactly one
direction.** The SDK matches a narrowed `import` list per surface, so a name it does not recognise
is never matched and changes nothing: on today's SDK the rules load as they always did, and on the
next one the grant is what keeps them loading. The reverse order would take `.claude/rules` from
every caller here with no name they could write to ask for it back.

A consumer passing the bare `'claude-code'` literal is unaffected — it still means the whole root.
What changes is that `import: ['context']` is now expressible, so taking a foreign repository's
house rules no longer requires also granting it command execution.
