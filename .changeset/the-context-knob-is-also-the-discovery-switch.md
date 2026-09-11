---
'@theokit/agents': patch
---

`@ContextWindow` now documents that declaring it is also the on-switch for instruction discovery.

The SDK constructs its `FileContextManager` only under `if (options.context !== undefined)`, and
`ContextWindowCapability` is the only place this layer sets that field. The consequence was
undocumented and load-bearing:

- declare `@ContextWindow(...)` → `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules` and
  `.theokit/rules` are discovered;
- omit it → every one of those files is inert, with no warning.

The option's entire surface is one key whose doc comment reads "Maximum tokens before compaction
triggers", and the module docblock above it is about compaction and strategy knobs. A consumer
debugging "why is my CLAUDE.md ignored" had no path from that symptom back to a decorator named after
a token budget.

**No behaviour changes.** The coupling is stated where the author decides whether to declare the
decorator, and pinned by a test that goes red if discovery ever gains a switch of its own — at which
point the documentation should be deleted rather than left quietly false.

`ContextSettings.maxBytesPerFile` and `maxBytesTotal` are now reachable from this surface too.
They were not, and the gap bit hardest exactly here: the option that enables `CLAUDE.md` discovery
is the same option that decides at which size a `CLAUDE.md` is truncated (40 000 characters by
default, head/tail with a marker) or dropped (120 000 aggregate, lower-priority sources first). A
60 000-character instruction file was silently cut, and the only knob on offer was named after
tokens. Keys are written only when declared, so an agent that never asks about bytes keeps the SDK's
own defaults.
