# create-theo

## 3.0.0

### Major Changes

- f28ebd5: A scaffolded project now pins `@theokit/sdk@^5.0.0`, the line that actually carries the parity.

  The default template pinned `^4.52.1`. Measured by unpacking the published tarballs: `CompatSurface`,
  the `.claude/rules` discovery spec, `settings.local.json` and `CLAUDE_PROJECT_DIR` have **0 files**
  in 4.52.1 and 10 / 4 / 4 / 14 from 5.0.0, against a control of `AgentOptions` at 83-86 in every one.
  So every project this scaffold created started with an SDK delivering none of the `.claude`
  compatibility the framework advertises, and nothing said so. Of everywhere that floor was declared,
  this is the one that reaches people who never read a range.

  Found by the framework's own gate rather than by inspection: `create-theo-default-template.test.ts`
  asserts the template's pin is not below the floor the framework declares, and it went red the moment
  that floor moved (B-029).

  **The template's own prose changed with it, because the pin falsified it.** `dot-theokit/THEO.md`
  explained that `.theokit/THEO.md` was the **only** path a `THEO.md` is read from, and justified
  keeping the file there on the grounds that 5.x was published on the `next` channel only. Both halves
  expired — 5.5.0 is `latest`, and on 5.x a root `THEO.md` is read at priority 55 while
  `.theokit/THEO.md` sits at 60. The file stays where it is, and the reason is now that it **wins** a
  conflict rather than that the root is unreadable. `theo-md-location.test.ts` is what forced that
  rewrite instead of letting the explanation outlive its premise; its anchor moved to the two
  priorities whose order is the actual reason.

  **Breaking** for anyone generating a project that must stay on `@theokit/sdk@4.x`. That project was
  already receiving none of the parity above.

## 2.0.0

### Major Changes

- 50d0d1a: **Agents move inside the backend, and the scaffold's folders name their domains.**

  A generated project put `app/`, `server/` and `agents/` side by side at the root, which said that
  agents are a third thing next to the frontend and the backend. They are not: an agent reads secrets,
  calls tools, holds the model key and runs where the server runs. Every rule that applies to
  `server/` already applied to `agents/`, and the flat layout is what kept anyone from noticing.

  A new project is now generated as:

  ```
  src/
  ├── app/            # interface — the only half that ships to a browser
  ├── server/         # backend — everything that never leaves the machine
  │   ├── agents/     # agent composition: prompts, tools, skills
  │   └── routes/     # file-based HTTP
  └── shared/         # the contracts both sides import
  ```

  `theo.config.ts` declares all three paths (`.appDir('src/app')`, `.serverDir('src/server')`,
  `.agentsDir('src/server/agents')`), so the layout is a value the project owns rather than a
  convention the framework assumes.

  **Existing projects are unaffected and need no migration.** The framework's defaults are unchanged —
  a project that declares nothing still resolves `app/`, `server/` and `agents/` at the root. This is
  major for `create-theokit` because a _newly generated_ project has a different shape, not because
  anything stopped working; the CLI already read every path from the config (`build`, `dev` and
  `routes` pass `config.appDir` to the structure validator), which is what let the scaffold move
  without a framework release.

  Two things the move made visible, both of which argue it was overdue: the three cross-imports in the
  bot preset got _shorter_ (`../../server/delivery.js` → `../../delivery.js`), and the `tsconfig`
  include lost an entry, because `src/server/**` now covers the agents that needed their own line.

  Two options the move exposed as broken, both now fixed:

  - **`--import-alias` pointed at directories that no longer exist.** A custom alias expanded to
    `./server/*` and `./app/*`, so a project generated with `--import-alias '~/*'` carried a tsconfig
    whose aliases resolve to nothing. The mapping moved to `alias-paths.ts` where it is tested against
    the directories the template actually ships, rather than living as three untested literals inside
    a function that writes to disk.
  - **`--src-dir` is gone, and its prompt with it.** The generated project is always under `src/`, so
    the question changed nothing whichever way it was answered — and answering _yes_ actively broke
    the project: it moved `theo.config.ts` into `src/`, where the CLI does not look for it, and
    overwrote `include` with `src/**` alone, dropping the two ambient `.d.ts` globs the template needs.

  And two the generated app itself exposed, both of which made a fresh project fail its own
  `format:check` on files the user never typed:

  - **`README.md.tmpl` was never formatted.** The check that exists reads the template's `**/*.md`,
    and `.tmpl` does not match — but it becomes `README.md` in the user's project, where it _is_
    checked. Its tables had been unaligned since before this refactor.
  - **The `--tailwind` stylesheet import used double quotes** against a template whose `.prettierrc`
    sets `singleQuote: true`, plus a stray blank line.

  Both are now covered by tests over the OUTPUT rather than the template: one scaffolds a project and
  runs Prettier against it with the config that project ships, the other hands the injected CSS line
  straight to Prettier — it is written after `scaffold()` returns, so the first test cannot see it.

### Minor Changes

- 91b1e04: **A generated app now demonstrates all five TheoKit concepts — agents, tools, skills, hooks, rules
  and personalities — with each one wired rather than merely present.**

  The scaffold shipped agents, tools, prompts and skills, and nothing at all for the other three. An
  app that shows half the framework teaches half the framework, and the missing half is the half a
  user is least likely to discover on their own: it lives in files the framework reads at runtime,
  which nothing in a project points at.

  ## The split the layout now makes visible

  ```
  src/server/agents/     CODE — compiled, changes on deploy
  ├── chat.ts  tools/  prompts/  skills/
  └── hooks/             ← new

  .theokit/              DATA — read at runtime, no rebuild
  ├── THEO.md            ← new: facts true on every turn
  ├── rules/             ← new: instructions scoped to file globs
  └── personalities/     ← new: swappable system prompts
  ```

  Tone and domain facts move at a different speed than code. Shipping a deploy to reword a system
  prompt is a bad trade, and the two directories are what make the difference obvious.

  ## What each one is
  - **`hooks/tool-audit.ts`** — one structured log line per tool call, with its duration, attached in
    `chat.ts` via `.hooks()`. It deliberately does **not** veto: `pre_tool_call` is the only hook with
    veto power, and any policy a template invented would be one the app never chose. The docblock
    shows the veto shape for when you have a rule of your own, and `send_notification` stays gated the
    right way — by a human approval.
  - **`.theokit/rules/*.md`** — path-scoped instructions, activated by `globs` in the frontmatter
    (`description` / `paths` / `globs` / `alwaysApply` / `enabled`). A file with no frontmatter is
    treated as `alwaysApply: true`, which the README calls out because a typo'd key silently turns a
    scoped rule into an always-on one.
  - **`.theokit/personalities/*.md`** — frontmatter describes the preset, the body IS the system
    prompt. Switched at runtime with `agent.usePersonality('teacher', { save: true })`. `none`,
    `default` and `neutral` are reserved names that clear it — so the test asserts no shipped
    personality uses one, since such a file could never be selected.
  - **`.theokit/THEO.md`** — prepended every turn. Highest priority in the file layer (60), which is
    why it holds facts rather than preferences: a preference that always wins cannot be overridden by
    a personality.

  The ARCHITECTURE doc now carries the SDK's full context-source table with priorities, so a reader
  can see where their file sits among `AGENTS.md`, `CLAUDE.md` and `.cursor/rules`.

  Verified on a generated app: `typecheck`, `lint`, `format:check` and `test` all exit 0, and
  `theokit build` completes with the hook attached.

  ## The root context file, and the option that never worked

  `THEO.md` **cannot** live at the project root: the SDK registers it as `.theokit/THEO.md` with
  `cwd-only` scope, so a copy at the root is read by nothing. The file that IS read from there is
  `AGENTS.md` — `git-root-walk`, the same scope as `CLAUDE.md`, discovered from any subdirectory.

  The scaffold now ships one, and the two files say what separates them:

  |          | `AGENTS.md` (root)              | `.theokit/THEO.md`               |
  | -------- | ------------------------------- | -------------------------------- |
  | Audience | agents that **write** this code | the agent your **users** talk to |
  | Content  | commands, layout, conventions   | product facts, domain vocabulary |
  | Priority | 10 — anything overrides it      | 60 — strongest file-layer source |

  That ordering is why `THEO.md` warns against putting preferences in it: a tone instruction there
  wins against every personality, which silently makes `usePersonality` do nothing.

  **The `agentsMd` option was inert in three separate ways**, and shipping the file is what exposed
  all three: `--agents-md` was documented in `--help` and never parsed; the prompt asked a question
  whose answer changed nothing; and the code only ever _deleted_ an `AGENTS.md` the template did not
  have. The flag is now `--no-agents-md` (the direction that can change anything, since the default
  is true), it is parsed, and it is applied after the prompts so a typed flag beats an earlier answer.
  Verified through the real CLI: present by default, absent with the flag, `THEO.md` untouched either
  way.

### Patch Changes

- c093fbd: **A generated app now installs the `@theokit/agents` line that is actually published.**

  The template pinned `"@theokit/agents": "^10.1.0"` while npm's `latest` was `12.1.0`. A caret does
  not cross a major, so every app scaffolded from it installed **10.1.0** — two majors behind, and
  missing what those majors carried:

  - **11.0.0** — the server's raw error text no longer reaches the browser by default. A generated app
    was still returning a tool handler's stderr verbatim to the client.
  - **12.0.0** — `@theokit/agents/pty` moved to its own package, so the native build step is no longer
    pulled in.

  Pin bumped to `^12.1.0`, verified end to end on a generated app: it installs `12.1.0`, and
  `typecheck`, `lint`, `format:check`, `test` and `theokit build` all pass.

  ## Why the guard that exists did not catch it

  `scripts/sync-template-pins.mjs` was written for exactly this failure (#424 — the template pinned
  `^0.48.3` while the repo was at `0.49.0`). In prerelease mode it abstains from rewriting, correctly:
  syncing then would pin a scaffolded app to the `next` channel, and #618 showed it also deadlocks the
  release.

  But the abstention rested on a premise it never checked — _"the pin it has points at the last stable
  line"_. That holds only while no workspace package publishes a stable release during another's
  prerelease, and `@theokit/agents` published 11.x and 12.x during `theokit`'s.

  Prerelease mode now **verifies** that premise instead of asserting it: each template pin is checked
  against the version npm serves on `latest`, and a pin that excludes it fails `--check`. A range the
  comparison cannot read, or a registry that does not answer, is reported as _unverified_ rather than
  as wrong — failing a release on a network blip would be its own defect.

  `caretAdmits` is exported and unit-tested (13 cases), including the `0.x` line where a caret pins the
  minor — which is the shape #424 itself had.

- 7ba0e1f: **`THEO.md` explains why it lives under `.theokit/` and not at the project root** (#642).

  The question the issue asked — one context file or two, now that the SDK can read a root
  `THEO.md` — is answered in the file itself, tied to the version that decides it:

  - On the SDK this template pins (`^4.52.1`), `.theokit/THEO.md` is the **only** path a `THEO.md` is
    read from. A copy at the root is read by nothing, silently.
  - `@theokit/sdk@5` adds a root spec at priority 55 (`theokit-sdk#531`), so both work there and
    `.theokit/` still wins a conflict. 5.x is on the `next` channel only, so moving the file would
    break it for anyone on the default install.

  **The pair stays, and the reason is audience rather than the SDK.** `AGENTS.md` addresses agents
  that _write_ the code and is read by Cursor, Copilot and Claude Code as well; `THEO.md` addresses
  the agent that talks to _users_. That distinction predates the SDK limitation and outlives it, so
  the two files are a design rather than a leftover workaround — which is exactly what #642 was filed
  to prevent them from quietly becoming.

  Also recorded, for whoever moves the file once 5.x is stable: the root spec sets
  `followImports: true` and `.theokit/THEO.md` does not, so `@file` references resolve in one and not
  the other.

  `theo-md-location.test.ts` ties the prose to the manifest — it reads the SDK range out of
  `package.json.tmpl` and asserts the explanation cites it. Moving the pin past 4.x fails the test,
  so the note has to be revisited instead of outliving its own premise.

## 2.0.0-next.1

### Patch Changes

- 7ba0e1f: **`THEO.md` explains why it lives under `.theokit/` and not at the project root** (#642).

  The question the issue asked — one context file or two, now that the SDK can read a root
  `THEO.md` — is answered in the file itself, tied to the version that decides it:

  - On the SDK this template pins (`^4.52.1`), `.theokit/THEO.md` is the **only** path a `THEO.md` is
    read from. A copy at the root is read by nothing, silently.
  - `@theokit/sdk@5` adds a root spec at priority 55 (`theokit-sdk#531`), so both work there and
    `.theokit/` still wins a conflict. 5.x is on the `next` channel only, so moving the file would
    break it for anyone on the default install.

  **The pair stays, and the reason is audience rather than the SDK.** `AGENTS.md` addresses agents
  that _write_ the code and is read by Cursor, Copilot and Claude Code as well; `THEO.md` addresses
  the agent that talks to _users_. That distinction predates the SDK limitation and outlives it, so
  the two files are a design rather than a leftover workaround — which is exactly what #642 was filed
  to prevent them from quietly becoming.

  Also recorded, for whoever moves the file once 5.x is stable: the root spec sets
  `followImports: true` and `.theokit/THEO.md` does not, so `@file` references resolve in one and not
  the other.

  `theo-md-location.test.ts` ties the prose to the manifest — it reads the SDK range out of
  `package.json.tmpl` and asserts the explanation cites it. Moving the pin past 4.x fails the test,
  so the note has to be revisited instead of outliving its own premise.

## 2.0.0-next.0

### Major Changes

- 50d0d1a: **Agents move inside the backend, and the scaffold's folders name their domains.**

  A generated project put `app/`, `server/` and `agents/` side by side at the root, which said that
  agents are a third thing next to the frontend and the backend. They are not: an agent reads secrets,
  calls tools, holds the model key and runs where the server runs. Every rule that applies to
  `server/` already applied to `agents/`, and the flat layout is what kept anyone from noticing.

  A new project is now generated as:

  ```
  src/
  ├── app/            # interface — the only half that ships to a browser
  ├── server/         # backend — everything that never leaves the machine
  │   ├── agents/     # agent composition: prompts, tools, skills
  │   └── routes/     # file-based HTTP
  └── shared/         # the contracts both sides import
  ```

  `theo.config.ts` declares all three paths (`.appDir('src/app')`, `.serverDir('src/server')`,
  `.agentsDir('src/server/agents')`), so the layout is a value the project owns rather than a
  convention the framework assumes.

  **Existing projects are unaffected and need no migration.** The framework's defaults are unchanged —
  a project that declares nothing still resolves `app/`, `server/` and `agents/` at the root. This is
  major for `create-theokit` because a _newly generated_ project has a different shape, not because
  anything stopped working; the CLI already read every path from the config (`build`, `dev` and
  `routes` pass `config.appDir` to the structure validator), which is what let the scaffold move
  without a framework release.

  Two things the move made visible, both of which argue it was overdue: the three cross-imports in the
  bot preset got _shorter_ (`../../server/delivery.js` → `../../delivery.js`), and the `tsconfig`
  include lost an entry, because `src/server/**` now covers the agents that needed their own line.

  Two options the move exposed as broken, both now fixed:

  - **`--import-alias` pointed at directories that no longer exist.** A custom alias expanded to
    `./server/*` and `./app/*`, so a project generated with `--import-alias '~/*'` carried a tsconfig
    whose aliases resolve to nothing. The mapping moved to `alias-paths.ts` where it is tested against
    the directories the template actually ships, rather than living as three untested literals inside
    a function that writes to disk.
  - **`--src-dir` is gone, and its prompt with it.** The generated project is always under `src/`, so
    the question changed nothing whichever way it was answered — and answering _yes_ actively broke
    the project: it moved `theo.config.ts` into `src/`, where the CLI does not look for it, and
    overwrote `include` with `src/**` alone, dropping the two ambient `.d.ts` globs the template needs.

  And two the generated app itself exposed, both of which made a fresh project fail its own
  `format:check` on files the user never typed:

  - **`README.md.tmpl` was never formatted.** The check that exists reads the template's `**/*.md`,
    and `.tmpl` does not match — but it becomes `README.md` in the user's project, where it _is_
    checked. Its tables had been unaligned since before this refactor.
  - **The `--tailwind` stylesheet import used double quotes** against a template whose `.prettierrc`
    sets `singleQuote: true`, plus a stray blank line.

  Both are now covered by tests over the OUTPUT rather than the template: one scaffolds a project and
  runs Prettier against it with the config that project ships, the other hands the injected CSS line
  straight to Prettier — it is written after `scaffold()` returns, so the first test cannot see it.

### Minor Changes

- 91b1e04: **A generated app now demonstrates all five TheoKit concepts — agents, tools, skills, hooks, rules
  and personalities — with each one wired rather than merely present.**

  The scaffold shipped agents, tools, prompts and skills, and nothing at all for the other three. An
  app that shows half the framework teaches half the framework, and the missing half is the half a
  user is least likely to discover on their own: it lives in files the framework reads at runtime,
  which nothing in a project points at.

  ## The split the layout now makes visible

  ```
  src/server/agents/     CODE — compiled, changes on deploy
  ├── chat.ts  tools/  prompts/  skills/
  └── hooks/             ← new

  .theokit/              DATA — read at runtime, no rebuild
  ├── THEO.md            ← new: facts true on every turn
  ├── rules/             ← new: instructions scoped to file globs
  └── personalities/     ← new: swappable system prompts
  ```

  Tone and domain facts move at a different speed than code. Shipping a deploy to reword a system
  prompt is a bad trade, and the two directories are what make the difference obvious.

  ## What each one is
  - **`hooks/tool-audit.ts`** — one structured log line per tool call, with its duration, attached in
    `chat.ts` via `.hooks()`. It deliberately does **not** veto: `pre_tool_call` is the only hook with
    veto power, and any policy a template invented would be one the app never chose. The docblock
    shows the veto shape for when you have a rule of your own, and `send_notification` stays gated the
    right way — by a human approval.
  - **`.theokit/rules/*.md`** — path-scoped instructions, activated by `globs` in the frontmatter
    (`description` / `paths` / `globs` / `alwaysApply` / `enabled`). A file with no frontmatter is
    treated as `alwaysApply: true`, which the README calls out because a typo'd key silently turns a
    scoped rule into an always-on one.
  - **`.theokit/personalities/*.md`** — frontmatter describes the preset, the body IS the system
    prompt. Switched at runtime with `agent.usePersonality('teacher', { save: true })`. `none`,
    `default` and `neutral` are reserved names that clear it — so the test asserts no shipped
    personality uses one, since such a file could never be selected.
  - **`.theokit/THEO.md`** — prepended every turn. Highest priority in the file layer (60), which is
    why it holds facts rather than preferences: a preference that always wins cannot be overridden by
    a personality.

  The ARCHITECTURE doc now carries the SDK's full context-source table with priorities, so a reader
  can see where their file sits among `AGENTS.md`, `CLAUDE.md` and `.cursor/rules`.

  Verified on a generated app: `typecheck`, `lint`, `format:check` and `test` all exit 0, and
  `theokit build` completes with the hook attached.

  ## The root context file, and the option that never worked

  `THEO.md` **cannot** live at the project root: the SDK registers it as `.theokit/THEO.md` with
  `cwd-only` scope, so a copy at the root is read by nothing. The file that IS read from there is
  `AGENTS.md` — `git-root-walk`, the same scope as `CLAUDE.md`, discovered from any subdirectory.

  The scaffold now ships one, and the two files say what separates them:

  |          | `AGENTS.md` (root)              | `.theokit/THEO.md`               |
  | -------- | ------------------------------- | -------------------------------- |
  | Audience | agents that **write** this code | the agent your **users** talk to |
  | Content  | commands, layout, conventions   | product facts, domain vocabulary |
  | Priority | 10 — anything overrides it      | 60 — strongest file-layer source |

  That ordering is why `THEO.md` warns against putting preferences in it: a tone instruction there
  wins against every personality, which silently makes `usePersonality` do nothing.

  **The `agentsMd` option was inert in three separate ways**, and shipping the file is what exposed
  all three: `--agents-md` was documented in `--help` and never parsed; the prompt asked a question
  whose answer changed nothing; and the code only ever _deleted_ an `AGENTS.md` the template did not
  have. The flag is now `--no-agents-md` (the direction that can change anything, since the default
  is true), it is parsed, and it is applied after the prompts so a typed flag beats an earlier answer.
  Verified through the real CLI: present by default, absent with the flag, `THEO.md` untouched either
  way.

### Patch Changes

- c093fbd: **A generated app now installs the `@theokit/agents` line that is actually published.**

  The template pinned `"@theokit/agents": "^10.1.0"` while npm's `latest` was `12.1.0`. A caret does
  not cross a major, so every app scaffolded from it installed **10.1.0** — two majors behind, and
  missing what those majors carried:

  - **11.0.0** — the server's raw error text no longer reaches the browser by default. A generated app
    was still returning a tool handler's stderr verbatim to the client.
  - **12.0.0** — `@theokit/agents/pty` moved to its own package, so the native build step is no longer
    pulled in.

  Pin bumped to `^12.1.0`, verified end to end on a generated app: it installs `12.1.0`, and
  `typecheck`, `lint`, `format:check`, `test` and `theokit build` all pass.

  ## Why the guard that exists did not catch it

  `scripts/sync-template-pins.mjs` was written for exactly this failure (#424 — the template pinned
  `^0.48.3` while the repo was at `0.49.0`). In prerelease mode it abstains from rewriting, correctly:
  syncing then would pin a scaffolded app to the `next` channel, and #618 showed it also deadlocks the
  release.

  But the abstention rested on a premise it never checked — _"the pin it has points at the last stable
  line"_. That holds only while no workspace package publishes a stable release during another's
  prerelease, and `@theokit/agents` published 11.x and 12.x during `theokit`'s.

  Prerelease mode now **verifies** that premise instead of asserting it: each template pin is checked
  against the version npm serves on `latest`, and a pin that excludes it fails `--check`. A range the
  comparison cannot read, or a registry that does not answer, is reported as _unverified_ rather than
  as wrong — failing a release on a network blip would be its own defect.

  `caretAdmits` is exported and unit-tested (13 cases), including the `0.x` line where a caret pins the
  minor — which is the shape #424 itself had.

## 1.25.3

### Patch Changes

- c6d9ad6: The scaffold's rules file and agent skill stop teaching three more names that do not exist.

  Verifying the previous release against the published package rather than the working tree turned up
  what the first sweep had missed. `.claude/rules/theokit-conventions.md` — a RULES file, which an
  agent reads as normative rather than as an example — still prescribed `defineRoute`, `defineAction`
  and `defineWebSocket`. The agents skill still built every example on `defineAgent`. None of the four
  is exported by anything: the real surface is `route()`, `action()`, `websocket()` and
  `AgentBuilder.create()`, which the generated app's own files already use.

  The guard that should have caught them read only `import` lines from `theokit/…`, so it saw neither
  prose in a rules file nor a scoped sibling. It now covers `@theokit/*` packages this workspace
  builds, and derives what is verifiable from `packages/` rather than from a list — the first attempt
  at a list immediately reported `@theokit/tui` and `@theokit/gateway-telegram`, which belong to other
  repositories, as defects.

## 1.25.2

### Patch Changes

- 63cd36b: The scaffolded skills no longer teach four APIs that do not exist.

  `create-theokit` installs `dot-claude/skills/*` into every generated app, and an AI agent working
  inside the consumer's project reads them. Four names they taught are exported by nothing:
  `defineAgentTool` (internal — `tool().build()` delegates to it), `defineConfig` (the surface is
  `config()`), `defineRoute` (`route()`) and `defineAction` (`action()`); `TheoError` was imported
  from the package root, where it does not live — it is in `theokit/server/http`.

  Each of those builders is what the scaffold's own files already used. A fresh app shipped the
  working call in `agents/tools/weather.ts` and the instruction to write the broken one in the skill
  beside it. Six documented imports also read `from 'theokit/server'`, the umbrella that resolves with
  a deprecation warning naming a removal release, and now name their real subpaths.

  A test asserts every symbol a template doc imports resolves in the built package, so the next wrong
  name fails a test instead of reaching a consumer's agent.

## 1.25.1

### Patch Changes

- db29ca0: An OpenRouter-only setup runs the scaffold out of the box.

  A fresh app given only the key `.env.example` asks for answered 500 on its first message. The
  generated agent declared `openai/gpt-4o-mini`; the first segment of a model id selects the provider,
  so that id needs `OPENAI_API_KEY` — the one key the user was never told to get. The scaffold's own
  docblock promised the opposite, that the prefix let OpenRouter route the model upstream.

  Measured against `@theokit/sdk`'s provider catalog, it does not: `openai/gpt-4o-mini` resolves to
  `api.openai.com`, and only `openrouter/openai/gpt-4o-mini` resolves to `openrouter.ai`. The gateway
  has to be named in the id.

  So the scaffold declares `openrouter/openai/gpt-4o-mini`, matching the key it asks for, and its docs
  say what the prefix actually does. A test in `create-theokit` now pins the invariant: the key
  `.env.example` leaves uncommented must be the key the declared models need.

  The resolver still refuses rather than substituting a credential it happens to find — every caller
  takes its `apiKey` and discards its `baseUrl`, so a substituted key reaches whatever endpoint the
  model id names, which is the unattributable `401` of #326. What changed is that the refusal is now
  actionable: when a credentialed gateway could serve the model, the message names the exact
  gateway-prefixed id instead of only the variable that is missing.

- 97166a4: WhatsApp can be served through `handleChannelWebhook`.

  The channel seam could not serve the one platform `@theokit/gateway-whatsapp` exists for, for two
  independent reasons. `theokit/server/webhook` exported `stripe`, `github`, `slack`, `telegram` and
  `discord`, so a `validators` map with no `whatsapp` entry made the path answer 404 by construction.
  And Meta verifies an endpoint before it delivers anything — a `GET` carrying `hub.mode=subscribe`,
  `hub.verify_token` and `hub.challenge`, with the challenge echoed back as `text/plain` — which was
  not modelled, so an app had to add a route of its own regardless.

  Both halves close:

  - `whatsapp({ appSecret })` verifies `X-Hub-Signature-256` — HMAC-SHA256 over the RAW body, which is
    the sharp edge a hand-rolled version gets wrong: hashing a parsed-and-restringified body compares
    different bytes and rejects correct requests.
  - `whatsappSubscribe({ verifyToken })` answers the handshake, through a new per-platform `subscribe`
    map on `ChannelWebhookConfig`. Per-platform rather than a bare `verifyToken`, because the query
    shape is Meta's — shared with Instagram and Messenger, not universal. A `GET` on a platform that
    declared no responder answers 405, not 404: the platform is configured, it just does not do
    handshakes.

  The signature scheme is the one GitHub already used — same header, same construction — so `github`
  and `whatsapp` now share one implementation instead of two copies of a constant-time comparison,
  a hex decoder and a rotation loop.

  Nothing about the POST path changed, and its tests assert so.

## 1.25.0

### Minor Changes

- 8372f6f: `create-theokit my-app --preset=bot` — the always-on agent shape, scaffolded.

  The framework already supports every piece of an unattended agent, and that was the problem: assembling one meant discovering, across twelve repositories, that you need `AgentBuilder` + `.approval()` + `deriveConversationId` + a `SandboxProvider` + `bindToolScope` + `defineCron` + a delivery channel. A preset is the cheapest answer to "how do I build the thing your landing page shows".

  **A preset, not a second template.** A bot app and a web app share the shell, the config, the toolchain and the route conventions; what differs is the entry point — a schedule instead of a page — and the questions that follow from nobody watching. A second full template would duplicate the ninety percent that is the same and then drift, which is what `--surface` already avoids by layering.

  **Two bots.** `researcher` writes notes into its own workspace; `publisher` reads them and publishes behind a `.approval()` gate. Two is where "whose conversation is this" and "whose workspace can it write to" become real questions; three starts being a demo application rather than a starting point.

  **The isolation is enforced, not requested.** `botScope(botId)` composes the conversation id, the tool confinement and the workspace in one call — the piece people currently rediscover. `publisher` can read the researcher's notes and cannot write them, because its write root says so; a prompt asking a model not to write is a request, and a resolved-path check is a wall.

  **No delivery channel is wired, deliberately.** `server/delivery.ts` prints. A default channel is a policy decision — an address you did not write, a workspace you may not have — so the seam is present, called from the places that need it, with one commented example. That is also why the scaffold runs before you configure anything.

  An unknown preset is refused by name rather than silently scaffolding the plain template, and a preset whose files are incomplete in a build refuses before writing anything: a partial layer is an app importing files it does not have, failing at build time three steps from the cause.

## 1.24.0

### Minor Changes

- 4deb260: An ordinary page in a scaffolded app scrolls, and the frontend skill stops teaching a `theoFetch` option that does not exist.

  **The shell clipped every page after the chat.** `<main>` was `overflow-hidden` and the shell is `h-screen`, so the document could not scroll and neither could the routed page. Measured in a real app built on this template: **2240px of 3090px unreachable — nine of eleven cards**, with nothing on screen to explain it. The layout's own comment described the premise ("the document never scrolls") and never named the consequence.

  `<main>` now scrolls, and the chat — the one page that genuinely wants a clipping box, so its log scrolls inside and the composer pins — declares that for itself. The default serves the page a developer is most likely to write next, and that is not another chat.

  Both halves shipped together on purpose: a scrolling `<main>` without the chat's own container unpins the composer, and the container without the scrolling `<main>` is the original defect. Verified in a browser on a real app, not only in tests — an ordinary page reaches its last pixel, and on the chat the composer sits exactly at the viewport bottom while the shell does not scroll.

  `min-h-0` rides along in both places and is the non-obvious half: a grid or flex child defaults to `min-height: auto` and refuses to shrink below its content, so `overflow-y-auto` alone does nothing at all.

  **This changes a template, not a runtime.** Templates are copied at scaffold time, so an existing app owns its own `layout.tsx` and is untouched. Adopting the change means copying the two edits; leaving it alone costs nothing except the original trap.

  **The frontend skill taught a call that cannot compile.** It showed `theoFetch('/api/tasks/:id', { params: { id: 1 } })`; `TheoFetchOptions` has no `params`, and had it compiled the request would have gone to the literal `:id`. An agent reading the skill wrote that call. `params` is real — but only on the GENERATED client, which knows the route tree, and that is exactly why the wrong example was plausible.

  Both examples are now what the generator actually emits, measured against it: methods are lowercase (`client.tasks.get()`), a dynamic segment loses its colon (`client.tasks.id`, never `client.tasks[':id']`), and `params` values are strings. Regression tests pin all of it, including the `min-h-0` that the CSS silently depends on.

### Patch Changes

- ac8cd89: The scaffold says what it installed, and where to look before writing markup by hand.

  It installs two component libraries and pointed at neither. A real app built on this template hand-wrote around 600 lines of navigation, queue rows, filters, status badges, empty states and a composer — and every one of them already existed in the packages the scaffold had put there. The components were present; nothing said so.

  The README now carries a routing table — agent surfaces from `@theokit/ui`, app chrome from `@usetheo/ui` — and both it and the UI skill point at `node_modules/@theokit/ui/llms.txt`, which is written for an agent to read and carries the same table in full. `@usetheo/ui` has no such file, and that is stated rather than implied.

  The UI skill also stops claiming a version. It said `@theokit/ui` was "currently `1.0.0`" while npm served `1.5.1` — a document cannot hold a number that moves, and `package.json` already does.

## 1.23.12

### Patch Changes

- 2be3a2f: The generated `@theo/client` produces real types instead of `any`.

  Inside a `declare module` block, a relative `import type` aliased at the top and then fed to an external package's conditional type resolves to `any` — silently, with no error, which is what made it invisible. Every call through the generated client returned `any` while the app compiled and the developer believed they were using a typed client.

  Route exports are now named inline as `typeof import('../server/routes/x').GET`, the form measured to survive. No aliased relative import is left in the generated output: the controller path moved to the same shape, because the alias resolved correctly in one block and to `any` in another with nothing in the file to say which.

  The scaffold's `tsconfig.json` also includes `.theokit/**/*.d.ts` now. It listed `types/**/*.d.ts` and not the directory the framework writes into, so the generated client types were never loaded at all — which hid the defect above from anyone who looked.

  The tests that pinned the old output matched the emitted string, down to the alias. A string assertion cannot tell a type that works from one that collapses; the new test compiles the generated file and asserts the compiler rejects a wrong assignment.

## 1.23.11

### Patch Changes

- 11385c7: A freshly scaffolded app passes its own `lint` and `format:check` before anyone edits a line.

  It did not. After the first `pnpm build`, `pnpm lint` reported around 1800 findings in `.theokit/` — generated `.d.ts` nobody wrote — because the template's ESLint config ignored `dist/` and `node_modules/` and not the framework's own output. `pnpm format:check` failed on the lockfile and on eleven markdown files the template ships, because the template carried no `.prettierignore` at all.

  Neither is a broken build. Both are worse in a quieter way: a developer who adds a real error of their own cannot find it in the noise, and a gate nobody can act on stops being read.

  The template now ships a `.prettierignore`, its ESLint config ignores `.theokit/`, and its markdown is formatted to the config it hands the app.

## 1.23.10

### Patch Changes

- 91fce47: An agent now declares who may run it, and every endpoint it exposes obeys that declaration.

  An agent file exports a `policy` — the string `'public'`, or a function over
  `{ subject, body, params }` — and the run endpoint, the thread routes, the pending-approval listing,
  the approve route and MCP all evaluate it, through the same function the route executors and the
  in-process caller use. `params` carries `{ agent, endpoint, sessionId?, approvalId? }`, so one
  declaration can answer the endpoints differently. `requireOwner` is the primitive for the owner
  check, the same one routes use.

  Identity comes from `ctx.subject`, produced by the application's own `server/context.ts`. That seam
  is the one every `route()` already reads and no agent URL ever reached: the agent endpoints are
  dispatched before route matching, so no route, no `server/middleware/` and no `server/context.ts`
  observed those URLs, and the endpoints resume the conversation the caller names. The check runs
  before the module is compiled and long before the SDK — an agent run spends real tokens, so a caller
  who may not run it is turned away before any of that is paid for.

  **Breaking.** The agent scanner refuses a file under `agents/` that declares nothing, so
  `theo build`, `theo start` and `theo dev` fail until each agent says something. The error names the
  file, the URL it serves and the two ways out. This is the same gate the route scanner applies, and
  absence had to stop meaning open here for a sharper reason than it did there: no runtime default is
  both safe and non-breaking, because refusing every caller-supplied session id breaks multi-turn chat
  and admitting them is the defect. `'public'` is still an answer — it says out loud that the app runs
  a capability model, where holding an id is the whole of the permission. Nothing changes for an agent
  module built in memory and handed to `mountAgent` directly; that value never passes a scanner.

  Also breaking: `GET /api/agents/<name>/approvals` is gated by the same declaration and 404s for an
  agent that does not exist, and a refusal from any agent endpoint no longer repeats which check
  refused it — the wire gets one fixed message naming what to supply, and the reason goes to the
  server log.

  The scaffold's agent declares `export const policy = 'public'`, with the owner check written out
  above it. `MIGRATION.md` has the guide.

- 8080434: Scroll restoration now covers the element your layout scrolls, not only the document.

  The router mounted react-router's `<ScrollRestoration>`, which restores `window.scrollY`. A layout
  that scrolls an inner element — which is what the default scaffold ships — leaves the document with
  no offset to save, so restoration ran and restored nothing.

  Mark the element with `data-theo-scroll="<id>"` and its offset is restored on back navigation. The
  value is the id, so a page with two scrollers stays unambiguous. Declared rather than detected:
  walking the DOM for `overflow: auto` picks a container silently, and a different one as the layout
  changes.

- 6982cfa: Reproducing production locally is one command, and a back navigation returns to where the reader left off.

  `theokit preview` builds and then serves, in that order, stopping at the first failure. It replaces
  `theokit build && theokit start`, whose failure mode is silent: `start` serves whatever `.theokit/`
  already holds, so a skipped or failed build serves the previous one and nothing says so — worst
  exactly when the two-step version is being used, which is to check whether a change works. It is not
  a third implementation of either step; both stay separately invocable, because CI builds and serves
  in different jobs. Scaffolded projects gain a matching `preview` script.

  `ScrollRestoration` is mounted once at the root of the generated route manifest. It was mounted
  nowhere, so a back navigation landed wherever the browser had left the offset. It sits beside the
  application's own root element rather than replacing it, so a layout still receives `<Outlet />` as
  its `children`.

  Mounting it costs nothing at render time and nothing in the document. In a `createBrowserRouter`
  application the component returns early — react-router's Framework Mode context is absent — so it
  renders `null` on the server and on the client alike, emits no `<script>` and needs no CSP nonce.
  That is what keeps the server tree byte-identical to the client one, the parity the renderer already
  protects with `hydrate: false` after a tree mismatch measured CLS 0.39. The restoration itself runs
  in `useScrollRestoration`, which needs only the data-router context `RouterProvider` supplies.

  One assertion changed shape rather than intent: the manifest imported `Outlet` only when a layout
  existed, and now always imports it, because the root's new element renders children through it.

- 15f81f7: `create-theokit … --use-pnpm` stops reporting a failure on a successful install.

  pnpm 10 no longer reads the `pnpm` field in `package.json` — it says so in the first line of every
  run — and that is where the template declared which dependencies may run install scripts. The list
  was dropped, `esbuild` and `node-pty` were refused, `ERR_PNPM_IGNORED_BUILDS` set a non-zero exit,
  and the scaffolder turned that into `✗ Failed to install dependencies with pnpm`. The very first
  command in the quickstart reported failure on a directory that was complete.

  The state it left behind was worse than the message: pnpm wrote a `pnpm-workspace.yaml` whose values
  are the sentence _"set this to true or false"_, so the project began life with a config file that
  reads like an unanswered question.

  The scaffold now ships `pnpm-workspace.yaml` with the approvals already decided, and drops the field
  from `package.json` — leaving it there costs a warning on every install for a setting that does
  nothing.

  Each entry says what the package is and why it needs to run code at install time, because approving
  a build script is a decision about running arbitrary code on your machine, not boilerplate.

- d7f8d8d: The scaffold's documented `LLM_MODEL` override is read.

  `.env.example` offered the variable and nothing in the framework read it, so a developer who
  uncommented it, set a model and restarted got the model `agents/chat.ts` declares — silently. The
  outcome is indistinguishable from the override working and picking the same value, which sends the
  reader looking for the cause somewhere else entirely.

  The generated agent now reads it where the model is already declared:

  ```ts
  .model(process.env.LLM_MODEL ?? 'openai/gpt-4o-mini')
  ```

  No framework surface was added. The model lives in a file the developer owns and edits, so a knob a
  template can honour in one expression does not need an override path threaded through the
  framework — and the value stays visible in the file that decides it. The literal remains as the
  fallback, because a scaffold has to run with no environment at all.

  The comment beside it named `ModelCapability`, a concept that exists only inside the agents package
  and its tests and appears nowhere a scaffolded app can reach. It now names `agents/chat.ts`, which
  is a file the reader has.

- 19185b2: Conversation transcripts stop landing in git.

  Every conversation a TheoKit app serves is written to `<app>/.data/agent-sessions/…/<sessionId>.jsonl`.
  The scaffold's ignore file listed `data/` — without the leading dot — which matched nothing the
  framework writes. A developer who ran the app once and committed put the full transcript of every
  turn into version control: prompts, answers, tool inputs, tool results, and then into whatever
  repository they pushed to.

  The scaffold ignores `.data/` now, which covers the transcripts and the local SQLite database that
  lives beside them.

  What let this survive is worth naming: the comment above `resolveSessionBaseDir` asserted the
  directory was "git-ignored", so the protection looked already handled to anyone reading the code.
  Nothing in the framework can make that true — the ignore file is in a different tree — and the
  comment now says so.

  The regression test derives the path from `resolveSessionBaseDir` rather than repeating `.data/`, so
  moving the transcripts breaks a test instead of quietly leaking again.

- 171f4e3: A freshly scaffolded app passes `tsc --noEmit` again. The template typed its transcript as
  `@theokit/ui`'s `UIMessage` while filling it from `useAgent()`, which returns the framework's wire
  message; the two are deliberately different types and neither can be assignable to the other.

  The app now types against what it receives and converts at the render boundary, in
  `app/lib/renderable.ts` — a projection that validates each part and drops what the installed
  component library has no renderer for, with no casts. A new CI job scaffolds the template and
  typechecks it against the packages a real user installs, which is what neither #80 nor #396 had.

- 46fb9d6: Scaffolded files are written with `O_NOFOLLOW`, so a symlink planted at a predictable name in the
  target directory no longer redirects the write. Creating and overwriting behave exactly as before.
- 4fd8f48: The `tui` and `desktop` surfaces declare their own `build` script. Both inherited the default
  template's `theokit build`, whose first act is to require the `app/` directory the same scaffold
  removes — so `npm run build` failed immediately on a correctly scaffolded project. `desktop` now
  builds with `tauri build` (whose `beforeBuildCommand` already chains the frontend and the sidecar),
  and `tui` typechecks with `tsc --noEmit`, because a terminal app runs from source and has no artifact
  to bundle. (usetheokit/theokit#374)

## 1.23.9

### Patch Changes

- 78ce3df: Four templates were removed and never announced: `saas`, `dashboard`, `api-only` and `postgres`. `--template=saas` has been failing since, with an error that correctly names the one template that exists — but nothing in the release notes explained where the other four went, so the failure read as a bug rather than as a removal.

  What ships today is `default`. `services/` and `surfaces/` under `templates/` are fragments for `--backends` and `--surface`, not values for `--template`.

  Release notes from before the removal still describe those templates in the present tense, and some describe wiring inside them. In particular, the `saas` entry says it "wires `trackAgentRun` in `server/routes/agent.ts`" — that file no longer exists anywhere in this package, and `trackAgentRun` has no production caller in the framework either (usetheokit/theokit#353). Those entries are historical records of what shipped at the time and are left as they are; this note is the correction that was missing.

  Refs usetheokit/theokit#354.

## 1.23.8

### Patch Changes

- `--example=<name>` no longer points at a repository that never existed. A bare name resolved against a hard-coded examples repository that returns 404 under both orgs, so the named form could only fail — by shelling out to `degit` and then printing that same dead URL as the place to browse examples. A bare name is now refused immediately, naming the form that works; `--example=https://github.com/user/repo` is unchanged.

  The theme contract is no longer re-exported from the Vite plugin. The re-export was kept "so existing importers keep working"; there are none — every consumer imports `core/contracts/theo-ui-theme.js` directly.

## 1.23.7

### Patch Changes

- 95b8e94: `publishConfig.provenance` sai dos pacotes: ele nunca produziu attestation e impedia o publish
  manual (#169).

  O npm recusa attestation de provenance para repositório-fonte **privado** (E422), e este repo é
  privado. Medido: nenhuma versão publicada de nenhum pacote daqui tem `dist.attestations` não-nulo —
  o campo era aspiracional desde o primeiro release.

  O custo não era só cosmético. `provenance: true` no `publishConfig` vence a flag `--no-provenance` e
  a variável `npm_config_provenance`, então com o CI quebrado o `theokit` ficou **sem via de release
  nenhuma**: nem automática, nem manual.

  Quando o repo for público, o campo volta junto com `NPM_CONFIG_PROVENANCE` e os trusted publishers.

## 1.23.6

### Patch Changes

- `--surface desktop` polish + cross-platform CI:

  - **Fix: theme colors were invisible.** The app-level styles wrapped `@theokit/ui`'s `oklch()` theme vars in `hsl(var(--x) / a)`, which is invalid CSS and rendered transparent — so the title-bar tint (and any alpha color) silently disappeared. Switched to `var(--x)` / `color-mix(in oklch, …)`.
  - **Slim, evident title bar.** The frameless top bar is now a compact `--muted` band (thin padding) that reads clearly apart from the content.
  - **Window controls with hover.** Minimize / maximize / close get proper `:hover` feedback (subtle highlight, classic red on close) via a small stylesheet, since inline styles can't do pseudo-classes.
  - **Cleaner title.** The title bar shows just the app name (drops the verbose “— TheoKit agent” suffix).
  - **Cross-platform release workflow.** Ships `.github/workflows/release.yml` — a native-runner matrix (macOS Apple Silicon + Intel, Ubuntu x64 + arm64, Windows) that builds installers and drafts a GitHub release via `tauri-action`, the documented best practice since Tauri can’t cross-compile between OSes. Documented in `README-surface.md § Packaging` (with the sidecar-as-binary prerequisite).

## 1.23.5

### Patch Changes

- `--surface desktop`: seamless title bar. The window is now frameless (`decorations: false`) and the app owns its top bar — it's the app background with a faint gray wash, so no OS chrome clashes with the UI. The bar is draggable (`data-tauri-drag-region`) and carries its own minimize / maximize / close controls next to the theme switcher. Adds the required `core:window:*` capabilities (`start-dragging`, `minimize`, `maximize`, `unmaximize`, `toggle-maximize`, `close`) so the drag + buttons actually work.

## 1.23.4

### Patch Changes

- Fix `--surface desktop`: the agent never responded because the Tauri `run_turn` command resolved before the sidecar stream was delivered. The webview's `ChannelTransport` calls `invoke('run_turn').then(onClose)` and `onClose` closes the stream — so when `run_turn` returned early (spawning a detached forwarding task), every streamed chunk arrived after the stream was closed and was dropped (user message shown, no reply, no error). `run_turn` now awaits the sidecar stream inline before resolving, so `onClose` fires after the last chunk. Also forwards the process env (`.envs(std::env::vars())`) so the provider key reaches the sidecar. HITL is unaffected. (#137)

## 1.23.3

### Patch Changes

- TUI surface: adopt `@theokit/tui@0.41.1` — the `/select` multi-select checkbox now uses the smaller `○` / `●` circle instead of the bulky `◯` / `◉` LARGE CIRCLE, so the option list reads lighter and less cramped inside the demo box.

## 1.23.2

### Patch Changes

- TUI surface: wrap the `/plan · /ask · /select · /progress` demo surfaces in a rounded, padded box so the group breathes without spacing individual menu rows — the Claude-Code friendly-spacing look (box + padding, items tight inside). Fixes the "colado" feel of `/select` without oscillating between too-tight (`gap=0`) and too-spaced (`gap=1`); the `gap` opt-in stays documented for users who still want inter-item blank lines.

## 1.23.1

### Patch Changes

- TUI surface adopts `@theokit/tui@^0.41.0` and documents the opt-in row `gap`. The list/menu demos (`/progress`, `/ask`, `/select`) keep their tight, Claude-Code-matching default (no visual change from 1.23.0); a comment in `tui/components/Demos.tsx` shows how to add `gap={1}` to `MultiStepProgress` / `QuestionPrompt` / `SelectList` for a blank line between items, now that `@theokit/tui@0.41.0` exposes the prop (usetheodev/theokit-tui#50). Terminal spacing is whole-row only (0 = tight, 1 = one blank line) — the default is 0.

## 1.23.0

### Minor Changes

- 68f4abc: Componentize the scaffolded TUI surface. `tui/App.tsx` drops from 460 to 230 lines and becomes a focused composition root; the welcome `Banner`, the `/usage` observability panel (`UsagePanel`), and the `/plan /ask /select /progress` showcase (`Demos`, which owns its own progress timer) move to `tui/components/*` — each single-responsibility and, for the demos, deletable in one file. The generated app ships a `## Architecture` System Design in `README-surface.md` (component tree + data flow + layer boundaries + extension points). Pure refactor: every 1.22.0 behavior is preserved (Stack layout, PermissionPrompt HITL, `/usage` from real usage, the four demos, Toast, two-step Ctrl+C, Esc routing); the generated app typechecks against the 0.40.0 types with zero unused imports and no `as` type assertions (the slash-command router uses explicit type-safe cases).

## 1.22.0

### Minor Changes

- TUI surface wires the full `@theokit/tui@0.40.0` component set live into the scaffolded app — each with a real hook, not a static gallery. `Stack` lays out the app with the Claude-Code one-line cadence. `/usage` toggles an observability panel built from the last turn's real usage: `ContextWindowBar` (context fill), `TokenUsageChart` (input/output/cached/reasoning breakdown), and `CostMeter` (session cost, when reported). A `Toast` surfaces transient outcomes (a demo answered, a task finished; auto-dismiss). Four slash-command demos run interactively from the composer: `/plan` → `PlanApproval` (approve/revise a markdown plan), `/ask` → `QuestionPrompt` (options + free-text), `/select` → `SelectList` (multi-select), `/progress` → `MultiStepProgress` + `ProgressActivity` + `ProgressBar` (timer-advanced multi-step task). Every surface is deletable from the one file. Live-verified end-to-end in a real terminal; the generated app typechecks against the 0.40.0 types.

## 1.21.0

### Minor Changes

- TUI surface adopts `@theokit/tui@^0.40.0` and upgrades the human-in-the-loop gate to the Claude-Code `PermissionPrompt` card. A gated tool now renders a structured approval card — tool-type header, the command on its own line, the proposed input as a description, `Do you want to proceed?`, and a numbered `1. Yes / 2. No` menu (↑/↓ + Enter, Esc → the safe `No` default) — replacing the previous `once/always/reject` `ApprovalPrompt` bar. The `onDecision` maps `yes` → approve. Live-verified end-to-end: a real model turn calls `send_notification`, the card renders, `Yes` approves, and the tool executes.

## 1.20.1

### Patch Changes

- TUI: monochrome-by-default chrome — color is now reserved for meaning. The assistant `⏺` bullet, the `>` prompt, and the input border render in the terminal's default color (via `tui/theme.ts`: `accent: ''` + neutral `role.*.prefix`), while semantic colors are kept: tool states (pending gray · running yellow · success green · failed red) and errors (red). The welcome banner keeps its accent (it uses the `ACCENT` const directly). Restyle in one line — set `accent: ACCENT` to colorize the chrome, or tint the bullets via `role.*.prefix`.

## 1.20.0

### Minor Changes

- TUI: a `npm run demo:tools` script (and `tui/tool-variations.tsx`) that renders a visual reference of every way the timeline draws a tool — pending, running, success, a shell-envelope output, failed, and approval-requested — plus an assistant markdown turn and a thinking row. It feeds a synthetic conversation through the SAME `messagesToAgentEvents` → `<AgentTimeline>` path the real app uses and reads your `tui/theme.ts`, so it's an accurate, agent-free way to preview your colors/glyphs and see each tool state. Delete the file if you don't want it.

## 1.19.0

### Minor Changes

- TUI: a single **`tui/theme.ts`** file to restyle the whole terminal UI. All the visual knobs — the accent color, the global `@theokit/tui` theme (with commented bullet-glyph override examples), the welcome-banner wordmark (`LOGO`), the tips + what's-new copy, the thinking-spinner words, and the input placeholder — now live in one well-documented file. `tui/App.tsx` imports from it and never needs touching for a rebrand: change the accent, swap the ASCII wordmark (`npx figlet -f "ANSI Shadow" "YourApp"`), edit the copy — done. Verified live: editing only `tui/theme.ts` re-themes the banner (accent + copy) on the next launch.

## 1.18.0

### Minor Changes

- TUI adopts `@theokit/tui@0.37.0`, closing the last two Claude-Code parity gaps (issues #44 + #45):

  - **Two-line footer** — the single-line status bar is replaced by `<StatusFooter>`: a top row with the model on the left and the context usage (`506/128k context`) justified to the right edge, and a bottom `? for shortcuts` row (the shortcuts move here from under the input box — the Claude Code layout).
  - **Thinking spinner: sparkle + token direction** — the spinner is now a cycling `✵`/`✳` sparkle (was a braille spinner) and the token count carries a `↓` arrow: `✵  Thinking (1s · ↓ 543 tokens · esc to interrupt)` — the exact Claude Code streaming line.

  Bumps `@theokit/tui ^0.36.0 → ^0.37.0`. Live-verified end-to-end against a real model turn.

## 1.17.2

### Patch Changes

- TUI: add a one-line top margin above the input composer (and the approval prompt that replaces it), so it no longer sits flush against the last message — a bit more breathing room between the conversation and where you type.

## 1.17.1

### Patch Changes

- TUI welcome banner refinements: it now spans the **full terminal width** with a one-cell margin on every side and inner padding; the mascot is replaced by a bold **"Theo"** wordmark (block letters) in the coral accent; and the layout has more breathing room between the logo, the `✻ Welcome` line, and the tips/what's-new columns. A fixed-width left column keeps the two-column layout intact even when the cwd is long (it truncates instead of pushing the right column off-screen).

## 1.17.0

### Minor Changes

- TUI surface: a Claude-Code-shaped welcome banner. On a wide terminal the scaffold now opens with a
  two-column box — LEFT: the `✻ Welcome to <app>` header, a little pixel mascot, the model, and the cwd
  (home tildeified); RIGHT: a `Tips for getting started` column and a `What's new` column — in Claude
  Code's warm coral border. It collapses to a single column (header + mascot + model + cwd) on narrow
  terminals so nothing truncates. Built as a small custom `<Box>` banner because `@theokit/tui`'s
  `WelcomeBanner` caps its width at 60 cols, too narrow for the two-column layout. Live-verified in a real
  terminal. No new deps.

## 1.16.1

### Patch Changes

- TUI surface adopts `@theokit/tui@0.36.0` for the last mile of Claude-Code parity:

  - **Thinking spinner shows the live token count + "esc to interrupt"** — the streaming hint is now the exact Claude Code shape `(Ns · N tokens · esc to interrupt)` (the scaffold passes the last turn's `totalTokens`), replacing the earlier `esc to cancel` with no count.
  - **Tighter assistant/tool alignment** — the `⏺` bullet's two-space gap now aligns assistant message rows with tool rows (from the theme), and `<AgentTimeline>` spacing between blocks reads cleaner.
  - **Errors render as a `<Notice variant="error">`** (`✗` marker) instead of a raw red line.

  Bumps `@theokit/tui ^0.35.0 → ^0.36.0`. Live-verified against a real model turn (`⠼  Thinking (1s · 510 tokens · esc to interrupt)`).

## 1.16.0

### Minor Changes

- TUI surface: a much closer Claude-Code look & feel out of the box.

  - **Welcome banner** — `✻ Welcome to <app>` in Claude Code's warm accent, with a `/help for help · /clear to reset` tips line and the cwd, in a rounded box (via `@theokit/tui`'s `WelcomeBanner`).
  - **Warm accent** — the theme accent is now Claude Code's coral `#d97757` (truecolor, degrades gracefully) instead of cyan: it colors the `✻`, the `⏺` assistant/tool markers, the box borders and the `>` prompt.
  - **Thinking spinner with personality** — while the agent streams, the spinner cycles whimsical status words (`Thinking · Pondering · Noodling · Percolating · Baking · Brewing · Simmering · Conjuring · Musing · Marinating`) and shimmers, with the elapsed seconds + `esc` hint (via `AgentStreaming`'s `phrases` + `shimmer`).
  - **Cleaner input** — a minimal `? for shortcuts` hint under the composer (the full keybinding list lives in the `?` panel), and an `Ask <app> anything…` placeholder.

  Live-verified in a real terminal against a real model turn. No new deps.

## 1.15.1

### Patch Changes

- TUI surface adopts `@theokit/tui@0.35.0`, which closes the two gaps the previous scaffold worked around:

  - **Claude-Code bullet glyph `⏺`** restored in the theme (issue #40) — the assistant/tool marker now matches Claude Code exactly, with no scaffold change (it comes from the theme).
  - **Real `<ApprovalPrompt>` choice bar** for HITL (issue #41). The scaffolded `tui/App.tsx` now wraps its tree in `<InkInputProvider>` (bridges Ink's stdin to the library's interactive surfaces) and renders `@theokit/tui`'s `<ApprovalPrompt>` — an `Allow once / Allow always / Reject` choice bar navigable with ←/→ + Enter — in place of the earlier Ink-native `[y]/[n]` prompt. Maps the choice to `agent.approve(approvalId, { approved: decision !== 'reject' })` and remembers settled ids so the standalone gate part stops re-showing. Live-verified end-to-end against a real model turn: navigate → commit → the gated tool runs → the agent continues → the prompt clears.

  Bumps `@theokit/tui ^0.34.0 → ^0.35.0`.

## 1.15.0

### Minor Changes

- TUI surface: **human-in-the-loop approval** for gated tools. The default agent now ships a demo
  side-effecting tool (`send_notification`) gated via `.approval('send_notification', …)`; ask the agent to
  "notify me that …" and the run pauses. The scaffolded `tui/App.tsx` surfaces the pending gate with
  `@theokit/tui`'s new `findPendingApproval(agent.thread)` and shows an approval prompt in place of the
  composer — `[y] allow · [n] reject` — settling it via `agent.approve(approvalId, { approved })`, then
  clearing once answered. The whole gate is real: the SDK genuinely parks the tool until you decide, the
  tool runs on approve and is skipped on reject. Live-verified end-to-end against a real model turn. Bumps
  `@theokit/tui ^0.33.0 → ^0.34.0` (adds `findPendingApproval` + `PendingApproval`). (The prompt is
  Ink-native — `@theokit/tui`'s `ApprovalPrompt` component targets its own renderer's input system, which
  the plain-Ink scaffold does not run.)

## 1.14.1

### Patch Changes

- Bump the default template's pins to the releases that carry the per-turn usage metadata the TUI footer reads end-to-end: `theokit ^0.43.0 → ^0.43.1` and `@theokit/agents ^0.42.0 → ^0.43.0`. Without this, a fresh scaffold installed `@theokit/agents@0.42.x` whose stream did not ride usage on the finish chunk, so the footer's tokens/cost stayed blank against a real model turn. Now the whole chain — translator emits `messageMetadata` → `readUIMessageStream` lands it on `UIMessage.metadata` → `readTurnUsage` → `AppStatusBar` — ships from published bits.

## 1.14.0

### Minor Changes

- TUI surface: Claude-Code interaction parity in the scaffolded `tui/App.tsx`. The composer already carried the primitives from `@theokit/tui`; the app now wires the full set:

  - **Keyboard-help panel** — `?` on an empty line (or `/help`) toggles a `KeyboardHelp` overlay listing every shortcut (`DEFAULT_COMPOSER_SHORTCUTS`).
  - **Ctrl+C two-step quit** — a single press cancels a running turn or arms the exit (`Press Ctrl+C again to quit`); a second press quits. `tui/main.tsx` now renders with `exitOnCtrlC: false` so the app owns the key.
  - **Slash-command palette** — `/clear` and `/help` in a prefix-filtered menu (typing `/` opens it; ↑↓ select, Tab/Enter complete).
  - **@-file mentions + ↑↓ history** — already on by default from `ChatComposer` (gitignore-aware cwd walk + input recall), now surfaced in the placeholder/help.

  Live-verified in a real terminal: the help panel toggles, Esc dismisses it, and the two-step Ctrl+C quit arms then exits.

## 1.13.0

### Minor Changes

- TUI surface: the status-bar footer now shows **real tokens and cost**, not just `model · cwd`. Bumped `@theokit/tui ^0.32.0 → ^0.33.0` and wired the scaffolded `tui/App.tsx` to read each turn's usage off `useAgent().thread` (via `readTurnUsage`) — rendering the current turn's context tokens against the model's window (`12.3k/128k`) plus the summed session cost (`cost ~$0.01`). The window denominator is a new `AGENT.contextWindow` field in `shared/agent.ts` (a model property you set when you change models — 128k for gpt-4o-mini). The footer is now `model · cwd · tokens · cost · state`, the Claude-Code shape. Requires `@theokit/tui ^0.33.0`.

## 1.12.0

### Minor Changes

- Scaffolds now work + look right on every surface:

  - **SDK compatibility fixed (all surfaces).** The default template pinned a stale `@theokit/sdk ^2.25.0` while `theokit@0.43.0` peers `^4.0.1` — every freshly-scaffolded app installed an incompatible SDK 2.x. Bumped to `^4.0.1`, plus `@usetheo/ui ^0.14.0 → ^0.26.0` (the `@theokit/ui@1.x` peer). Guarded by a regression test.
  - **TUI surface: Claude-Code render.** `create-theokit --surface tui` now renders via `<AgentTimeline>` — assistant turns as Markdown (headings, lists, fenced code → syntax-highlighted code blocks) and tool calls as collapsible cards (`⎿` output) — instead of plain text. Bumped `@theokit/tui ^0.30.0 → ^0.32.0` and declared its `figlet`/`lowlight` peers (pnpm never auto-installs peers, so without them the TUI crashed at boot under pnpm). The app's own code + `@theokit/tui` are ai-free (project `useAgent().thread` via `messagesToAgentEvents`); `ai` stays a dep only for theokit's in-process agent runtime.
  - **Clean start.** The default agent tools import `tool` from the `theokit/server/define` sub-path instead of the deprecated umbrella `theokit/server`, so the TUI boots without a deprecation warning.

## 1.11.2

### Patch Changes

- f61b77f: Adopt `@theokit/sdk@3.x` (SE36 uniform `X.create()` API).

  SDK v3.0 removed the standalone factory functions in favor of static `X.create()` namespace methods. The `@theokit/agents` bridge now binds the new names — `Tool.create` (was `defineTool`), `SkillReadTool.create` (was `defineSkillReadTool`), `Retry.create` (was `withRetry`) — and the scaffold's code-defined skill uses `Skill.create` (was `createSkill`). While migrating, the tool-handler wrapper (`withRunContext`) was fixed to forward the **full** tool `ctx` — the SE12 `messages` transcript projection was being dropped, which would have silently broken a tool that reads the turn transcript; the handler types now track the SDK's canonical `CustomTool['handler']` instead of a hand-maintained duplicate.

  **Breaking (peer requirement):** `theokit` and `@theokit/agents` now require `@theokit/sdk >= 3.5.0` (and `@theokit/sdk-tools >= 0.9.1`, the SE36-migrated build). Apps on `@theokit/sdk@2.x` must upgrade — run `npx @theokit/codemod-sdk-3-0 --write` to migrate app code that calls the old factories directly.

## 1.11.1

### Patch Changes

- d186cb1: DX: move the `.skills()` mechanism explanation from the scaffold into the API's JSDoc.

  The `agents/chat.ts` scaffold carried a 4-line inline comment explaining _how_ skills work (the `<skills>` block + the on-demand `skill_read` tool). That belongs on the API, not in the developer's first file. The explanation now lives in the `.skills()` JSDoc (discoverable on hover / cmd-click) and the scaffold keeps a one-line pointer — so a freshly scaffolded `chat.ts` reads as intent (`​.skills([dailyBriefingSkill])`) with the "how" one hover away.

## 1.11.0

### Minor Changes

- c8ceb5e: `useAgent` now exposes the whole conversation as `thread`, not just the current turn (M46, #125, ADR-0058).

  The client store (`theokit/client/core`) accumulates a surface-agnostic `thread: UIMessage[]` — committed turns + the current user message + the in-flight streaming assistant — with stable message ids, committed exactly once, cleared only by `reset()`. Render `const { thread } = useAgent(...)` (or `createAgentClient(...).getState().thread` from the React-free core) instead of hand-rolling a transcript from per-turn `messages`. Same shape on web, desktop (Tauri) and TUI.

  - Per-turn `messages` keeps its exact back-compat semantics — `thread` is purely additive; existing call sites are untouched.
  - The `@theo/agents` codegen types `thread` automatically (it emits the `UseAgentReturn` interface name).
  - An errored or aborted turn is dropped rather than corrupting committed history; stale (aborted) drives never append.
  - **create-theokit:** the scaffolded web, TUI, and desktop apps now render `useAgent().thread` directly — the ~88-line hand-rolled transcript (local history + commit-once effect + inflight-merge) is gone from all three surface templates.

## 1.10.0

### Minor Changes

- **Scaffold shows how to add screens — a nav menu + an example route + docs — using TheoKit's own client
  primitives.** A one-route scaffold didn't indicate where a second screen goes. Now it does, without a dead
  demo, and it models `theokit/client` (not raw react-router):
  - `app/components/Nav.tsx` — the primary navigation menu, one entry per screen, using TheoKit's `Link`
    (react-router Link + route **prefetch** on hover/focus) + `useLocation` for the active route. Composed
    into the `Header`.
  - `app/about/page.tsx` — a real, self-documenting `/about` route (explains file-based routing, links back
    to the chat with TheoKit's `Link`, sets its `<title>` with TheoKit's `<Metadata>`, and tells you to
    delete it once you've got the idea). It works — not a fake screen.
  - `page.tsx` now sets its title via `<Metadata>` too, and carries a pointer comment on adding screens.
  - `docs/ARCHITECTURE.md` § **Adding a screen** — the folder convention (`app/settings/page.tsx` →
    `/settings`, dynamic `[id]`, catch-all `[...slug]`), the `theokit generate page <name>` command, and
    TheoKit's client primitives (`Link` prefetch, `Metadata`, `Image`, `theoFetch` + the `react-query`
    adapter) — reach for these over generic libraries.

  Note: a `pages/` folder holding routes is an anti-pattern here — `app/` **is** the pages layer (file-based
  routing: the folder path is the URL, so `app/pages/chat/page.tsx` would serve `/pages/chat`). That's the
  old Next.js Pages Router the App Router (which TheoKit follows) dropped.

## 1.9.1

### Patch Changes

- **docs: clarify that `loading`/`error`/`not-found` are route files, not components.** `docs/ARCHITECTURE.md`
  now spells out that the router binds `page`/`layout`/`loading`/`error`/`not-found` by name + location
  (they live at the route segment — the `app/` root for `/`), so they sit beside `components/`/`hooks/`/`lib/`
  by convention, not by mistake — and moving `loading.tsx` into `components/` would drop the route's loading
  UI. This is the Next.js App Router model TheoKit implements. No code change.

## 1.9.0

### Minor Changes

- **Scaffold frontend is now type-based (`components/` + `hooks/` + `lib/`).** The web `app/` was refactored
  from one folder into the layout most React apps grow into, with each bucket holding real, extracted code
  (no empty placeholder folders):
  - `app/components/` — `Header.tsx`, `ChatPanel.tsx` (transcript + starters), `Composer.tsx` (input + error
    - new-chat). Flat `.tsx`, Tailwind (no CSS modules), the shadcn/ai-chatbot convention.
  - `app/hooks/use-transcript.ts` — the transcript/streaming STATE hook (unit-tested).
  - `app/lib/constants.ts` — greeting + starter prompts.

  `page.tsx` is a thin composition root (lays out `<ChatPanel>` + `<Composer>`, pulls state from the hook);
  `layout.tsx` composes `<Header/>`. `utils/`/`styles/`/`assets/` are documented as the convention but not
  shipped empty (YAGNI). No `main.tsx`/`index.js`/`pages/` — the entry is framework-owned and routes are
  files (Next.js-style). `--bare` drops `components/`+`hooks/`+`lib/` and rewrites `layout.tsx` to an
  unstyled shell (also fixing a latent bare bug where `layout.tsx` imported the removed `@theokit/ui`).

## 1.8.0

### Minor Changes

- **Frontend organized semantically — state in a hook, feature internals in a private folder.** The web
  `app/` no longer inlines the chat's transcript logic + constants in a 158-line `page.tsx`. Following the
  pattern every serious chat frontend converges on (Vercel `ai-chatbot`, the AI SDK docs), the page is now
  the presentational **view**, and the transcript/streaming **state** lives in a hook. Files are grouped
  semantically:
  - route surface (`page` / `layout` / `error` / `loading` / `not-found`) stays at the `app/` root — the
    only files the router serves;
  - the chat feature's internals live in an **`app/chat/`** folder: `use-transcript.ts` (the transcript
    state hook, now unit-tested in `use-transcript.test.ts`) and `constants.ts` (greeting + starter prompts).

  `chat/` is never a route: a folder is only served when it holds a `page`/`layout`/… file (Next-style
  colocation), and `chat/` holds only the feature's modules. Grouping the feature in ONE folder — rather
  than scattering `hooks/` + `lib/` with a single file each — is feature-colocation that scales (a second
  feature becomes its own `<feature>/`). `docs/ARCHITECTURE.md` documents the split. `--bare` drops
  `app/chat/` too (its files import `@theokit/ui`, which bare removes).

## 1.7.0

### Minor Changes

- **Scaffold wires its skill in ONE call.** `agents/chat.ts` now uses just `.skills([dailyBriefingSkill])`
  (requires `@theokit/agents@^0.38.0`): registering the inline skill also auto-provisions the `skill_read`
  tool, so the separate `.tool(defineSkillReadTool([...]))` line + its import are gone. Same behaviour, half
  the wiring.

## 1.6.0

### Minor Changes

- **Default scaffold registers its skill via `.skills([...])`, not just a read tool.** `agents/chat.ts`
  now wires the inline `dailyBriefingSkill` with `.skills([dailyBriefingSkill])` (requires
  `@theokit/agents@^0.37.0`), so the SDK lists the skill's name + description in the `<skills>` system-prompt
  block automatically. The persona no longer hardcodes the skill name — the model discovers it from the
  block, then loads the body on demand via the `skill_read` tool (`defineSkillReadTool`). Removes the
  previous workaround (skill name repeated in the prompt).

## 1.1.1

### Patch Changes

- deb93bf: **M45 fix — the scaffolded `--surface tui|desktop` apps now install + type-check.** Found by running every
  `--surface` scenario end-to-end (real `npm install` resolution + `tsc`):

  - **`react-router` was wrongly dropped** for tui/desktop. `theokit` declares it a REQUIRED peer, so removing
    it broke `npm install` (unsatisfied peer). It is kept now (unused by tui/desktop, but the peer must resolve).
  - **`ai` was missing** from the tui/desktop deps. It was transitive via `@theokit/ui` (dropped for those
    surfaces), but the unified client (`useAgent` / `createAgentClient`) consumes the `ai` UIMessageStream
    reader at runtime. Declared explicitly now.
  - **`JSX.Element` → `ReactElement`** in the Ink `App.tsx` template. React 19 removed the global `JSX`
    namespace, so `JSX.Element` failed to type-check; the component returns `ReactElement` now.

  A comprehensive `surface-matrix` test now exercises every scenario (all `--surface` forms + invalid,
  web/tui/desktop full trees, `--surface` composing with `--backend`, forced-error rollback) and asserts
  the deps, scripts, tsconfig `include`, and unified-client wiring. The tui `InProcessTransport` run binding
  (`streamAgentTurnInProcess`) is type-sound: the client `ApprovalDecision` is structurally identical to the
  SDK's `HitlDecision`.

## 1.1.0

### Minor Changes

- 79b7ed9: **M45 — `create-theokit --surface web|tui|desktop`: scaffold the three surfaces on the unified client.**

  `create-theokit` can now generate a terminal (Ink) or desktop (Tauri) agent app, not just web.
  `--surface` is a flag (mirrors `--backend`): `--surface tui` scaffolds an Ink app whose component drives
  `useAgent(new InProcessTransport({ run: (i) => streamAgentTurnInProcess(mod, apiKey, i) }))` (M41);
  `--surface desktop` scaffolds a Tauri app — a Node **sidecar** (`streamAgentTurnInProcess` → JSONL, the
  M35/M36 server seam), a Rust `src-tauri` shell that pushes sidecar lines over a `Channel`, and a
  vanilla-JS webview that consumes them via `createAgentClient(new ChannelTransport({ source }))` from the
  React-FREE `theokit/client/core` (M42 + M44). Each scaffolded surface uses the UNIFIED client (the
  DX-track payoff — TUI exercises M41, Desktop exercises M42 + M44's no-React client), NOT the raw seam.
  `--surface web` (default) is unchanged. The Ink/Tauri/Rust boilerplate lives entirely in the scaffolder
  templates — framework core stays Tauri/Ink-agnostic (ADR-0045 preserved), and `--surface` is a flag, not
  a new top-level template (ADR-0023 default-only preserved). `--bare` refuses to combine with a
  non-web surface (it strips the agent deps those surfaces need). ADR-0054.

  > Evidence boundary (honest): the scaffold correctness (files present, unified-client wiring, web-only
  > deps dropped, `{{name}}` substituted) is validated by the test suite. The generated TUI's real run
  > (needs an LLM key + a TTY) and the Desktop's full Tauri **Rust build + GUI** are toolchain/key-gated —
  > the Rust boilerplate mirrors the proven `theo-code-v2/apps/desktop` reference.

## 1.0.17

### Patch Changes

- 25f7723: Fix (#79): the shipped `theokit-agents` skill doc taught the wrong `defineAgentTool` signature —
  `{ input, execute }` returning an object. The real API (`DefineAgentToolSpec`) is
  `{ inputSchema, handler }` where `handler` returns a **string**; a user copying the doc got code
  that failed `tsc`. Corrected the example, fixed a stale `@theokit/sdk-tools` tool name in the
  "you are here" map (`createSearchTool` → `createSearchTextTool`/`createGlobTool`/`createShellTool`),
  and added a regression guard test that asserts the doc's `defineAgentTool` block uses `inputSchema` +
  `handler` (fail-closed on future drift).
- 6a91f17: Fix (#81): `defineAgent({ tools })` now type-accepts the `@theokit/sdk` `CustomTool` that `defineAgentTool` and every `@theokit/sdk-tools` factory return (previously `CustomTool` was not assignable to the internal `CompiledTool`, so the documented tool pattern failed `tsc` even though it ran). The `tools` field is typed `readonly CustomTool[]` and normalized to `CompiledTool` at compile.

  Fix (#80): the `create-theokit` default template now type-checks, builds, AND renders on a fresh scaffold. `app/page.tsx` was migrated to the `@theokit/ui@1.0.0` auto-dispatch chat API (`ChatMessage` takes a `UIMessage` and renders its parts; the old manual `Message`/`ToolCallCard` flatten is gone), the template ships `@types/node` + `experimentalDecorators`/`emitDecoratorMetadata` (so tool handlers and the `@Agent` class surface type-check), and a jsdom render test (`app/page.test.tsx`) guards against future `@theokit/ui` drift. A pristine scaffold now passes `tsc --noEmit` with 0 errors (was 7).

## 1.0.16

### Patch Changes

- 2302dcb: M6 dogfood fixes — two real V1 bugs surfaced by a live `npx create-theokit` run.

  - **Tool calls crashed** (`TypeError: ... reading 'def'`): `buildSdkTools` re-ran `defineAgentTool`'s
    already-lowered JSON-Schema tool through the SDK's `defineTool` (which expects a live Zod schema).
    It now routes by `inputSchema` shape — Zod schema → `defineTool`; already-SDK-ready `CustomTool`
    (JSON-Schema `inputSchema`) → forwarded raw. Regression test + confirmed minimal repro.
  - **Fresh scaffold failed to start** (`ERR_PACKAGE_PATH_NOT_EXPORTED` on `@theokit/sdk/compaction`):
    the default template pinned `@theokit/sdk@^1.1.0`, below the `@theokit/agents@0.30.0` peer floor
    (`>= 2.13.0`). Bumped the template + fixture pins to `^2.13.0`.

## 1.0.15

### Patch Changes

- Default template now boots end-to-end. Pinned `theokit` to `^0.6.0` and `zod` to `^4.0.0` (the framework requires zod 4 / `z.url()` — apps previously crashed at config load with `z.url is not a function`). Aligned `@theokit/ui` to `^0.14.0`, fixing the `ERESOLVE` peer conflict that aborted `npm install` on a fresh scaffold. Added `pnpm.onlyBuiltDependencies` so pnpm 11 pre-approves native build scripts.
- Default template is the agent chat surface (`@theokit/ui` chat thread + a streaming `chat.ts` wired to `@theokit/sdk`).

## 0.4.0-beta.0

### Major Changes

- **Version locked to `theokit@0.4.0-beta.0`** per the `.changeset/config.json` linked invariant. `create-theokit` itself ships no template-content changes in this release — all 5 templates (default / saas / dashboard / api-only / postgres) were verified to already use the directory-nested router convention required by `theokit@0.4.0-beta.0`. Strangers scaffolding fresh apps see no migration prompt; existing apps run `npx theokit migrate router` once after upgrading.

## 0.2.1

### Patch Changes

- **Template pins bumped to stable** — `theokit` `^0.1.0-alpha.16` → `^0.2.0`, `@theokit/sdk` `^1.2.0` → `^1.3.0`, `@theokit/ui` `^0.12.0-next.0` → `^0.12.0` across all 5 templates. Strangers now scaffold against current stable releases.
- **`default/server/routes/chat.ts`** — model id prefixed with provider namespace (`openai/gpt-4o-mini` instead of bare `gpt-4o-mini`) so OpenRouter routing resolves correctly. Without the prefix the SDK fell back to a stub response.
- **`default/app/page.tsx`** TS errors fixed — `AgentErrorCard` `kind="model"` → `kind="tool-failure"`, `description=` → `detail=`, `action=` → `actions=` (real props from `@theokit/ui >= 0.12.0`). `QuickAction.label` narrowed to `string` before `handleSubmit()`.
- **`default/server/crons/cleanup-conversations.ts`** — dropped non-existent `CronContext.log` for plain `console.info` JSON lines; typed `entries: Dirent[]` for `node:fs` strict mode.
- **All 5 templates devDeps** — added `@types/node ^22.10.0` (resolves missing module errors).

### Why

`/dogfood-stranger` run 2026-05-30 surfaced 7 TS errors on a freshly scaffolded `default` project + a CRITICAL chat path failure (SDK returned canned response instead of calling the real provider). Root cause: bare model id + stale alpha pins incompatible with current `@theokit/sdk` / `@theokit/ui` releases. This patch fixes both at the template source.

## 0.2.0

### Minor Changes

- ee1b596: **Templates DX overhaul + scaffold SDK wiring (fix EC-S2/S3/S6 do dogfood-stranger run 2026-05-28)**
  - **`create-theokit` templates** (default/dashboard/api-only/postgres/saas):
    - Scripts completos: `dev` + `build` + `start` + `typecheck` declarados em todos
    - `.nvmrc` com `22.12` em todos
    - `public/favicon.ico` em todos (resolve 404 cosmético EC-S8)
    - `drizzle-kit` em devDeps de postgres + saas (EC-10 SHOULD TEST)
  - **`theokit` framework** (theokit/packages/theo):
    - `vite-plugin/theoui-detect.ts` refatorado: substituído `createRequire(...).resolve()` por filesystem walk + leitura de `package.json:exports[subpath]`. **Resolve EC-S4 root cause** (Page não hidratava) — Chrome MCP confirmou `<main>`, `<header>`, `<textarea>` agora renderizam.
    - `vite-plugin/auto-detect.ts` refatorado: mesma técnica filesystem walk (eliminação de `createRequire`).
    - D13 invariant gated por `tests/integration/no-require-on-esm-only-deps.test.ts` (2 BDD it()) — previne regressão de require em `@theokit/ui` (ESM-only by design).
    - Playwright spec `tests/e2e/scaffold-page-hydrates.spec.ts` (4 BDD it()) — required CI check para hydration regression.

  ADRs:
  - [`theokit/docs/adr/0021-dogfood-stranger-coverage-expansion.md`](docs/adr/0021-dogfood-stranger-coverage-expansion.md) — D4-D14
  - [`theokit/docs/adr/0022-create-theokit-republish-with-sdk-wired.md`](docs/adr/0022-create-theokit-republish-with-sdk-wired.md) — D2/D3/D10

  Plan: [`.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md`](../../.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md) v1.1 FAANG-grade.

- 4b97fee: TheoUI default integration — `npx create-theokit my-app` now scaffolds a working agent surface out of the box.

  **`theokit`** (`0.1.0-alpha.2`)
  - `defineAgentEndpoint({ handler })` (`theokit/server`) — sugar over `defineRoute` that turns an `async *handler(): AsyncGenerator<AgentEvent>` into a Server-Sent Events response. Standards-compliant `text/event-stream` framing; respects `request.signal` for prompt cancellation; emits a final `{ type: 'error', message }` event when the generator throws.
  - `useAgentStream(path, options?)` (`theokit/client`) — React hook returning `{ events, status, send, abort, reset }`. Transport is `fetch + ReadableStream` (not `EventSource` — POST + body required). Cleans up on unmount (StrictMode-safe).
  - `consumeAgentStream(path, options)` + `parseSSEChunk(line)` (`theokit/client`) — the pure primitive the hook glues, exposed for non-React consumers and for tests.
  - Runtime `AgentEvent` discriminated union (`message | tool_call | tool_result | error`) exported from `theokit/server` and `theokit/client`. Server emits, client consumes — no cross-package type coupling with `@theokit/ui`.
  - Auto-injection of `@theokit/ui` in the dev/build pipeline: when the user's project declares `@theokit/ui` as a dependency and the package resolves, the Vite plugin emits `import '@theokit/ui/styles.css'`, `import '@theokit/ui/fonts.css'` (or `fonts-cdn.css` when configured), and wraps `RouterProvider` in `<TheoUIProvider theme={{ defaultTheme }}>`. New optional `ui` field in `theo.config.ts` (`false | { theme, fonts }`) for opt-out and theme selection. Conservative detection: package must be declared in `package.json` AND resolvable — prevents false positives in monorepos.

  **`create-theokit`** (`0.1.0-alpha.2`)
  - Default template now scaffolds an **agent surface**: `app/page.tsx` ships `AgentComposer` + `AgentTimeline` from `@theokit/ui`, `server/routes/chat.ts` is a mock SSE endpoint emitting three `AgentEvent`s. Replace the mock with your real LLM provider.
  - New `--bare` flag — skips the TheoUI defaults for users who want a minimal scaffold. Atomic rollback: if the bare transform fails for any reason (filesystem perms etc.), the entire target directory is removed so no half-scaffolded project is left behind. `--bare` is only valid with `--template=default`.
  - `@theokit/ui ^0.1.0-next.0` is now a direct dependency of the default template.

- ee1b596: **0.2.0 — Exit alpha + enforcement cutover (CSRF strict + CSP enforce).**

  This release ends the `0.1.0-alpha.*` series and ships TheoKit's first `minor` on the `latest` npm tag. It combines the maturity work consolidated under the macro-roadmap convergence list (items #1-#6 done: scaffold + agent surface + canonical chat via `@theokit/sdk` + `defineAgentTool` + `streamAgentRun` + `createConversationHistory` + example `full-stack-agent`) with the security defaults flip previously planned as 0.3.0 (commit `3ee9dac`).

  **BREAKING (per pre-1.0 semver — `minor` = breaking until 1.0):**
  - `config.security.csrf` default flipped from `'warn'` → **`'strict'`**. Every non-GET request without the `X-Theo-Action: 1` header now returns 403 `CSRF_INVALID`. The framework's own `useAgentStream` already attaches this header (`packages/theo/src/client/agent-stream-core.ts:75`); custom fetchers, raw `<form>` posts, third-party clients, and curl-based integrations must attach the header explicitly or set `csrf: 'warn'` / `csrf: 'off'` in `defineConfig` during migration.
  - `config.security.headers.cspMode` default flipped from `'report-only'` → **`'enforce'`**. Inline scripts without a per-request nonce are blocked. The SSR hydration data script the framework emits carries the nonce automatically (T7.4 wiring verified by `tests/e2e/ssr-nonce.spec.ts` 3/3 GREEN). Third-party widgets (gtag, intercom, sentry, Plausible) and any user-authored inline `<script>` must either use the nonce mechanism or set `cspMode: 'report-only'` during migration.

  **Migration path:**
  - See `docs/migration/0.2-to-0.3.md` for the audit-grep recipes (`grep '"event":"csrf.warn"' logs.json | jq '.path'` to enumerate affected endpoints).
  - Run `theokit check --upgrade-readiness 0.3` (CLI command shipped) for a static analysis of inline scripts in your `app/**` tree.
  - If you cannot fix immediately: opt out in `theo.config.ts` via `defineConfig({ security: { csrf: 'warn', headers: { cspMode: 'report-only' } } })` and migrate at your pace.

  **Also in this release:**
  - All maturity-hardening primitives (jobs / crons / webhooks / cost tracking / transactional outbox / W3C trace context).
  - TheoCloud adapter Wave 2 stub registered (Wave 3 K8s manifest emission ships in 0.6.0).
  - Devtools overlay (auto-injected dev-only floating chip + 5-tab panel).
  - Argon2id password hashing in `examples/agent-saas` via `hash-wasm`.
  - Playwright coverage for all 5 templates (`default`, `dashboard`, `api-only`, `postgres`, `saas`).
  - Native bindings preflight (`scripts/preflight-native-bindings.mjs`) detects + auto-rebuilds `better-sqlite3` ABI mismatch on test setup. See CLAUDE.md > "Native bindings discipline".

  **Honest residual:**

  The 4-6 week warn-mode telemetry window from the original 0.3.0 plan is collapsed into a single 0.2.0 release for shipping pragmatism. Consumers who need a true warn-mode interim should pin `0.1.0-alpha.17` (last alpha) and use the migration guide to transition deliberately.

### Patch Changes

- ee1b596: **FAANG-grade provider routing — Strategy + Registry pattern.**

  Provider resolution moved from per-template conditionals into a centralized Strategy + Registry inside `theokit/server`. Consumers (template `chat.ts`, fixtures) now ship **zero conditionals on provider** — the framework resolves `apiKey` + `baseUrl` automatically from the highest-priority env var present (`OPENROUTER_API_KEY` > `OPENAI_API_KEY` > `ANTHROPIC_API_KEY`).

  Inspired by Dapr Conversation Registry (`dapr/pkg/components/conversation/registry.go`) and Encore Manager provider array (`encore/runtimes/go/pubsub/manager_internal.go`).

  **New public API in `theokit/server`:**
  - `resolveProvider(): ResolvedProvider` — throws actionable error if no env var present
  - `tryResolveProvider(): ResolvedProvider | null` — graceful degradation
  - `registerProvider(descriptor: ProviderDescriptor): void` — runtime extension point (idempotent by name)
  - `resetProviderRegistry(): void` — test-only / dev escape hatch
  - `listProviders(): readonly ProviderDescriptor[]` — sorted by priority

  **`createConversationHistory` upgrade:** auto-injects `apiKey` + `providers.routes[0]` (capability=chat) into SDK options when consumer omits `options.apiKey`. Explicit `options.apiKey` always wins (escape hatch preserved).

  **Template `chat.ts` is now FAANG-clean** — pure `model: { id: 'gpt-4o-mini' }`, no `process.env.*` reads, no provider conditionals, no manual error yields.

  **Wire protocol:** OpenAI Chat Completions (universal — every provider implements it). Anthropic uses native Messages API behind the same Strategy abstraction.

- ee1b596: **theokit-evolution-ci-and-dx onda — CI gates + template DX + devtools observability.**

  This release ships 6 deliverables from the `theokit-evolution-ci-and-dx-plan.md` v1.1:

  **Templates dogfood primitives 0.5.0 (Phase 2B):**
  - `default` + `dashboard` ship `server/crons/cleanup-conversations.ts` (daily GC of stale `.theokit/agents/*` >30d)
  - `api-only` ships `server/routes/webhooks/echo.ts` (HMAC-SHA256 self-signed pattern)
  - `postgres` ships `server/jobs/log-message.ts` (defineJob enqueue pattern, ADR-0003 transactional outbox compliant)
  - `saas` ships `server/routes/billing/stripe-webhook.ts` (Stripe HMAC verify) + wires `trackAgentRun` in `server/routes/agent.ts`

  **README docs link (Phase 2A):**
  - All 5 templates ship `📚 Full docs: https://docs.theokit.dev` in header

  **Devtools `Agents` tab (Phase 3):**
  - New tab in devtools panel showing per-run telemetry: time, user, model, tokens in/out, cost USD, status
  - `dispatcher.onAgentRun(record)` wired from `trackAgentRun` in dev mode
  - Tree-shaken in prod via universal `__IS_DEV` IIFE guard (Vite OR tsup) — devtools-treeshake test stays GREEN
  - Ring buffer cap RING_BUFFER_CAP (50) for high-throughput resilience
  - Reducer: `AGENT_RUN_ADD` + `RESET_AGENT_RUNS` actions

  **Internals:**
  - `AgentRunRecord` type + `CHANNEL_AGENT_RUN` channel in `devtools/shared.ts`
  - `trackAgentRun` extended with optional `status` field (default 'finished')

  No breaking changes; all wiring is additive + opt-in via dev mode.

- ee1b596: Fix template default chat.ts modelId: substituído `openrouter/anthropic/claude-3.5-sonnet` (model ID inválido — OpenRouter rejeita 400) por `openai/gpt-4o-mini` (cheap, always-available, empíricamente testado 2026-05-28). Resolve falha "openrouter API error: unknown (HTTP 404)" em stranger Phase 7 real LLM test.
- ee1b596: Fix template default chat.ts: adiciona `providers: { routes: [{ capability: 'chat', provider: 'openrouter' }] }` quando OPENROUTER_API_KEY presente. Sem isso, SDK inferia provider do prefixo do model id (`openai/gpt-4o-mini` → tentava OpenAI direto, exigindo `OPENAI_API_KEY`). Stranger agora pode usar APENAS OPENROUTER_API_KEY e tudo roteia corretamente.
- 4b97fee: Hotfix: default template now declares `react-router` and `zod` (theokit peer dependencies). Without these, `pnpm dev` failed immediately on a freshly scaffolded project — entry-client couldn't resolve `react-router`, and `server/routes/chat.ts` couldn't resolve `zod`. Found by running `pnpm dlx create-theokit my-app` end-to-end against the published packages. Regression test added in `tests/unit/scaffold-default-agent.test.ts` to keep peer deps locked to the template.

  Also bumps the template's `theokit` pin to `^0.1.0-alpha.4` so freshly scaffolded projects pick up this hotfix.

- ee1b596: Bump `@theokit/ui` pin em templates de `^0.11.0-next.0` para `^0.12.0-next.0` (alinha com npm dist-tag latest pós-T1.1).
- ee1b596: **Template default chat.ts: surface provider errors as AgentEvent `error`.**

  Pre-fix: `streamAgentRun(run)` could silently close SSE when SDK throws on
  invalid OPENROUTER_API_KEY / rate-limit / model-not-found / 5xx. Client saw
  a closed stream with no actionable message — stranger lost context.

  Post-fix: full agent lifecycle wrapped in try/catch + caught exceptions
  yield `{ type: 'error', message: ... }` AgentEvent. Dogfood chaos Phase 12
  (invalid-key) now PASSES end-to-end.

  Validated via `run-headless.sh` Phase 5 dogfood automation
  (`dogfood-fixes-and-coverage-expansion-plan.md` v1.1 Phase 5).

- ee1b596: **Template fix: `pnpm.onlyBuiltDependencies: ["esbuild"]` para destravar pnpm 11+ approve-builds gate.**

  Sem esse hint, `pnpm install` + `theokit dev` falham com `ERR_PNPM_IGNORED_BUILDS` em pnpm 11+ (security default: build scripts de transitivas como esbuild não rodam sem aprovação explícita). Como esbuild é dep transitiva mandatória do Vite, declaramos o opt-in nos 5 templates oficiais (default, dashboard, api-only, postgres, saas).

  Stranger executando `npx create-theokit my-app && cd my-app && pnpm install && pnpm dev` agora funciona end-to-end sem `pnpm approve-builds` interactive prompt.

- ee1b596: **Template SDK bump → `@theokit/sdk@^1.2.0` (D14 fault injection available).**

  New scaffolds get the SDK with `THEOKIT_TEST_RESPONSE_OVERRIDE` fault-injection seam built in. Documented in the SDK's `docs.md` § "Test fault injection (v1.22+)". Use in `dogfood-stranger` Phase 13 (rate-limit chaos) for zero-cost / zero-quota-burn deterministic 429 / 5xx / 401 scenarios.

  No theokit code changes — this is a template-side dep bump.

## 0.1.0-alpha.15

### Patch Changes

- **Template default chat.ts: surface provider errors as AgentEvent `error`.**

  Pre-fix: `streamAgentRun(run)` could silently close SSE when SDK throws on
  invalid OPENROUTER_API_KEY / rate-limit / model-not-found / 5xx. Client saw
  a closed stream with no actionable message — stranger lost context.

  Post-fix: full agent lifecycle wrapped in try/catch + caught exceptions
  yield `{ type: 'error', message: ... }` AgentEvent. Dogfood chaos Phase 12
  (invalid-key) now PASSES end-to-end.

  Validated via `run-headless.sh` Phase 5 dogfood automation
  (`dogfood-fixes-and-coverage-expansion-plan.md` v1.1 Phase 5).

## 0.1.0-alpha.14

### Patch Changes

- **theokit-evolution-ci-and-dx onda — CI gates + template DX + devtools observability.**

  This release ships 6 deliverables from the `theokit-evolution-ci-and-dx-plan.md` v1.1:

  **Templates dogfood primitives 0.5.0 (Phase 2B):**
  - `default` + `dashboard` ship `server/crons/cleanup-conversations.ts` (daily GC of stale `.theokit/agents/*` >30d)
  - `api-only` ships `server/routes/webhooks/echo.ts` (HMAC-SHA256 self-signed pattern)
  - `postgres` ships `server/jobs/log-message.ts` (defineJob enqueue pattern, ADR-0003 transactional outbox compliant)
  - `saas` ships `server/routes/billing/stripe-webhook.ts` (Stripe HMAC verify) + wires `trackAgentRun` in `server/routes/agent.ts`

  **README docs link (Phase 2A):**
  - All 5 templates ship `📚 Full docs: https://docs.theokit.dev` in header

  **Devtools `Agents` tab (Phase 3):**
  - New tab in devtools panel showing per-run telemetry: time, user, model, tokens in/out, cost USD, status
  - `dispatcher.onAgentRun(record)` wired from `trackAgentRun` in dev mode
  - Tree-shaken in prod via universal `__IS_DEV` IIFE guard (Vite OR tsup) — devtools-treeshake test stays GREEN
  - Ring buffer cap RING_BUFFER_CAP (50) for high-throughput resilience
  - Reducer: `AGENT_RUN_ADD` + `RESET_AGENT_RUNS` actions

  **Internals:**
  - `AgentRunRecord` type + `CHANNEL_AGENT_RUN` channel in `devtools/shared.ts`
  - `trackAgentRun` extended with optional `status` field (default 'finished')

  No breaking changes; all wiring is additive + opt-in via dev mode.

## 0.1.0-alpha.13

### Patch Changes

- **Template fix: `pnpm.onlyBuiltDependencies: ["esbuild"]` para destravar pnpm 11+ approve-builds gate.**

  Sem esse hint, `pnpm install` + `theokit dev` falham com `ERR_PNPM_IGNORED_BUILDS` em pnpm 11+ (security default: build scripts de transitivas como esbuild não rodam sem aprovação explícita). Como esbuild é dep transitiva mandatória do Vite, declaramos o opt-in nos 5 templates oficiais (default, dashboard, api-only, postgres, saas).

  Stranger executando `npx create-theokit my-app && cd my-app && pnpm install && pnpm dev` agora funciona end-to-end sem `pnpm approve-builds` interactive prompt.

## 0.1.0-alpha.12

### Patch Changes

- **Template SDK bump → `@theokit/sdk@^1.2.0` (D14 fault injection available).**

  New scaffolds get the SDK with `THEOKIT_TEST_RESPONSE_OVERRIDE` fault-injection seam built in. Documented in the SDK's `docs.md` § "Test fault injection (v1.22+)". Use in `dogfood-stranger` Phase 13 (rate-limit chaos) for zero-cost / zero-quota-burn deterministic 429 / 5xx / 401 scenarios.

  No theokit code changes — this is a template-side dep bump.

## 0.1.0-alpha.11

### Patch Changes

- **FAANG-grade provider routing — Strategy + Registry pattern.**

  Provider resolution moved from per-template conditionals into a centralized Strategy + Registry inside `theokit/server`. Consumers (template `chat.ts`, fixtures) now ship **zero conditionals on provider** — the framework resolves `apiKey` + `baseUrl` automatically from the highest-priority env var present (`OPENROUTER_API_KEY` > `OPENAI_API_KEY` > `ANTHROPIC_API_KEY`).

  Inspired by Dapr Conversation Registry (`dapr/pkg/components/conversation/registry.go`) and Encore Manager provider array (`encore/runtimes/go/pubsub/manager_internal.go`).

  **New public API in `theokit/server`:**
  - `resolveProvider(): ResolvedProvider` — throws actionable error if no env var present
  - `tryResolveProvider(): ResolvedProvider | null` — graceful degradation
  - `registerProvider(descriptor: ProviderDescriptor): void` — runtime extension point (idempotent by name)
  - `resetProviderRegistry(): void` — test-only / dev escape hatch
  - `listProviders(): readonly ProviderDescriptor[]` — sorted by priority

  **`createConversationHistory` upgrade:** auto-injects `apiKey` + `providers.routes[0]` (capability=chat) into SDK options when consumer omits `options.apiKey`. Explicit `options.apiKey` always wins (escape hatch preserved).

  **Template `chat.ts` is now FAANG-clean** — pure `model: { id: 'gpt-4o-mini' }`, no `process.env.*` reads, no provider conditionals, no manual error yields.

  **Wire protocol:** OpenAI Chat Completions (universal — every provider implements it). Anthropic uses native Messages API behind the same Strategy abstraction.

## 0.1.0-alpha.10

### Patch Changes

- Fix template default chat.ts: adiciona `providers: { routes: [{ capability: 'chat', provider: 'openrouter' }] }` quando OPENROUTER_API_KEY presente. Sem isso, SDK inferia provider do prefixo do model id (`openai/gpt-4o-mini` → tentava OpenAI direto, exigindo `OPENAI_API_KEY`). Stranger agora pode usar APENAS OPENROUTER_API_KEY e tudo roteia corretamente.

## 0.1.0-alpha.9

### Patch Changes

- Fix template default chat.ts modelId: substituído `openrouter/anthropic/claude-3.5-sonnet` (model ID inválido — OpenRouter rejeita 400) por `openai/gpt-4o-mini` (cheap, always-available, empíricamente testado 2026-05-28). Resolve falha "openrouter API error: unknown (HTTP 404)" em stranger Phase 7 real LLM test.

## 0.1.0-alpha.7

### Patch Changes

- Bump `@theokit/ui` pin em templates de `^0.11.0-next.0` para `^0.12.0-next.0` (alinha com npm dist-tag latest pós-T1.1).

## 0.1.0-alpha.6

### Minor Changes

- **Templates DX overhaul + scaffold SDK wiring (fix EC-S2/S3/S6 do dogfood-stranger run 2026-05-28)**
  - **`create-theokit` templates** (default/dashboard/api-only/postgres/saas):
    - Scripts completos: `dev` + `build` + `start` + `typecheck` declarados em todos
    - `.nvmrc` com `22.12` em todos
    - `public/favicon.ico` em todos (resolve 404 cosmético EC-S8)
    - `drizzle-kit` em devDeps de postgres + saas (EC-10 SHOULD TEST)
  - **`theokit` framework** (theokit/packages/theo):
    - `vite-plugin/theoui-detect.ts` refatorado: substituído `createRequire(...).resolve()` por filesystem walk + leitura de `package.json:exports[subpath]`. **Resolve EC-S4 root cause** (Page não hidratava) — Chrome MCP confirmou `<main>`, `<header>`, `<textarea>` agora renderizam.
    - `vite-plugin/auto-detect.ts` refatorado: mesma técnica filesystem walk (eliminação de `createRequire`).
    - D13 invariant gated por `tests/integration/no-require-on-esm-only-deps.test.ts` (2 BDD it()) — previne regressão de require em `@theokit/ui` (ESM-only by design).
    - Playwright spec `tests/e2e/scaffold-page-hydrates.spec.ts` (4 BDD it()) — required CI check para hydration regression.

  ADRs:
  - [`theokit/docs/adr/0021-dogfood-stranger-coverage-expansion.md`](docs/adr/0021-dogfood-stranger-coverage-expansion.md) — D4-D14
  - [`theokit/docs/adr/0022-create-theokit-republish-with-sdk-wired.md`](docs/adr/0022-create-theokit-republish-with-sdk-wired.md) — D2/D3/D10

  Plan: [`.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md`](../../.claude/knowledge-base/plans/dogfood-fixes-and-coverage-expansion-plan.md) v1.1 FAANG-grade.

## 0.1.0-alpha.4

### Patch Changes

- Hotfix: default template now declares `react-router` and `zod` (theokit peer dependencies). Without these, `pnpm dev` failed immediately on a freshly scaffolded project — entry-client couldn't resolve `react-router`, and `server/routes/chat.ts` couldn't resolve `zod`. Found by running `pnpm dlx create-theokit my-app` end-to-end against the published packages. Regression test added in `tests/unit/scaffold-default-agent.test.ts` to keep peer deps locked to the template.

  Also bumps the template's `theokit` pin to `^0.1.0-alpha.4` so freshly scaffolded projects pick up this hotfix.

## 0.1.0-alpha.3

### Minor Changes

- TheoUI default integration — `npx create-theokit my-app` now scaffolds a working agent surface out of the box.

  **`theokit`** (`0.1.0-alpha.2`)
  - `defineAgentEndpoint({ handler })` (`theokit/server`) — sugar over `defineRoute` that turns an `async *handler(): AsyncGenerator<AgentEvent>` into a Server-Sent Events response. Standards-compliant `text/event-stream` framing; respects `request.signal` for prompt cancellation; emits a final `{ type: 'error', message }` event when the generator throws.
  - `useAgentStream(path, options?)` (`theokit/client`) — React hook returning `{ events, status, send, abort, reset }`. Transport is `fetch + ReadableStream` (not `EventSource` — POST + body required). Cleans up on unmount (StrictMode-safe).
  - `consumeAgentStream(path, options)` + `parseSSEChunk(line)` (`theokit/client`) — the pure primitive the hook glues, exposed for non-React consumers and for tests.
  - Runtime `AgentEvent` discriminated union (`message | tool_call | tool_result | error`) exported from `theokit/server` and `theokit/client`. Server emits, client consumes — no cross-package type coupling with `@theokit/ui`.
  - Auto-injection of `@theokit/ui` in the dev/build pipeline: when the user's project declares `@theokit/ui` as a dependency and the package resolves, the Vite plugin emits `import '@theokit/ui/styles.css'`, `import '@theokit/ui/fonts.css'` (or `fonts-cdn.css` when configured), and wraps `RouterProvider` in `<TheoUIProvider theme={{ defaultTheme }}>`. New optional `ui` field in `theo.config.ts` (`false | { theme, fonts }`) for opt-out and theme selection. Conservative detection: package must be declared in `package.json` AND resolvable — prevents false positives in monorepos.

  **`create-theokit`** (`0.1.0-alpha.2`)
  - Default template now scaffolds an **agent surface**: `app/page.tsx` ships `AgentComposer` + `AgentTimeline` from `@theokit/ui`, `server/routes/chat.ts` is a mock SSE endpoint emitting three `AgentEvent`s. Replace the mock with your real LLM provider.
  - New `--bare` flag — skips the TheoUI defaults for users who want a minimal scaffold. Atomic rollback: if the bare transform fails for any reason (filesystem perms etc.), the entire target directory is removed so no half-scaffolded project is left behind. `--bare` is only valid with `--template=default`.
  - `@theokit/ui ^0.1.0-next.0` is now a direct dependency of the default template.

## [Unreleased]

### Changed

- License set to **Apache-2.0** (was unset in `package.json`). Aligns with Theo open-core pillars — see root `CLAUDE.md` strategic review of 2026-05-14.

## [0.1.0-alpha.0] - 2026-05-09

### Added

- `create-theo` CLI for scaffolding new Theo projects
- 3 templates: `default` (Hello Theo + health route), `dashboard` (nested layouts), `api-only` (API routes)
- `--template` flag for template selection
- Package manager detection (npm, pnpm, yarn, bun)
- Automatic dependency installation after scaffold
- Clear error messages for invalid project names and missing templates
