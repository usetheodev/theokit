# Product context

Prepended to your agent's context on **every turn**, and it is the strongest source in the file
layer (priority 60) — nothing else overrides it. That is what decides what belongs here.

> **Not the same file as `AGENTS.md` at the root.** That one tells agents how to work on this
> codebase: commands, layout, conventions. This one tells your agent what your product IS, for the
> conversations it has with your users. If a sentence would help someone edit the code, it goes
> there instead.

**Put facts here, not preferences.** A preference written here wins against every personality, so a
tone instruction in this file quietly makes `usePersonality` do nothing. Tone belongs in
`.theokit/personalities/`; instructions about specific files belong in `.theokit/rules/`.

## Why this file is here and not at the root

This project installs `@theokit/sdk@^5.0.0`, where **both** locations work: 5.x added a root
`THEO.md` (`usetheokit/theokit-sdk#531`) at priority 55, and `.theokit/THEO.md` at 60 still wins a
conflict. The scaffold keeps the file here because it wins, not because the root is unreadable.

That reason is new. This paragraph used to say the template pinned `^4.52.1` — where
`.theokit/THEO.md` was the **only** path read and a root copy was silently ignored — and that 5.x
was published on the `next` channel only, so moving the file would break the default install. Both
halves expired: 5.5.0 is `latest`, and the template's pin moved to `^5.0.0` because every `.claude`
parity surface this framework advertises is absent from 4.x. A scaffold that hands a new project an
SDK delivering none of that, with nothing saying so, is the defect the pin change closes.

Two more things worth knowing if you do move it once 5.x is stable:

- The root spec sets `followImports: true`, this one does not. `@file` references resolve there and
  not here.
- Keep the pair. `AGENTS.md` is read by Cursor, Copilot and Claude Code as well as by TheoKit, and
  it addresses a different audience — agents that write your code, rather than the agent that talks
  to your users. That distinction survives whichever location this file ends up in.

Keep it short — every line costs tokens on every turn.

## What this app is

Replace this with two or three sentences: what your product does, who uses it, and the one thing an
agent must never get wrong about it.

## Vocabulary

The highest-value section, and the one most projects skip. Define the words your domain uses
differently from everyone else — a model that guesses what "account" means in your system will
guess wrong in a way that reads as fluent, which is the hardest kind of wrong to notice.

| Term   | In this app it means                     |
| ------ | ---------------------------------------- |
| _term_ | _the definition your team actually uses_ |

## Boundaries

What the agent should refuse or hand off, stated as fact rather than as tone. "Refunds are issued
by support, never by the assistant" is a fact. "Be careful with refunds" is a preference, and it
belongs in a personality where a user could switch it.
