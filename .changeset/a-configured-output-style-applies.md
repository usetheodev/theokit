---
'@theokit/agents': minor
---

`loadOutputStyle` reads `.claude/output-styles/*.md`, so a configured output style is no longer
ignored.

Measured for B-022 against the parity reference, which loads the project and home directories with
the project winning and honours the `outputStyle` key of a `settings.json`. This layer read none of
it: a grep for `output-style`, `outputStyle` and `output_style` over every package source tree
returned **0 files** against a control of **26** for `skills`, and the same query over the SDK's
built output returned **0** against a control of **22** for `SKILL.md`.

The failure was the silent kind. An author writes a style, selects it, gets ordinary responses back,
and cannot tell "my style is wrong" from "nothing reads styles".

- The **project wins** over the home directory, as the reference resolves them. Searched rather than
  merged: a style is one document, and two files with one name are a choice, not a composition.
- **A named style with no file THROWS** a typed `OutputStyleError` listing the directories searched.
  Returning `undefined` there would reproduce the exact state this fixes. A style that was never
  requested still returns `undefined` — not configuring one is the ordinary case, not an error.
- **`keep-coding-instructions` is carried**, because a style REPLACES the built-in
  software-engineering instructions by default. A consumer who does not know that loses them
  silently, so the flag travels and the decision stays with the caller.
- **A style with no frontmatter is still a style** — the whole file is the body and every key takes
  its default. `tsc` found that case, not a test: `splitFrontmatter` returns `undefined` for a file
  with no fence, and esbuild strips types so vitest never saw it.

Composing the text into the prompt stays with `composeInstructions`, which already owns the
character budget and the drop report. A style pushed past the ceiling is reported through the same
path as every other source rather than through a second one invented here.
