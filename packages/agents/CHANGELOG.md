# @theokit/agents

## 13.4.0

### Minor Changes

- 7a04f79: Resolve the memory root a subagent's `memory:` frontmatter promises

  `.claude/agent-memory/` was not a surface. Measured with controls: `agent-memory` returned 0 files in
  this package, and the 7 hits in `@theokit/sdk@5.5.0` are the internal module names
  `local-agent-memory*.ts` — the SDK's `MemorySettings` is a different feature, a vector store with
  embeddings. A subagent whose frontmatter said `memory: project` began every run with nothing while
  its own definition said otherwise.

  `resolveAgentMemory` resolves all three roots and reads `MEMORY.md` under the documented caps — 200
  lines and 25KB, both applied, with truncation REPORTED rather than silent.

  The three roots are decided together, because they differ in who can see the notes: `project` is
  committed and shared, `local` is kept out of version control, `user` crosses projects. An
  unrecognised scope is refused rather than defaulted — guessing `project` would publish, on the next
  commit, notes somebody wrote expecting privacy. A subagent name that would escape the root is refused
  for the same reason: the name comes from a file that arrives with the repository.

### Patch Changes

- 2e36483: Document which `.claude/` surfaces this package reads, and which it refuses

  The parity work landed across several releases and the README said nothing about any of it. A
  consumer had to read the source to learn that `agent-memory/` has three roots, that an unrecognised
  `memory:` scope is refused rather than defaulted, or that `workflows/*.js` is found and deliberately
  not executed.

  The table states each surface's state, and the `agent-memory/` section states the one thing a reader
  must not get wrong: the three roots differ in who can see the notes, so `local` never falls through
  to the committed root.

## 13.3.0

### Minor Changes

- b6e135e: Let a consumer read what the operator policy refuses

  `disableAllHooks` shipped in 13.2.0 working and unreadable. `OperatorPolicy` and
  `currentOperatorPolicy` were never exported, so nothing downstream could ask whether a policy was in
  force — a diagnostic could report `hooks: none` and never `hooks: refused by operator policy`, which
  is the ambiguity the switch exists to remove, restored one layer up in the type system.

  Found by auditing all 628 exported symbols against the built `.d.ts`, distinguishing DECLARED from
  merely MENTIONED: `OperatorPolicy` was declared in none of them, and `currentOperatorPolicy` appeared
  only inside a docblock, where a grep reads it as present.

  `OperatorPolicy`, `currentOperatorPolicy` and `mcpServerAdmitted` are now exported from
  `@theokit/agents/config`. Nothing about the policy's enforcement changes; what changes is that a
  consumer can see it and say so.

## 13.2.0

### Minor Changes

- af53600: Read the settings files the declared layers correspond to

  `SETTINGS_LAYERS` published a precedence stack — `user` 10, `project-shared` 20, `project-local` 30 —
  and opened no file. Measured with controls (`loadMcpJson` 5 files, an invented term 0):
  `settings.local.json` appeared once in this package, as a comment; `outputStyle` appeared zero times
  here and zero times in the SDK's built output.

  Three documented features were unreachable for that one reason. `settings.local.json` had a
  precedence and no reader. `outputStyle` had a loader — shipped in this same line of work — with no
  caller and no source for the name it takes. The session `env` had neither.

  `loadSettings` opens the three files, folds them through the existing `LayeredConfig` (rather than
  deriving a second answer to "which layer wins"), and reports which declared layers contributed
  nothing. `resolveOutputStyle` joins the two halves so the documented path works end to end: name a
  style in settings, get the style — and a named style with no file behind it still refuses, because
  returning nothing there would restore the silence this work removed.

  Unknown keys pass through untouched. The brief is the same mechanisms, not every configuration, and
  a reader that dropped what it did not recognise would silently discard an operator's settings.

- 88dd1ca: Translate a settings `permissions` block into rules the engine evaluates

  The SDK ships a real permission engine — `PermissionEngine(rules, { defaultAction })`,
  `PermissionRule`, `PermissionAction` — and it is a code surface: you construct it with rules. What
  was missing was the path from the FILE to those rules. Measured: `permissions` appears in 13 SDK
  files, and the SDK reads `settings.json` in three, of which two are sourcemaps and the third
  describes the hooks shape. An operator writing `{ "permissions": { "deny": ["Bash(curl:*)"] } }` got
  a file nothing translated.

  `permissionRulesFromSettings` renders `Tool` and `Tool(prefix:*)` / `Tool(exact)` into anchored
  rules, emitted deny-before-ask-before-allow because the engine is first-match-wins and an operator
  reading their own file top to bottom has no reason to expect an `allow` above a `deny` to win.

  Anything it cannot render faithfully — path globs, `~` expansion, per-tool argument names — is
  RETURNED as unsupported with a reason, never quietly turned into a matcher that almost fires. A
  `deny` an operator believes is in force and is not is strictly more dangerous than no rule, because
  without one they would have written the guard themselves.

- 6022a2a: An operator can refuse every hook a foreign configuration root declares

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

### Patch Changes

- c692b54: Report a malformed operator policy to every reader, not just whichever ran first

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

## 13.1.0

### Minor Changes

- 62f64de: `loadOutputStyle` reads `.claude/output-styles/*.md`, so a configured output style is no longer
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

- b3a61c3: An operator can declare `apiKeyHelper` — a command that prints a credential — in the operator policy,
  and `resolveOperatorApiKey` from `@theokit/agents/auth` runs it.

  Measured before (B-069): `apiKeyHelper`, `awsAuthRefresh`, `gcpAuthRefresh` and `otelHeadersHelper`
  all returned zero occurrences against a control of 31 on the word `hooks`. An agent holding a token
  that rotates failed mid-run, and the only answer was to restart the process with a fresh environment
  variable.

  It is an OPERATOR declaration, not a `defineAgent` argument, per the decision B-065 recorded: the
  person answerable for what runs on a machine is frequently not the person who wrote the code, and a
  command that mints a secret is the most operator-shaped thing in the system.

  Three refusals are part of the contract, each pinned by a test:

  - **A helper that hangs** is killed at 10 s (configurable) and fails with a typed error naming the
    command. A credential helper runs before every request that needs the key; "the agent is slow" is
    the hardest symptom to trace back to a line in a policy file.
  - **A helper that prints nothing** fails rather than returning `''`, which would surface later as a
    401 whose message says nothing about the helper.
  - **The output never reaches the error text.** A failure is read from logs, issue trackers and
    screenshots. `stderr` is not even named as a callback parameter.

  `runCredentialHelper` — which takes an arbitrary command string — is deliberately NOT exported.
  Offering it publicly would hand a caller the choice of what to execute, the exact decision the
  operator tier exists to take away from them.

  `awsAuthRefresh`, `gcpAuthRefresh` and `otelHeadersHelper` are still absent, and the module says so
  rather than leaving silence: the first two refresh an ambient cloud session instead of returning a
  value, and the third supplies headers for a telemetry exporter this layer does not own.

### Patch Changes

- 996538d: An `.mcp.json` field this runtime does not carry is now REPORTED instead of silently dropped.

  `buildEntry` assembled each server from a fixed set of keys and let everything else fall off the end
  in silence. Measured (B-071): `alwaysLoad` is declared by the reference format, allowlisted away
  here, and nothing said so. That is the shape B-032 closed for hooks — an author who writes a field
  and sees the server start has been told, by the absence of any complaint, that the setting took
  effect.

  The report is general rather than a special case for the one field somebody measured: naming only
  `alwaysLoad` would fix the instance and leave the class, and the format gains keys faster than this
  layer does. The server still starts — refusing an entry over an unknown key would turn a cosmetic
  mistake into an outage.

  `alwaysLoad` gets its reason named in the message: it marks a server whose tools load eagerly rather
  than through TOOL SEARCH, and tool search does not exist here, so there is nothing for "always" to be
  relative to. Honouring it would mean inventing a behaviour and shipping it under the format's name.

  Two absences are now stated in the module rather than left implicit:

  - **Tool search.** This runtime always sends every server's full tool list. The cost is context, not
    correctness — and it is why `alwaysLoad` is refused rather than accepted.
  - **The user-level `.mcp.json`.** Only the project file is read. A second location is a precedence
    decision, not a second `readFileSync` — which file wins per key, whether a user may add a server
    the project did not declare, how that composes with the operator gates that already decide which
    servers may start. It belongs in the named settings stack, not in a merge rule invented inside a
    loader.

- bdd160d: Report a `.claude/workflows/` directory instead of passing over it in silence

  A project that declares the `claude-code` dialect and ships workflow scripts now learns, on load,
  that they were found and not executed — with the reason and with the supported alternative. It was
  previously the one surface of the dialect that produced no message at all, so an author who watched
  rules, skills, subagents and commands load out of the same folder had no way to tell a broken
  workflow from a workflow nothing reads.

  The scripts are still not executed, deliberately. Every configuration surface this package loads is
  data; a workflow file is code, and executing JavaScript found under a caller-supplied directory is a
  trust decision that belongs to the consumer rather than to a library. The orchestration itself is
  unaffected — `Workflow`, `agentStep` and `createSquad` from `@theokit/sdk` build the same pipeline
  from an import the consumer writes.

- a50c6af: `AgentBuilder.plugins()` and `defineAgent({ plugins })` accept all three plugin kinds the SDK
  defines, not just one.

  `CodePlugin` required `register`, so it admitted `kind: "general"` and refused `kind:
"model-provider"` (which carries `profile`) and `kind: "memory"` (which carries `createProvider`).
  The docblock on `AgentBuilder.plugins`, written in the same change, already described the parameter
  as taking "a model provider / memory adapter (`kind: 'general' | 'model-provider' | 'memory'`)" — so
  the prose promised three kinds while the type admitted one.

  Found by a real consumer rather than by a gate. On `@theokit/agents@13.0.0`, TheoCode's build stopped
  with `Property 'register' is missing in type 'BasePlugin & { kind: "model-provider"; profile:
ProviderProfile }'`. Nothing in this package caught it: 1 799 tests, `tsc`, eslint, knip and CodeQL
  were all green over a type that refused two thirds of its own contract.

  What the guard is FOR is unchanged: the Claude Code filesystem-bundle form (`{ type, path, source,
marketplace }`) is still refused with a message naming where a bundle belongs. An object carrying a
  `name` and none of the three capability keys is still refused too — widening to three kinds must not
  widen to "anything with a name", which would let the bundle form back in through the front door.

- e0813b5: Say at `DelegateOptions.cwd` that a worktree gets no gitignored files

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

## 13.0.0

### Minor Changes

- c59abf6: A foreign configuration root can be imported in part

  `resolveCompatSources` returned the bare literal `'claude-code'`, which the SDK reads as "import
  every surface" — hooks, plugins, skills, subagents. `settingSources.claudeCode.import` now names the
  surfaces, and the resolved value carries them.

  The distinction is the reason the grant exists: `.claude/` usually arrives with the clone and its
  `hooks.json` executes shell, so "take the skills, refuse the hooks" is the ordinary thing to want,
  and the only choices were all of it or none of it.

  Absent `import` still means the whole root, so nothing existing changes. An EMPTY list is refused
  rather than guessed: "no surfaces" and "unset, so all of them" are both defensible readings of `[]`,
  they differ by whether shell executes, and picking one would settle a security question by
  convention.

  `CompatSurface` and `ResolvedCompatSource` are declared here rather than imported from the SDK, for
  the reason already recorded beside the literal: they do not exist in `@theokit/sdk@4.52.1`, this
  package's declared floor.

  Closes usetheokit/theokit#686.

- ca44ee7: A narrowed foreign root can name `commands`

  `settingSources.claudeCode.import` narrows the foreign root to named surfaces, and `CompatSurface`
  listed four of them — `hooks`, `plugins`, `skills`, `subagents`. It fed a fifth: this package loads
  `<projectDir>/.claude/commands/*.md` itself, outside the SDK's `compatSources` path. The name was
  missing from the vocabulary, so a consumer could neither ask for that directory nor be told it had
  gone unread, and `loadCustomCommands` tested `sources.includes('claude-code')` — string equality
  against a union whose narrowed member is an object, so every narrowed list read as _not declared_.

  `CompatSurface` now includes `'commands'`, and the loader understands both shapes: the bare source
  name grants every surface the root feeds, the narrowed form grants the ones it names.

  Purely additive — before this, no narrowed list reached the directory at all, so nothing that works
  today stops working. A narrowed list that wants foreign commands adds `'commands'` to `import`.

  An enumeration used to narrow a root must cover every surface that root feeds; otherwise it is not
  a narrowing but an undeclared drop. Reported as usetheokit/theokit#704, found by measuring a claim
  in a consumer's adoption report rather than by any test here — the fifth time a gap in this
  package's public surface was invisible from inside it.

- dcb461f: `.plugins()` refuses a filesystem-bundle entry instead of accepting and ignoring it, and its parameter says what belongs there.

  **BREAKING:** `plugins` was `readonly unknown[]` and is now `readonly CodePlugin[]`. Anything that
  already passed `{ name, register }` objects is unaffected.

  The word `plugins` appears in both vocabularies and means different things. This layer's are CODE
  objects registered with the runtime's lifecycle seam; the Claude Code format's are filesystem
  BUNDLES. A consumer who read the other product's documentation passed
  `[{ type: 'local', path: './p' }]`, the compiler accepted it because the parameter was `unknown[]`,
  and the agent ran with the plugin absent — **the typecheck that should have caught it was what let it
  through**.

  **The survey's "not implemented on either side" was too strong, and the correction matters for the
  error message.** A bundle _directory_ is discovered: `pluginBundleDirs` reads `.claude/plugins/*` and
  `.theokit/plugins/*`, and the `skills/` and `agents/` subdirectories of each are loaded. What is
  absent is the manifest (`.claude-plugin/plugin.json`), marketplaces, and the format's other
  contributions — hooks, MCP servers, output styles, LSP servers.

  So a path-shaped entry is not refused because bundles are unsupported. It is refused because this
  _parameter_ is not how a bundle is declared, and the message says where one goes and what a bundle
  does and does not contribute. A refusal that does not name where the capability lives sends the
  reader to a changelog.

  The check runs at the projection, the single point every authoring path converges on. Putting it on
  the builder method would miss `defineAgent({ plugins })` and the capability — which is how the shape
  reached the runtime unexamined in the first place.

  A plain wrong value gets a different message from a bundle reference: a string is not a bundle, and
  pointing its author at a `plugins/` directory would send them somewhere that cannot help.

- 6b07960: New `grantGate(store, classify)` in `@theokit/agents/auth` — the supported way to put a
  `PermissionStore` in force.

  The store shipped with a careful grant key, a "deny by default, always" docblock and no reader.
  Measured: `isGranted` had zero callers outside its own unit test, and `PermissionStore` appeared in
  zero files across six sibling repositories. An operator reading `.theokit/tool-permissions.json` to
  learn what an agent may run was reading a control that was not in force — a grant and its revocation
  produced identical behaviour.

  `grantGate` adapts the store to `pre_tool_call`, which is documented as the only hook with veto
  power and runs before the tool by construction, so a refusal is a refusal before the side effect. No
  new gate and no framework wiring: nothing is enforced unless a consumer attaches the handler, and an
  agent that does not is unaffected.

  `classify` returns `{ governed: true, query }` **or** `{ governed: false }` — a tagged union whose
  BOTH arms carry the discriminant. A bare `undefined` would say "this tool needs no permission" and
  "I forgot this tool" in the same word, and on a security gate the second must not silently pass.

  The discriminant is on both arms because the first shape — discriminated by whether a `governed` KEY
  was present — **failed open**: a consumer writing a policy record `{ governed: true, scope }` and
  spreading it into the query got the tool waved through, and so did `governed: undefined`. TypeScript
  does not stop that; excess properties pass freely through a variable or a spread. Fail-closed is now
  measured across `true` / `undefined` / `false` / `null`, and only `false` passes.

  Named `grantGate`, not `permissionGate`, because `@theokit/sdk` already exports `PermissionGate`,
  `PermissionGateContext`, `PermissionGateDecision`, `PermissionEngine` and `PermissionPlugin`. The
  rename also says something true: this gates on a standing grant the operator made, and the SDK's
  permission engine is a separate system — neither satisfies the other.

  A classifier that throws DENIES, naming the throw, rather than ending the turn. A corrupt store
  denies with a message that says so — "the permission store could not be read, so no grant applies" —
  distinct from "no standing grant matches", so an operator can tell the two apart.

  The read error's own text is deliberately NOT in that message: the veto travels to the model, and
  `lastReadError.message` carries the absolute store path and its file mode. It stays on
  `store.lastReadError` for the operator, which is where the actionable remedy (`chmod 600 …`) lives.
  The scope IS still interpolated, so this narrows the exposure rather than eliminating it.

  **Composing with a `pre_tool_call` you already have**: the field is singular, so assigning the gate
  over an existing handler loses one of the two silently. Compose explicitly —
  `async (ctx) => (await gate(ctx)) ?? (await mine(ctx))`; first veto wins.

  `PermissionStore`'s docblock now states that the class enforces nothing on its own, and records the
  precedence among the surfaces IN THIS PACKAGE that can refuse a tool — saying plainly that the list
  is not exhaustive, because `@theokit/sdk` has its own permission system that neither knows about
  these nor is known by them.

- a7e35bb: A guardrail returning `action: 'redact'` with no replacement `text` now throws
  `MalformedGuardrailResultError` instead of silently redacting nothing.

  `GuardrailResult.text` is optional, so such a guard compiles and reads like a working one. The
  pipeline tested `r.text !== undefined` and moved on, so the caller received the original text and
  believed a guard had run on it — the operator believing a protection is in place when none is.

  **This is a behaviour change.** A guard relying on the previous no-op will now throw. That is
  deliberate: the alternative is unredacted output reaching a model because a guard was written wrong.
  `text: ''` is unaffected and always was a real redaction — a guard choosing to erase everything.

  `MalformedGuardrailResultError` is exported from `@theokit/agents`, carries the guard's name and the
  phase, and is not retryable.

  This also reaches the streaming path (`moderateOutputStream`), which shares the same pipeline: a
  malformed guard there now throws where it previously continued.

- dcb461f: `blockAppliesTo(block, filePath)` is exported from `@theokit/agents/config`.

  `InstructionBlock.scopes` carries the `paths:` frontmatter, and the package shipped no way to apply
  it — no glob matcher existed anywhere in the tree. A consumer who wanted to honour a scope had to
  invent the semantics, and two consumers would invent two.

  The field's own docblock names the consequence of getting it wrong: "A consumer rendering the block
  would then apply a rule written for one subtree EVERYWHERE — the one frontmatter failure with a
  consequence, and a silent one."

  Delegating the **decision** to the product is deliberate and unchanged: a consumer still chooses
  whether to filter. What changes is that it now has the **means**.

  `scopesUnreadable` answers `false` for every path. That is the fail-closed half the flag was invented
  for — a `paths:` key that was declared and yielded nothing must not read as "no scope declared",
  because those two are indistinguishable in `scopes` alone and only one of them is safe to publish
  everywhere.

  **Supported:** `**` (crosses separators), `*` (does not), `?` (one character) — the three the SDK's
  own rule activation implements. **Not supported:** brace expansion `{a,b}` and character classes
  `[abc]`, which match literally and therefore almost certainly not at all. That floor is deliberate:
  three wildcards are a dozen lines, and a glob dependency would carry a transitive tree into a package
  with three direct dependencies. Needing the fuller grammar is a decision to make out loud.

- dcb461f: A shared session store can be declared through the authoring surface. Serverless and multi-pod were unreachable without it.

  The SDK takes `local.sessionStore` — a Postgres / Redis / KV / durable-object store used as the
  primary session store and resume source, for deployments where the filesystem is ephemeral or the
  next request lands on a different host. Measured: `sessionStore` returned 0 files in this layer.

  This layer's stated doctrine, repeated across roughly eight docblocks, is that a consumer should not
  import `@theokit/sdk` directly. With no authoring surface for the store, the only way to reach it was
  to do exactly that — so **the doctrine and the capability disagreed, and the consumer paid**.

  `SessionStoreCapability` writes the field and `assembleM8CreateOptions` projects it. `SessionStore`
  crosses the barrel with it: forwarding a capability whose type cannot be named does not close the
  gap, and the item says so.

  The block is written only when a store was declared. An unconditional write creates `local` for every
  agent — a claim about setting sources and a cwd that no author made. The first version of the control
  asserted only `local?.sessionStore`, which passes for the unconditional write too since the key lands
  as `undefined` either way; it asserts the block now.

  Two existing gates fired on this change and were right both times: the compile-time waist-field
  exhaustiveness check demanded the new field be classified, and the derived coverage test demanded the
  capability join the "everything switched on" fixture. Neither needed to be found by review.

- 5211721: `moderateOutputStream` now delivers the redacted text to the client instead of computing it and
  replaying the original events.

  It called `runOutputGuards` and discarded the return value, so a guard that redacted correctly had
  its work thrown away: measured against the built artifact, a guard returning `[REDACTED]` delivered
  `sk-abc123`. Only `block` reached the client honestly.

  **Signature change**: `moderateOutputStream` takes a fourth argument,
  `rebuildText: (text: string, replaced: E) => E`, which builds one event carrying the
  moderated text, given the text-carrying event it replaces. It is required rather than optional —
  optional would let the function compute a redaction it cannot apply, which is the defect being
  removed. Only the caller knows how to construct its own events.

  **`extractText` MUST match exactly one event kind.** When it matches several, they COLLAPSE INTO
  ONE — measured: `[thinking('CoT: the key is sk-abc'), message(' Here you go.')]` yields a single
  `message` reading `"CoT: the key is [R] Here you go."`, with no `thinking` event surviving. A
  consumer who wants reasoning moderated runs a SECOND pass over that kind rather than widening one
  extractor.

  `replaced` does not prevent that collapse, and an earlier draft of this entry said it did. What it
  buys is narrower: the surviving event keeps the KIND and metadata of the text-carrying event it
  replaces, instead of being rebuilt from the text alone. `replaced` is ALWAYS the event being replaced.
  It was typed `E | undefined` for a case that cannot happen — a stream where no event carried text
  returns from the absence check before the guards run, so `rebuildText` is not reached at all. It is
  also never a non-text event, because a caller spreading one would emit a duplicate of it.

  **Second signature change**: a fifth argument, `rebuildResult: (text, result) => R`, applies the
  moderated text to the generator's RETURN value. A stream has two channels and the first release of
  this fix moderated one: the events were redacted while `step.value` — the aggregate `run()` returns
  — still carried the original text. Measured: the guard computed `"the key is [R]"` and
  `run().response` was `"the key is sk-abc123"`, so **`run()`, the primary non-streaming API, kept
  delivering the secret**. That was this fix's own defect one channel over. Required for the same
  reason `rebuildText` is; passed rather than re-derived, because re-running the guards on the
  aggregate would apply a non-idempotent guard twice.

  When the text is unchanged, the buffered events are replayed verbatim as before. When it changed,
  the **last** text-carrying event is REPLACED by a newly built event carrying the whole moderated
  string, and the earlier text events are dropped. Events carrying no text are never dropped. Note
  "replaced", not "modified": any non-text payload the surviving event carried is lost, as is that of
  the dropped ones — a consumer whose text events carry per-event metadata should moderate one kind
  only, or rebuild from `replaced`. An event whose extracted text is the EMPTY STRING is still
  text-carrying and can be the one replaced.

  **Known consequence:** when text events straddle a non-text event, their relative order does not
  survive a redaction. Given `text('tok ') , tool_call , text('sk-abc')` the client now receives
  `tool_call , text('tok [R]')` — text that preceded the tool call follows it. Landing on the last
  text-carrying event keeps a trailing terminator in place and keeps any completion claim after the
  work that produced it; what it cannot keep is the interleaving, because the redaction is about the
  whole string and the boundaries are gone by the time it exists. A test pins this so it is found
  here rather than in a transcript that stopped making sense.

  A guard that rewrites **unconditionally** — a disclaimer appender, a trim, an NFC normaliser —
  takes this path on every stream that DOES carry text. The cost is not proportional to how much the
  guard changed. It does NOT add a text event to a round that produced none — this entry claimed so,
  and the absence check refuses it: a tool-only round yields its tool call and nothing else.

- dcb461f: The served handle offers a schema-validated, tool-using run. The capability existed and the door did not.

  **The survey's conclusion did not survive measurement.** It said "structured output cannot be
  combined with tools", on evidence that `outputFormat`, `structuredOutput`, `outputSchema` and
  `responseFormat` returned 0 files here, and that `generateObject`'s options carry no `tools` field.
  Both facts are true; the conclusion is not.

  `generateObject` is the **toolless path by design** — it builds a transient agent whose only tool is
  the synthetic output tool. The tool-using path is `agent.generate(input, { output })`, which runs the
  agent's normal tool loop, the user's tools first, and then coerces the final answer into a Zod schema.
  It exists on the published SDK's agent.

  **The real gap was this layer's.** `SdkAgentHandle` — what is served to ACP, the delegation surfaces
  and the autonomous loop — declared `send` and `dispose` and not `generate`, so a consumer of
  `@theokit/agents` could reach it only by importing `@theokit/sdk` directly. Same shape as the session
  store: the capability existed, the door did not.

  It is optional on the interface, because a caller-injected handle (tests, a custom transport) need not
  implement it, and requiring it would break every such double to add a method most never call.

  **Both wrappers forward it**, and that is the half that actually breaks: `withStepCeiling` and
  `withGuardrails` each construct a new object, so every method they do not name disappears — the
  consumer meets the loss at runtime as "the handle has no `generate`", after the types said it had
  one. Each forward is pinned by its own mutation.

  `generate` is **not** put through the output guards, stated rather than assumed. It resolves to a
  validated object and those guards moderate text; running them over a serialised object would moderate
  a shape no guard was written against. Guarding the structured path needs its own decision about what
  a redaction means to a schema, and inventing one here would be the gate that reports without gating
  this module already refuses to build.

- dcb461f: A usage record can carry the cache split that justifies its cost, and usage can be narrowed by model.

  **Two of the item's three claims did not survive measurement, and the correction is the point.**

  The survey reported "cost is computed without cache-token accounting, so it is systematically wrong",
  on evidence that `cacheCreation`, `cache_read`, `modelUsage` and `total_cost_usd` returned 0 files.
  Those are the _wire_ spellings. The real field names are `cacheReadTokens` and `cacheWriteTokens`,
  carried in five files of this layer — `DoneEvent.usage` has had them since V4-O.

  Nothing in this layer _computes_ cost either: `costUsd` is supplied by the caller on the record, and
  the storage only sums what it is given.

  **What was genuinely missing is narrower and still worth closing.** `UsageRecord.tokens` was
  `{ input, output }`, so a record stated a cost it could not explain: cached reads are billed at a
  fraction of input tokens, and two runs with identical `input` totals and different cache ratios cost
  different amounts. The audit trail showed the figure and not the reason. `cacheRead` and `cacheWrite`
  are optional and **absent rather than `0`** when a provider does not report — "not reported" and
  "reported as zero" are different facts, and defaulting would claim a measurement nobody made.

  **The per-model breakdown was absent at the query surface**, not in the data: every record carries
  `model`, and `UsageQuery` had no way to ask. It is a query rather than a second shape on
  `UsageResult`, because a breakdown returned alongside a total is two numbers that can disagree; one
  source asked a different question cannot.

  One implementation note worth keeping. The model predicate first carried an explicit
  `kind === 'tool'` exclusion, and a mutation proved it dead: `getUsage` already drops tool records
  before summing, so inverting the condition left every assertion green. It was removed rather than
  kept — a conjunct that cannot change an answer reads as a second condition somebody needed, which is
  how a dead branch survives review.

- 1202e86: A failed injected command now aborts the expansion instead of building a prompt out of its own error message, and a fenced command block is refused instead of ignored.

  **BREAKING:** `expandCommandTemplate` used to promise it never throws. It now throws in exactly two
  cases, both of which produce NO prompt rather than a wrong one.

  **The failure path.** The spec is explicit — "A failed command aborts the entire skill invocation…
  Claude never sees the skill content for that invocation." What happened instead was substitution plus
  a warning: a command whose `gh pr diff` failed produced a prompt containing
  `fatal: not a git repository`, handed to a model that had been asked to review a diff, which answered
  as though that _were_ the diff.

  The previous behaviour was decided, and the reasoning it was decided against is worth keeping:
  substituting SILENCE renders as a command that ran and returned nothing, which the model cannot
  detect. That is correct, and it weighed the wrong two options. Substituting the ERROR is worse than
  silence, not better — `fatal:` reads as prose, while silence at least leaves a gap. The third option
  is the one the spec names, and the only one where the caller learns anything.

  **A missing `@file` is still a warning**, deliberately. The line is what the template CAUSED versus
  what it merely POINTED at: only the first can hand the model a plausible lie.

  **The fenced form.** A ` ```! ` block containing real commands came back byte-identical — the
  model received the command text as markdown, nothing ran, and nothing said so. It is now refused with
  a message naming the inline form, rather than implemented: "run a multi-line block" has real
  unanswered semantics (each line a command, or one script? which shell? what is the exit status of
  four lines?), and inventing them would ship behaviour under a name that promises the spec's. The
  detector is anchored to a line of its own, so an ordinary ` ```bash ` block is untouched.

  Callers that relied on best-effort expansion should catch `ConfigurationError` with code
  `command_template_segment_failed` or `command_template_fenced_block`.

- 1202e86: An operator can stop a skill body from running shell.

  A skill is a markdown file a repository can carry, and `` !`command` `` in its body executes at
  expansion time. Measured: `disableSkillShellExecution` returned 0 files here and 0 in the SDK dist,
  against a control of 31 on the word `hooks`. The only way to decline was to stop reading skills at
  all.

  **The switch lives inside the expander, and that inverts an invariant on purpose.** The module's rule
  was "never spawns anything and never opens a file — `shell` and `readFile` are injected, [because]
  the trust decision is the caller's, not this module's." That _reason_ is what the operator-tier
  decision overturned (README § "Who decides policy"): the caller decides everything the operator has
  not spoken about. Leaving the check to the caller would have made it a constructor argument again,
  which is the shape the decision replaced. The module still spawns nothing — it refuses _before_
  calling the injected `shell`, and that ordering is pinned by a mutation test.

  **This package reads the policy file itself**, rather than importing `@theokit/sdk`'s reader. It
  ships from a separate repository against a published SDK (`^4.52.1 || ^5.0.0`), so a symbol added to
  that package's source is not importable here until it is released — and a control that only works
  after somebody else cuts a release is a control nobody can reach. One FORMAT (Claude Code's path and
  key names) is the contract; two readers that release independently is a consequence of the repository
  boundary, stated rather than hidden.

  **What this does not pretend:** `expandCommandTemplate` has zero production callers, measured across
  `theokit`, `theokit-sdk`, `theokit-tui`, `theokit-studio` and `theokit-hub`. The hazard has no live
  path today. Enforcing at a call site that does not exist would have been the unreachable-control
  failure; enforcing here means the switch bites the moment a caller appears rather than being
  remembered then.

  A value the reader cannot understand — `"disableSkillShellExecution": "true"`, a string — is reported
  and ignored, never coerced. Accepting it by truthiness would make `"false"` forbid shell too.

- 1202e86: An operator can decide which MCP servers from a project `.mcp.json` may start. Nothing decided before.

  Measured: `allowedMcpServers`, `deniedMcpServers`, `allowManagedMcpServersOnly`,
  `enabledMcpjsonServers`, `disabledMcpjsonServers` and `enableAllProjectMcpServers` all returned 0
  files, against a control of 31 on the word `hooks`, while `loadMcpJson` does read `<cwd>/.mcp.json`.

  **The loader shipped and the gate did not, which is worse than having neither** — a consumer who
  wanted the convenience of the file inherited the exposure without being offered the control.

  **The default is now decided rather than inherited.** It stays "every declared server starts",
  because the file is the project's own declaration and refusing it outright would break every existing
  consumer to protect against something they wrote themselves. What changed is that an operator can
  narrow it: `deniedMcpServers` removes named servers, and `allowedMcpServers` — once present — makes
  the list exhaustive. An absent allow list means "no allow list", not "allow nothing"; an empty array
  is a real decision and refuses everything.

  **Deny wins over allow.** A server named in both is a contradiction, and the safe reading of a
  contradiction is the restrictive one — resolving it the other way would let an allow entry re-enable
  something an operator explicitly refused.

  A refused server is **named** in the warning channel, like every other refusal in this loader: a
  server that silently does not start is indistinguishable from one that started and has no tools.

  One trust vocabulary, not two. This composes with the same `managed-settings.json` the hook and
  skill-shell controls read, with the same "the project cannot switch it off" precedence and the same
  report-never-carry rule. `TrustPosture` is unchanged and stays what it is — the gate over whether a
  directory's config is read at all; this is the gate over which servers inside an admitted file may
  start.

  A list value of the wrong shape — `"deniedMcpServers": "postgres"` — is reported and ignored.
  Coercing a bare string would make every character a server name; ignoring it silently would leave the
  organisation believing a server is blocked.

- 98b2565: `resolveSettingSources` now returns `readonly GatedSettingSource[]`, and
  `CompiledAgentOptions.settingSources` takes that type — so a setting root no `TrustPosture`
  authorised no longer fits the field.

  `define-agent.ts` claimed that field "can only ever hold roots that some posture authorized".
  Measured against the emitted `.d.ts`: `setOnce(draft, 'settingSources', ['mdm','team','user','plugins'], 'cap')`
  typechecked **cast-free**. Writing a `Capability` is the documented way to extend the builder, and a
  capability writes the draft directly — so the gate was reachable around, for `project`, the root it
  exists to protect.

  A brand rather than a runtime check, because the obvious runtime check does not work: reading
  `draft.provenance` to refuse a capability's write would also refuse the LEGITIMATE builder path,
  which writes through `setOnce` too. What differs is where the value came from, and that is what a
  brand carries.

  **It refuses the accident, not the determined caller** — `as never` defeats it, like every brand.
  Saying so is the point: the comment it replaces claimed an invariant nothing enforced.

  **New: `settingSources.plugins`**, taking the same `ProjectSettingsGrant` as `project`.
  `PluginsManager.refresh` loads executable bundles from the same cwd-controlled tree, usually
  arriving with the clone, so it gets the same gate and not a weaker one. This is the root the SDK
  genuinely reads and the facade withheld.

  `team` and `mdm` stay absent, and that is the item's original premise dying under measurement: the
  SDK never reads them — `includesSetting` is called with exactly `"project"` and `"plugins"` — so
  forwarding them would be a capability in the type and nothing at runtime.

  **Migration**: a consumer constructing `CompiledAgentOptions` by hand must build roots through
  `resolveSettingSources` instead of a string array. That is the supported construction and always was.

  **Also: a narrowed `claudeCode.import` is now REFUSED on an SDK that cannot read it.**

  That field's docblock said the narrowed form was "refused at resolve time" below `@theokit/sdk`
  5.4.0. Nothing read a version for it — the only checks in this layer are the hook gate (a different
  option) and a `compatSources` warning that returns silently for any major ≥ 5. So on
  5.0.0 ≤ SDK < 5.4.0, inside this package's declared `^4.52.1 || ^5.0.0`, a narrowed `import` was
  forwarded, dropped by the runtime in silence, and the foreign root was **not read at all** — a
  consumer asking for "the skills but not the hooks" got nothing, which is further from what they
  asked for than the un-narrowed form. `compatSources` landed in 5.0.0 and the narrowing in 5.4.0;
  treating the two versions as one was the defect.

  `CompatImportUnsupportedError` now refuses, naming both versions and what would otherwise happen.
  It refuses rather than warns because a silent nothing is discovered by wondering why a skill is
  missing. An unreadable version is refused too: "cannot tell" and "is supported" must not collapse.

  **And `commands` is subtracted before the compat sources reach the SDK.** The two vocabularies
  diverge by one name on purpose — `.claude/commands/*.md` is read by this package and never by the
  SDK — and `setting-sources-gate.ts` prescribed the subtraction as advice to consumers while the
  projection that needed it did not do it. Measured: `import: ['commands']` forwarded a list
  containing zero names the SDK defines, which is its own empty-list case — the exact ambiguity
  `resolveCompatSources` refuses one layer up. A source whose surfaces all belong to this layer
  is now dropped from the SDK's list rather than sent empty.

  `CompatImportUnsupportedError` is exported from `@theokit/agents/bridge`, so a consumer can catch the
  refusal by class rather than by matching its message.

- 59d6dcc: A transcript nobody can read is listed without an id, and keeps its protection

  `listSessions` fell back to the filename stem whenever the first record could not be read. Under
  `@theokit/sdk` 5.x that stem is a one-way hash of the id, so the fallback did not return a degraded
  id — it returned an identifier belonging to no session. Session GC keyed protection on it, so a
  session someone had DECLARED protected lost its protection and was planned for deletion, while the
  registry removal was called with the hash and left the real entry behind.

  Protection now runs in the direction that has a function. `transcriptPath(root, cwd, id)` is total on
  both majors and its inverse is not, so protection is keyed by transcript PATH and caller-supplied ids
  are mapped forward onto paths. Whether a transcript can be read stops mattering to whether it is
  protected.

  Breaking, inside the unreleased 13.0.0 line:

  - `SessionSummary.id` is `string | undefined`, alongside a new `idSource: 'transcript' | 'unavailable'`.
    It is never derived from the filename.
  - **`protectedTranscripts` is RENAMED to `protectedTranscriptPaths`, and the rename is the fix.** Its
    keys changed from session ids to transcript paths while the signature stayed `Map<string, string>`,
    so a consumer that mapped the keys forward through `transcriptPath` — correct when they were ids —
    kept compiling and started double-mapping, leaving its protection array matching nothing. Measured
    on a real consumer against this build: `deleteSession` collected a session holding a LIVE writer
    lease. The old name is gone rather than aliased; a silent break that loses data is worse than a
    loud one, and an alias would have preserved the silence. `transcriptOf(id, cwd, root)` maps forward
    for callers that hold an id.
  - `GCCandidate.id`, `GCKept.id` and `GCError.id` admit `undefined` for the same reason.
  - `RunTranscriptGCResult` gains `orphaned` — transcripts collected whose session id could not be
    read, by path. A separate list rather than a second meaning inside `removed`, which answers "which
    sessions did I collect"; `theo sessions gc` reports both, and never prints a filename where an id
    belongs.

  Closes usetheokit/theokit#668.

- feb5781: `AgentBuilder.create().hookApproval()` — the fluent twin of `defineAgent({ hookApproval })`

  `13.0.0-next.7` shipped the hook approval gate reachable through `defineAgent` and capabilities, and
  not through the fluent builder. A consumer that authors with `AgentBuilder.create()` had no way to
  reach it: `.use()` composes presets rather than sinking capabilities, and the definition reaches
  `streamAgentTurnInProcess` with `local` already assembled, so there was no downstream place to inject
  `local.hooks` by hand either.

  Fifth instance of one family and a NEW variant. The first four were "the symbol exists and the barrel
  omits it", which the emitted-export guard now catches. This one is the opposite: the symbol is
  exported, on the compiled waist, and reachable through one authoring door — the other door simply
  does not offer it, and an export check is green on that.

  So the guard for this variant builds the SAME agent through BOTH doors and asserts they arrive at the
  same compiled waist. It catches the worst case too: an interface that declares the method while the
  factory never wires it compiles, does nothing, and fails this test.

- e7a4d65: **A declared `.claude/` now reaches commands too** (theocode B-152).

  `loadCustomCommands` takes `compatSources`, in the SDK's own vocabulary: `['claude-code']` adds
  `<projectDir>/.claude/commands/` to what it reads.

  Three surfaces already reached that directory when a consumer declared it — hooks, skills and
  subagents, through the SDK's `compatSources`. Commands are loaded by this package instead, and were
  the one surface that never learned about it. Measured against a real TUI: the same command file was
  invocable under `.theokit/commands/` and silent under `.claude/commands/`, with no diagnostic
  anywhere. A partial dialect is worse than none — whoever watched the other three work has no reason
  to suspect the fourth.

  **The trust gate does not move.** The foreign directory is read only when the caller declared it
  AND the project is trusted, which is the same pair `resolveCompatSources` already requires. A
  command is a prompt that runs on the operator's behalf, and this one usually arrives with the
  repository, written for another product. An untrusted project now COUNTS the foreign commands it
  refused, so the refusal is not silent either.

  **The native root wins a name collision**, and the two frontmatter vocabularies stay separate: this
  loader reads `description:` and nothing else, so the other product's `model` and `argument-hint`
  are carried in the body rather than adopted.

- fe8a0c6: **`compatSources` reaches the SDK, and says so when the installed SDK cannot hear it** (#634).

  `@theokit/sdk` stopped reading `<cwd>/.claude/` unconditionally (`theokit-sdk#524`) and put it
  behind `local.compatSources`. This layer had no way to forward that, so an agent built here could
  not opt into the foreign dialect at all.

  The issue held the work back for a real reason: forwarding an option an older SDK does not know
  would be **silently inert** — the operator declares it, nothing reads `.claude/`, and no message
  explains why. The silence turns out to be removable from this side. `@theokit/sdk` declares
  `"./package.json"` in `exports` — verified on **4.52.1**, the oldest version a consumer can have
  today, not only on the 5.x prerelease — so the installed version is readable at runtime and a
  mismatch warns once per process. The floor stays `^4.52.1`; nobody is pinned to a prerelease.

  Declaring the dialect goes through `settingSources`, next to the roots it already gates:

  ```ts
  settingSources: {
    project: { trustedBy: posture },
    claudeCode: { trustedBy: posture },   // reads <cwd>/.claude/
  }
  ```

  **Two questions, answered by two different halves of that field**, because the SDK's own docblock
  separates them: _declaring_ the field answers "do I want another product's configuration imported?"
  (omitting is not enabling), and the `TrustPosture` inside answers "do I trust this directory's code
  to run?". The grant is `ProjectSettingsGrant` — the same type `project` takes — not because the
  questions are the same, but because a separate `'foreignDialects'` capability could not carry the
  distinction: `TrustPosture.allows` is `Record<K, boolean>` whose values all move with the trust
  level, so a second name would promise an operator a choice `resolveTrustPosture` never gives them.

  This is deliberately **stricter than the SDK**, where listing a dialect is sufficient: `.claude/`
  holds a `hooks.json` that executes shell, in a directory that usually arrived with the clone.

- 2bc5d84: `delegate()` now applies the guardrails its spec declares. It accepted them and never consulted them.

  Measured against the built artifact with a guard declaring both halves: the input reached the model
  with its injection intact and the caller received `sk-abc123`. `bridge/agent-orchestrator.ts`
  contained **zero** occurrences of `guardrail` — control on the same sweep: `loop/agent-runner.ts`
  has 9 — and called `runReflectiveLoop` bare. The operator had declared guardrails and the run was
  green.

  This is the same defect class as the streamed-redaction fix in this release, on a sibling public
  API, and it is model-reachable: `tools/delegate-tool.ts` wraps `delegate()`, so an agent can invoke
  a sub-agent whose declared guards do nothing.

  `checkInput` runs after `onDelegationStart` and `checkOutput` after `onDelegationComplete` — each
  moderating what actually crosses the boundary rather than a string a hook may then rewrite. A
  blocking input guard throws before the model is called at all, so a refused delegation costs
  nothing.

  `response` only. `toolCalls[].output` is tool output rather than model text, and `agent-runner.ts`
  excludes it from `extractText` on the same reasoning; the docblock says so, because leaving it alone
  should be a decision somebody reads rather than an omission somebody discovers.

  A spec declaring no guardrails behaves byte-identically.

  **A guardrail block now crosses the delegate tool as a refusal, not a crash.** `errorCodeOf` mapped
  only the three delegation errors, so `GuardrailViolationError` — reachable from `delegate()` for the
  first time because of this change — hit the "not a delegation outcome, a defect" arm and was
  rethrown, ending the parent's turn. The tool's own description, shipped to the model, promises
  `{ ok: false, error, message }` on a refusal.

  It crosses as `guardrail_violation` with a FIXED message: `the delegated task was refused by a
policy guard`. The message travels only for codes on an explicit ALLOWLIST — a budget or a timeout
  is a fact about the work, and the number in it is what the model acts on. A code nobody lists
  withholds, so forgetting is safe in the direction that matters. A guardrail message is not — it reads
  `Guardrail "pii-detector" blocked output: ssn found`, naming the guard and its exact trigger, and a
  model given that learns which words to avoid rather than that it should stop. The operator keeps the
  full typed error, which carries `guardName`, `phase` and `reason`.

- dcb461f: A declared `canUseTool` gate reaches the runtime, so a tool call the earlier steps did not resolve has somebody to ask.

  Measured: `canUseTool` returned 0 files in this layer, against controls of `hooks` 31 and `session` 37. The SDK has the seam — a permission plugin invoked on an `ask` verdict — and this layer offered
  no way to reach it.

  **The default was never the problem, and saying so matters.** The SDK's engine is fail-closed: an
  unmatched call resolves to `ask`, and an _absent_ gate blocks it. A tool added after the approvals
  were written already defaulted to asking. What was missing is that the ask reached nobody, so it
  resolved to a refusal with no way to decide otherwise.

  `CanUseToolCapability` writes the gate and the adapter projects it as a permission plugin over an
  engine with **no rules** — so every call resolves to `ask` and every call reaches the gate. That is
  what "sees every tool call the earlier steps did not resolve" means when there are no earlier steps.
  A consumer who also wants rules composes them through the SDK directly; accepting both here would
  mean inventing a precedence between a rule set and a gate that nobody stated.

  The plugin is **appended**, never replacing: a consumer that already registers lifecycle plugins must
  not have them dropped by declaring a gate. And only when a gate was declared — installing an empty
  permission plugin would gate every `ask` verdict on a callback that does not exist, which the SDK
  resolves by blocking. That is strictly worse than the absence it would replace.

  **`updatedInput` is decided upstream, not by silence here.** The spec lets a gate _correct_ a call,
  and the SDK states its position: the `pre_tool_call` seam is veto-only, and arg rewrite is
  intentionally unsupported. Surfacing a gate that accepted an `updatedInput` this runtime would
  discard is the fabricated mechanism this backlog keeps finding; the narrower contract is carried as
  it is.

- 019f828: Output guards now moderate `thinking` events, not only `text_delta`.

  `AgentRunner` handed `moderateOutputStream` an extractor matching `text_delta` and nothing else,
  while `thinking` is a public `AgentStreamEvent` that reaches the client like any other. Measured: a
  guard declared over the agent's output delivered `thinking "the key is sk-abc123"` verbatim.

  **This closes one channel and does not close all of them.** `DoneEvent.result` carries the model's
  whole answer and is still unmoderated — measured on the same turn, `text_delta` came out
  `"here: [R]"` while `done.result` came out `"here: sk-abc123"`. `task_progress.text` is a fourth and
  reaches the web wire. A third pass does not extend to them: there is one `done` per round, so a pass
  keyed on it would collapse every round's into one, and they need a different mechanism. Tracked
  separately; stated here because a security note that overstates its coverage is worse than one that
  does not exist.

  The third channel of a shape fixed twice already in this release — a streamed redaction that was
  computed and discarded, and `delegate()` consulting no guards at all.

  **Two passes, not one wider extractor.** Widening `extractText` to match both kinds is the obvious
  move and the wrong one: two kinds under one extractor COLLAPSE into a single event, so the reasoning
  would be promoted into a visible one — the moderation creating the disclosure it exists to close.
  Composing two passes is what `moderateOutputStream`'s own docblock prescribes, and each pass seeing
  one kind is what keeps them apart.

  The visible pass owns the aggregate: `DelegationResult.response` accumulates from `text_delta`
  upstream, so the reasoning pass passes the result through rather than replacing it.

  A blocking guard on either channel still throws before any event is emitted. An agent with no output
  guard is byte-identical.

- 6ca2f50: Names the settings precedence stack: `SettingsLayer`, `SETTINGS_LAYERS`, `layerPrecedence` and
  `settingsLayerChain` in `@theokit/agents/config`.

  The SDK ships the mechanism — `foldLayers` folds `{ layer, precedence?, values }` and
  `verifyLayerOrdering` refuses a self-contradicting chain — and deliberately not the vocabulary:
  `DeclaredLayer.layer` is a free-form string and `precedence` is optional. That is the right shape
  for a library, and it left one thing undecided that two consumers must agree on: which layers exist
  and in what order. Each could invent their own names and numbers, fold in opposite orders, and both
  pass `verifyLayerOrdering`, because a chain is only ever checked against itself.

  The order is the format's, measured against <https://code.claude.com/docs/en/settings>: managed
  settings, command line, project local, shared project, user. `code` — what `defineAgent()` was
  passed — sits below all five, because every file above it is editable by a human who did not write
  the code and is answerable for what the agent does on their machine. That single line is the whole
  operator tier, and it reconciles the three levels B-026 named for four policy keys with the full
  stack instead of leaving them beside it.

  A layer added to the union without a declared position now fails to COMPILE, the same gate this
  package puts on the compiled-options waist.

- a7f4d3d: `deleteSession` stops reporting a registry removal it cannot confirm

  `registryRemoved` was computed as `outcome !== false`, so a remover that resolved saying **nothing**
  was reported as a removal. That is the shape `Agent.delete` has — `Promise<void>` — and below
  `@theokit/sdk@5.3.1` it is what a no-op returns: measured in `4.52.1`, `removeRegisteredAgent`
  mutates an in-memory map and schedules a save only when the entry was in it, while `delete` — unlike
  `list` — never hydrates from disk. In any freshly started process the entry is not in memory, so the
  call resolves having left `registry.json` untouched and throws nothing.

  Breaking, inside the unreleased 13.0.0 line:

  - `DeleteSessionResult.registryRemoved: boolean` is replaced by
    `registryOutcome: 'removed' | 'nothing-to-remove' | 'unconfirmed' | 'failed' | 'not-attempted'`.
    Renamed rather than retyped: `if (result.registryRemoved)` would have kept compiling while
    silently changing which branch it took.
  - `SessionInUseError.registryRemoved` becomes `registryOutcome`, and the refusal no longer advertises
    "the registry entry was already removed" for a half it cannot confirm — it tells the caller to
    verify instead.

  `not-attempted` and `unconfirmed` are distinct on purpose: "nobody asked" and "we asked and got
  silence" lead a caller to opposite actions, and the old boolean said `false` to both.

  The declared SDK range is unchanged. `5.3.1` fixes the behaviour and not the signature — `delete`
  still returns `Promise<void>` — so `unconfirmed` remains the honest answer on every admitted version,
  and raising the floor is a separate decision that would make the removal happen without making it
  reportable.

  Closes usetheokit/theokit#675.

- 0ed0d96: Telemetry is reachable from the authoring surface: `defineAgent({ telemetry })`,
  `AgentBuilder.create().telemetry(...)`, and `TelemetryCapability` all forward the SDK's
  `TelemetrySettings` to `Agent.create({ telemetry })`, so a run emits OpenTelemetry spans for
  `agent.send`, `llm.call`, `tool.call` and `memory.search`.

  The SDK has emitted these spans since 4.52.1 — with an exporter selector, a service name, and
  auto-detection of Langfuse / Sentry / PostHog. This layer never passed the field through, so an
  operator could not turn any of it on and had no way to see a run as a trace alongside the rest of
  their system. Measured before the change: four occurrences of the word "telemetry" in the package
  source, all four in prose, zero assignments.

  `@opentelemetry/api` is an OPTIONAL peer of the SDK. Without it, telemetry is a silent no-op even
  with `enabled: true` — which is the usual explanation for a run that reports no spans, rather than a
  misconfigured collector. Content (prompts, responses, tool args) is omitted unless you set
  `includeContent: true`.

- 462bb62: The pre-spawn hook approval gate crosses the layer, or refuses to pretend it did

  `@theokit/sdk@5.4.0` added `local.hooks.approve` — a consumer's decision point before the runtime
  spawns a hook. This layer never forwarded it, so a hook declared in a config root, including a
  foreign dialect imported through `compatSources`, ran shell without passing the consumer's approval.

  Measured in a consumer against 5.4.0, with a control arm proving the zero was not an empty turn:

  ```
  control_nothing             fires=0  tool_ran=yes
  claude_project_unapproved   fires=1  tool_ran=yes
  ```

  `defineAgent({ hookApproval })` and the new `HookApprovalCapability` now carry it to
  `Agent.create({ local: { hooks } })`. Named `hookApproval` rather than `hooks` because
  `defineAgent({ hooks })` is already the LIFECYCLE seam, and two security-relevant things under one
  name is how a consumer configures the wrong one.

  **Declaring it against an SDK older than 5.4.0 is REFUSED, not forwarded.** The option is 5.4.0-only
  while this package's floor is `^4.52.1`, so a pass-through would compile and do nothing on most
  admitted versions — a gate that silently does not gate, which is worse than offering none, because
  whoever configured it stops looking. An unreadable SDK version is refused for the same reason:
  "cannot tell" and "is gated" must not collapse.

  The floor is unchanged, so no consumer is pinned to a newer SDK for a feature they did not ask for.

  Closes usetheokit/theokit#686 (the `hooks` half; `resolveCompatSources` widening is tracked there).

- ecda4ae: The agent-module parameter names what it accepts, so a wrong shape fails at compile time

  `streamAgentTurnInProcess` and `compileAgentModule` took `mod: unknown`, so the contract lived only
  in the runtime guard. A consumer whose producer became `async` handed a `Promise` straight through
  and shipped two releases in which no turn could run — with typecheck, 1213 tests, lint and twelve CI
  checks green. The runtime was never wrong: it refused the Promise and threw a typed error. What
  failed was the moment.

  Both now take `AgentModule`, exported alongside them and re-exported from `theokit/server/agent`.
  The type mirrors the runtime guard rather than the fuller `CompiledAgentOptions` — an array under
  `tools`, an object under `agents` — so it refuses nothing that compiled before.

  `@theokit/tauri/sidecar`'s `runTurnToJsonl` is narrowed too: a desktop sidecar imports its agent
  module statically, which is exactly where a type catches the mistake.

  Entry points that receive a module from a path discovered at runtime keep taking `unknown`, and now
  say so by calling the new `compileLoadedAgentModule`. Their `unknown` has a reason; before this, the
  boundary that had one was indistinguishable from the one that did not.

  Closes usetheokit/theokit#663.

- cfe7f4c: **`@theokit/sdk@5.x` is now supported, alongside 4.x**
  ([#654](https://github.com/usetheokit/theokit/issues/654)).

  The declared range becomes `^4.52.1 || ^5.0.0` (`^4.49.0 || ^5.0.0` for `@theokit/presenter`), and
  the full suite passes on both halves: 7533 tests against `4.52.1` and 7533 against `5.0.1`.

  This unblocks plugins whose open-ended `@theokit/sdk` peer resolves to 5.x. Until now `theokit` was
  the package that **refused** that resolution — the ERESOLVE named the plugin, but the bound that
  could not be satisfied was this one.

  **What had to change, and why it was not a version bump.** SDK 5.x writes a transcript to
  `${sessionUuidFor(sessionId)}.jsonl` where 4.x wrote `${safeSessionId(sessionId)}.jsonl` — a
  SHA-256 over a namespace, so the filename stopped being the session id and the mapping does not
  invert. `listSessions` derived ids from filenames, so listing, protection, GC and deletion all
  returned UUIDs where callers passed ids. One defect, twenty-nine failing tests.

  The id is now read from the transcript **record**, which the SDK writes on both majors and which is
  authoritative where the name was only a convention. The filename stem remains the fallback, so a
  truncated transcript still appears in a listing rather than dropping out of GC's sight.

  `LiveTranscriptError` — 5.x's new name for `LiveSessionError` — deliberately does not cross the
  `@theokit/agents` layer: it does not exist on the 4.x half, and 5.x keeps the old name working and
  deprecated, so the name that crosses is the one both majors have.

- 0731584: `resolveCompatSources` now returns `readonly GatedCompatSource[]`, and
  `CompiledAgentOptions.compatSources` takes that type — so a compat source no `TrustPosture`
  authorised no longer fits the field.

  **BREAKING for hand-built compiled options**, exactly as its sibling was. Build compat sources
  through `resolveCompatSources`.

  The twin of the `settingSources` brand, and it exists because that fix closed one of the two fields
  one `SettingSourcesSelection` feeds and left the other bare. Measured, with the `settingSources`
  route as the control: the control errored, and `setOnce(draft, 'compatSources', ['claude-code'],
'cap')` compiled cast-free — while `agent-compiler.ts` told the reader that field "can only hold a
  source some posture granted".

  It carries more authority than its twin, not less. `applyLocalSources` forwards it to
  `Agent.create({ local: { compatSources } })`, which reads `<cwd>/.claude/` — `hooks.json` included,
  and that executes shell.

  **Signature narrowing**: `moderateOutputStream`'s `rebuildText` is now
  `(text: string, replaced: E) => E`. It was typed `E | undefined` for a case that cannot happen — a
  stream where no event carried text returns from the absence check before the guards run, so
  `rebuildText` is never reached. The branch handling that case was dead code, and three shipping
  artifacts described it as live.

  **Fixed**: `isPort` discriminated on the presence of `run`, so an object carrying both `compiled`
  and a `run` — reachable through a spread, which is how targets are built in practice — took the port
  branch and skipped `delegate()` entirely: no declared guardrails, no inherited parent veto, no
  budget clamp. A tie now goes to the spec, because the spec branch is the guarded one.

### Patch Changes

- 1202e86: A backslash escapes a `$N` placeholder: `\$1` now renders as the literal `$1` with the backslash
  dropped, instead of being substituted with the first argument.

  Measured before the fix: `price \$1.00 here` with argument `alpha` produced `price \alpha.00 here`.
  A template describing a price produced a template describing an argument, and the backslash the
  author typed to prevent that survived into the output as stray punctuation.

  **Two neighbouring behaviours are deliberately unchanged**, because a parity survey flagged all three
  together and only one of them is a defect:

  - `$1` is the FIRST argument here. That convention is stated in the module docblock, fixed by its
    existing tests, and depended on by its own `` !`git diff $1` `` example. Changing it would silently
    rebind every argument of every command already written — a compatibility decision, not a fix.
  - An unmatched `$3` expands to empty rather than to the literal, which the call site documents:
    "Empty, never the literal. A leaked `$3` reads to the model as text the user wrote."

  The escape was the one of the three with no decision behind it.

- bb0f451: A guardrail refusal thrown inside a round is no longer renamed into a delegation failure.

  `runReflectiveLoop` wrapped any error that was not already a delegation error into
  `DelegationError`, whose message reads `Delegation to agent "X" failed: ${cause.message}`. That code
  is on the delegate tool's message allowlist — a delegation failure's text is a fact about the work —
  so the wrapper carried the guard's own words to the model: `Guardrail "pii-detector" blocked output:
ssn found`, naming the guard and its exact trigger.

  Measured through `createDelegateTool` with a consumer-supplied `streamFactory` that throws
  mid-round. `streamFactory` is a public option, so this was reachable rather than theoretical.

  `GuardrailViolationError` now passes through as itself, alongside the two delegation errors that
  already did, so the tool classifies it `guardrail_violation` and withholds the message.

  Fixed by classification rather than by suppressing text downstream: a guard refusal is not a
  delegation failure, and a layer that renames an error cannot be expected to maintain a list of what
  the new name must hide.

- 9725bf1: A malformed guardrail result no longer hands the model the name of the guard that failed, and a third guardrail error class is covered by construction.

  B-015 made `GuardrailViolationError` pass through `run-reflective-loop.ts` unwrapped, because
  `DelegationError` interpolates its cause and `delegation_failed` is on the delegate tool's message
  allowlist. Its sibling in the same file was not added. `MalformedGuardrailResultError` takes the same
  wrapping, and its message also names the guard: `Guardrail "X" returned action 'redact' for output
with no replacement text.`

  Smaller payload than a violation — the guard's name and phase, not its trigger text — and the same
  leak through the same allowlist. It additionally **mislabelled a guard defect as a delegation
  failure**, which is a fact about the work the model would act on.

  **The passthrough is now structural.** `GuardrailError` is the abstract base every guardrail error
  shares, and `run-reflective-loop.ts` and `errorCodeOf` both key on it — so a new class is covered by
  its own declaration rather than by someone remembering to extend a list of two. A list of two is how
  this defect existed.

  A base alone is not airtight: a class can still extend `TheokitAgentError` directly. The test walks
  the guardrails barrel and fails on any exported error class that skipped the base. The two together
  are the construction; either alone is a convention.

  A malformed result crosses as `guardrail_error`, not `guardrail_violation`: a guard that is written
  wrong did not refuse anything, and telling the model it was refused would be wrong in the other
  direction. Neither code is on the message allowlist, so both withhold. `CostBudgetExceededError` now
  descends from the same base and crosses as a refusal instead of being rethrown as a defect.

- dcb461f: A hook's `matcher: "*"` now fires on every tool, as the format defines it.

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

- 9725bf1: An agent served over HTTP or the terminal now applies its declared guardrails. It applied none of them.

  `streamAgentUIMessages` called `createSdkAgentStream` directly on both of its branches. Guardrails
  were applied in exactly two other places — `AgentRunner.stream()` and `withGuardrails`, the latter
  reached only from `toAgentFactory` — and neither is on this path. Measured:
  `grep -c guardrail agent-endpoint.ts` → 0, against 23 files in `packages/agents/src`.

  Its reachable callers are the HTTP mount, the terminal runner and the streamer builder: every surface
  a deployed agent is actually reached through. So a `defineAgent({ guardrails: [...] })` served to a
  browser ran no input guard, applied no `redact`, and a `block` never threw.

  This is the same shape as three defects already closed in this release, one layer up. B-014 and B-018
  measured _channels_ inside a stream that was already being moderated; this is the surface where the
  moderation never started.

  **The composition is copied from `AgentRunner.stream()`, not reinvented** — two passes over the two
  text-carrying kinds, visible inner and reasoning outer. NOT one wider extractor: two kinds under one
  `extractText` collapse into a single event, so the model's private reasoning would be promoted into
  the visible answer, and the moderation would create the disclosure it exists to close. That mutation
  survived the first version of the test, which asserted over the flattened stream where every word is
  still present; the assertions are per channel now.

  Moderation runs on the wire chunks rather than upstream events, because the translator sits between
  them — moderating upstream and letting the translator re-derive text would moderate one channel and
  deliver another. `done.result` and `task_progress.text` remain uncovered here, exactly as in
  `AgentRunner`: there is one `done` per round, so a pass keyed on it would collapse every round's into
  one. They need a different mechanism and are tracked separately.

  An agent that declared no guardrail takes an untouched pass-through — wrapping unconditionally would
  buffer every served stream to enforce an empty list.

- ac29eff: A permission-gate veto now emits a debug line.

  `grantGate` refused and emitted nothing — no log, no counter, no debug line. An operator could
  observe the refusal only through the tool result the model received, and the two causes the veto
  message distinguishes ("no standing grant matches" versus "the permission store could not be read,
  so no grant applies") are indistinguishable from there.

  That is pillar 3 of the wiring triad missing on a refusal seam. `bridge/approval-posture.ts`, the
  sibling gate, already logged through this exact seam.

  The QUERY is logged — tool, scope, and which of the two causes fired — and the grant is not: a query
  names what an operator needs to diagnose, while the store's contents are the thing being protected.
  A classifier that threw logs as its own event rather than as an ordinary veto, so a consumer-code
  defect is not read as a denied tool.

- 1202e86: An inline `` !`command` `` is now recognised only at a boundary: the start of a line, or after
  whitespace. When `!` follows another character the placeholder stays literal and the command does
  not run, which is what the contract specifies.

  `REFERENCE_REGEX` applied its leading-boundary guard `(?<!\S)` to the `@file` branch only, so the
  shell branch matched anywhere. Measured before the fix: `` inline !`echo hi` and KEY=!`echo boom` ``
  produced `inline <ran:echo hi> and KEY=<ran:echo boom>` — both ran.

  This was the one place this module did **more** than its contract allows. Every other divergence
  found in the same survey is something that fails to happen; this was something that happened, from a
  markdown file loaded out of a working directory.

  The test keeps three positive cases beside the negative one — a change that stopped recognising
  inline commands altogether would satisfy the negative and destroy the feature.

- 1202e86: `${VAR}` in a `.mcp.json` `env` or `headers` block now resolves against the host environment.

  `.mcp.json` is committed to the repository, so a named reference is the specification's only way to
  keep a credential out of it. Nothing expanded the placeholder, and the shape check accepts it as a
  perfectly valid string — so the entry validated, the server started, and it authenticated with the
  literal text `${API_KEY}`. The failure surfaced as a remote auth error with no path back to the
  config line.

  An unset reference is **reported and left as written**. Substituting empty would start the server
  with a blank credential and fail somewhere further away; dropping the key would look like the author
  never wrote it.

  The environment is injected (`loadMcpJson(cwd, { env })`, defaulting to `process.env`), matching how
  the rest of the package reads env — so a test proves the expansion without mutating the process it
  runs in.

  **This does not loosen the posture this loader already takes.** `buildEntry` refuses `envPolicy`
  deliberately: "A file committed to the repository is no place to loosen a process-level defence."
  That refusal is about a committed file handing a server the _whole_ environment. A named reference
  resolves _one_ variable the host already chose to set — and refusing to expand it protects nothing,
  since it pushes the author to paste the literal secret into the file instead.

- 1202e86: The two permission vocabularies meet, and the mirrored `permissionMode` field says what it mirrors.

  Measured: `permissionMode` appeared in exactly one file, as a mirrored field nothing branches on;
  `dontAsk`, `autoMode`, `useAutoModeDuringPlan` and `classifyAllShell` all returned 0 files. This
  layer offers `suggest | auto-edit | full-auto` — the values a real consumer put in front of users —
  while the runtime resolves `default | plan | acceptEdits | bypass`. A reader of either had no way to
  the other.

  `approvalModeToPermissionMode` translates them. `suggest` maps to `default`, **not** to something
  that asks unconditionally: `default` means the rules decide and an unmatched call asks, so mapping it
  otherwise would discard every allow rule the operator shipped. `full-auto` maps to `bypass`, which
  allows everything **except an explicit deny** — mapping the most permissive local mode onto something
  that also cleared denies would turn a UI convenience into a policy override.

  The signature takes `ApprovalMode`, so a fourth local mode is a compile error rather than a silent
  fallthrough to a posture nobody chose.

  **`plan` has no local counterpart, deliberately.** It is an explore-only posture an _operator_
  imposes, not something this surface offers, and inventing a fourth local name would put a decision
  that belongs to the operator into the user's mode picker. The absence is named rather than filled.

  `PermissionGate`'s mirrored field is now the SDK's own `PermissionMode` instead of a bare `string`. A
  mirror that accepts any word mirrors nothing in particular — `"readonly"`, what somebody writes when
  they mean `plan`, would have sat there looking applied. Restating the union by hand was the first
  attempt and the package's own type test refused it: the shape must fit `PreToolCallContext`
  structurally, and a copy that drifts by one member stops fitting. Importing the source makes it a
  mirror by construction.

  Unchanged, and still the documented decision: the gate ignores the mode. `bypass` does not disable
  it, because a standing grant is the operator's and not the run's.

- 9725bf1: A text event whose `content` is not a string is refused instead of delivered unexamined.

  Both extractors tested `typeof e.content === 'string'` and returned `undefined` otherwise.
  `moderateOutputStream` reads `undefined` as "this event carries no text", so the payload was never
  accumulated, never shown to a guard, and yielded **verbatim**.

  The failure direction is DELIVER, not block: a guard declared to stop that payload silently never saw
  it, and the run reported green. Reachable in practice — `StreamEvent` is
  `{ type: string; [key: string]: unknown }`, `event-translator.ts` casts an unvalidated provider
  content block to `{ text?: string }`, and a consumer-supplied `streamFactory` is a public option.

  **Two different questions had been collapsed into one answer.** "Not this event kind" and "this kind,
  content unreadable" both returned `undefined`, and they need opposite handling. The new
  `textPayloadExtractor` keeps `undefined` for the first and throws `UnreadableTextPayloadError` for
  the second.

  **Refused, not coerced.** Coercing would moderate `"[object Object]"` — a guard consulted about a
  string the model never produced, returning a verdict about nothing, while the real payload rides
  along underneath. That is the redaction-computed-and-discarded shape with an extra step.

  One implementation, used by both seams. The defect existed as two hand-written copies of the same
  predicate in `AgentRunner.stream()` and the served endpoint; fixing one and leaving the other is the
  half-fix this release keeps finding.

  Only runs that declared an output guard can meet the error: `moderateOutputStream` is a transparent
  pass-through when no guard defines `checkOutput`, so the extractor is never consulted otherwise.

- 2bc27d3: `inheritHooks` no longer lets a member's `transform_tool_result` or `pre_user_send` handler replace
  its parent's — both now chain parent-first, matching the six events that already composed.

  `inheritHooks` documents its security property as "the parent's refusal is evaluated first, and a
  member can only ever ADD a reason to refuse". For these two events the plain object spread did the
  opposite: a member declaring either handler silently discarded the parent's. The reachable surface is the EXPORTED `inheritHooks`, called with two handler maps.
  `delegate()` passes `undefined` for the member (`agent-orchestrator.ts:175`), so that path composed
  nothing and was never affected — a distinction the first version of this note got wrong.

  `pre_user_send` composes additively — both contributions reach the model, parent first — because
  `PreUserSendResult` carries only `recalledContext` and the seam exposes no prompt mutation.

- dcb461f: Thirteen types named in exported signatures now cross a barrel, and the guard that finds them derives the requirement instead of listing it.

  `bridge/index.ts` enumerates this shape four times by issue number — #663, #668, #675, #686 — and
  B-004 was the fifth. Each was found by _installing_ the published package, because the source is
  correct every time: the type is exported from its own module and only the barrel omits it.

  The guard that followed reads the emitted barrel, which was the right move, and it is a **hand-written
  list** — so it catches the entries somebody remembered to add. B-004 was added to it _after_ a review
  found the miss, which is precisely what the list existed to prevent.

  **This one derives it.** It parses every built `.d.ts`, collects the names each chunk imports and uses
  in an exported signature, and flags any that no public barrel re-exports. Measured on the built
  output: thirteen, including `BudgetTracker`, `InlineSkill`, `PluginsSettings`, `SkillsOptions`,
  `ContextWindowOptions`, `Plugin`, `ProviderRoutingSettings`, `RetryOptions`,
  `DiscoverSubagentsOptions`, and four reached through subpath entries.

  Two things the first version of the guard got wrong are worth recording, because both produced a
  green over nothing:

  - **A rollup does not put `export` on its declarations.** It emits them bare and lists every public
    name in one `export { … }` clause at the end. A single forward pass keyed on the `export` modifier
    visited zero exported declarations and reported no problem — while `index.d.ts` imported
    `PluginsSettings` on line 1, used it in a signature on line 359, and did not carry it in the clause
    on line 1445. It takes two passes.
  - **Reachable means every barrel a consumer can import from**, not just the root. A type exported from
    `auth.d.ts` is nameable through `@theokit/agents/auth`; the hashed internal chunks are not
    importable at all, so what they export is not reachable and what they import is still a finding.

  The guard caught one of the changes made in this same release — `PermissionMode`, added to
  `PermissionGate` hours earlier — which is the difference between a list and a derivation.

- eaac7b0: The "will NOT fire" warning for a declared-but-unwired hook event now names where the capability
  already lives, instead of ending "the handler does not exist yet".

  Two of the three unwired events are served today by purpose-built seams — `Guardrail.checkOutput`
  for `transform_llm_output`, and `createToolHooksPlugin({ processInput })` for `pre_user_send` — so
  the old message told consumers to wait for work that will not come. The third, `on_session_end`, is
  named as genuinely uncovered, with the reason: its handler returns `void` and cannot refuse an
  ending, so wiring it would produce a hook that runs and cannot decide.

  Nothing is wired. `HOOK_EVENTS`, `WIRED_EVENTS` and `OBSERVATIONAL_EVENTS` keep the same members.

- 1202e86: `$ARGUMENTS` works, and the substitutions this module does and does not perform are written down.

  The template understood `$1`, `$2`, … and nothing else. A command that wanted everything the user
  typed had to guess how many positions to concatenate, and stopped being correct at the first
  invocation that passed one more. Measured: `$ARGUMENTS` returned 0 hits against a control of 31.

  It expands to the **raw** string, not the split tokens rejoined. Splitting strips the quotes that
  decided the grouping — `"two words" solo` is two arguments and five words — so rejoining would hand
  the model `two words solo` and lose the only mark saying which three belonged together. A placeholder
  whose whole job is "what the user typed" must not quietly retype it. The backslash escape works the
  same way `$N`'s does.

  **`templateHints` no longer asks for escaped placeholders.** `\$1` is prose about a placeholder, not
  a request for one, and listing it asked the user to supply an argument the template would never
  substitute. It also broke the sort outright: the match carries the backslash, so `slice(1)` produced
  `"$1"`, `Number` produced `NaN`, and a comparator returning `NaN` leaves the order unspecified.
  `$ARGUMENTS` sorts first — reading it after `$3` suggests it is a fourth position.

  A table above the regex now states the supported set where an author will meet it, including two
  deliberate absences: `${CLAUDE_SKILL_DIR}` belongs to a skill body rather than a command template
  (and is substituted by `@theokit/sdk`'s `skill_read`, the only place that knows which directory the
  skill came from), and `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` are **out of scope rather
  than pending** — the plugin format is not implemented on either side, so substituting a root for a
  plugin that cannot be loaded would have to invent the layout it points into.

- ec899f4: An observational hook handler is now assigned to its own key rather than chosen by comparison.

  The dispatch loop used a two-branch conditional over a list of two event names, so a third
  observational event would have landed on `post_assistant_reply` — silently, with no test objecting.
  No behaviour changes for the events wired today; the fix removes the trap for the next one added.

- dcb461f: `@Checkpoint` says, at the name, that it is run-state checkpointing and not file undo.

  Two different things share the word and only one of them exists here. What this package has is
  run-state checkpointing — enough to resume a conversation. What it does not have is file
  checkpointing: snapshot and restore of the files an agent edited, the thing an interactive coding
  agent needs to offer an undo.

  Measured: `rewindFiles`, `rewind_files`, `restoreFile` and `backup` returned 0 files here, 0 in the
  SDK `.d.ts` and 0 in `@theokit/sdk-tools`, while `checkpoint` returned six — all of them run state.

  **The harm is not the missing feature, it is the collision.** Any parity checklist that greps for
  `checkpoint` is satisfied by the wrong one and reports a capability that does not exist. A consumer
  reads the checklist, believes undo is available, and finds out when a user asks for it.

  The absence is stated **at the colliding name**, which is the only place a grep will reach, and a
  test pins both the statement and the reason it matters — a docblock nothing checks is a docblock that
  gets tidied away. It fails if a file-restore surface ever appears under the run-state name without
  the statement being updated with it.

  Not implemented here, and the reason is stated rather than implied: there is no pre-write seam on the
  edit tools to hang snapshot and restore on, which makes it a feature with its own design questions
  rather than a wiring job. Half-building it under a name that already means something else would make
  the collision worse.

- e4f2e78: Documents that `sandbox` here is not the Claude Code CLI's `sandbox.*` settings block, at the door a
  reader of the local vocabulary meets (`@theokit/agents/sandbox`) and in a new measured surface note,
  `docs/surfaces/sandbox-vocabulary.md`.

  They share an enforcement mechanism — bubblewrap and seccomp on Linux — and differ in what they
  expose above it. This package offers an execution BACKEND (`SandboxBackend`, `LocalSandbox` /
  `LinuxSandbox`) whose policy is three modes and four `SandboxConfig` fields. The CLI's is a SETTINGS
  POLICY of 38 keys spanning per-path filesystem rules, a network allowlist with proxies and TLS
  termination, and per-variable credential masking.

  The gap that matters is network: this package has no network policy at any level, so a checklist
  that greps for `sandbox`, finds this module and stops reports a domain allowlist that does not
  exist. Every one of the 38 keys is enumerated with a verdict — absent, coarser, or not applicable to
  a library — rather than dismissed in aggregate.

  Two corrections fell out of doing it. The count is 38, not the 39 previously recorded: two
  independent fetches of the reference returned the same 38 keys while the summarising step attached a
  different total to each. And `sandbox.failIfUnavailable` has no equivalent here — `createSandboxBackend`
  degrades to an unconfined `LocalSandbox` after one warning when bubblewrap is missing, and an
  operator who believes they are sandboxed cannot make that a hard failure.

- 1202e86: A `.mcp.json` written against the current MCP spec is accepted.

  The specification renamed the HTTP transport to "Streamable HTTP". `validateRemote` accepted
  `"http"` and `"sse"` and refused anything else, so a server declared with the spec own current
  name was dropped — with a message about a field the author had written correctly.

  It is an ALIAS, normalised at the boundary, not a third transport. They are one transport under two
  names, and forwarding the synonym downstream would ask every consumer of the parsed config to learn
  it too; the SDK own `McpServerConfig` does not carry it. The parser accepts what the author wrote
  and hands on what the runtime speaks.

  An invented transport is still refused. Accepting the alias must not turn the check into a
  pass-through, and a silent acceptance would be worse than the refusal this started as.

- dcb461f: Sub-agents declared through the authoring chain now spawn, and the per-run door is nameable.

  Three halves that did not connect: `SubAgentsCapability` wrote `draft.agents`,
  `CompiledAgentOptions.agents` held it, and `assembleM8CreateOptions` had no `agents` field to
  project it into. Declaring a sub-agent compiled cleanly and spawned nothing.

  `agent-compiler.ts` recorded the gap as ADR D3 — "a resolver here is carried, not invoked" — and a
  test pinned the boundary with an instruction attached: if someone wires the projection, go red and
  record that the deferral ended. **That deferral has ended.** What could not be defended was the shape
  a consumer meets: `SubAgentsCapability`, `SubagentDefinition`, `discoverSubagents`,
  `loadSubagentDefinition` and `listSubagentNames` all cross the public barrel, so the authoring chain
  reads as complete. This package already names that failure four times by issue number (#663, #668,
  #675, #686): the type crosses, the capability does not.

  **Why projecting rather than un-exporting.** The shapes already agreed everywhere except in the one
  type nothing consumed. `RuntimeOverrides.agents` — the per-run door that always worked — is
  `Record<string, AgentDefinition>`, the SDK's own shape, and that same shape already crossed the
  barrel as `SubagentDefinition`. The odd one out was `CompiledSubAgent` (`{ model?, systemPrompt? }`),
  referenced in exactly two places, both of them its own declaration and the field that held it. It
  could not have been projected as it stood: `AgentDefinition` requires `description` and `prompt`, and
  a sub-agent with no description is one the parent model has no basis to delegate to.
  `CompiledSubAgent` is now an alias of the SDK type, so `model` is `ModelSelection | "inherit"` rather
  than a bare string.

  **`RuntimeOverrides` is exported, type-only.** It was declared by the adapter and exported by zero
  barrels, so a consumer could pass the value and could not name the type — no helper, no wrapper, no
  typed variable to hold one.

  Per-run overrides still win over the compiled set: `sdk-adapter.ts` spreads `...m8, ...extra`, and a
  per-run value that lost to a compile-time one would be the opposite of what "override" promises. The
  key is written only when something was declared — an unconditional `agents: {}` would hand
  `Agent.create` a claim ("this agent has children") that no author made.

- dcb461f: `@ContextWindow` now documents that declaring it is also the on-switch for instruction discovery.

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

- a2b0a59: The hook gate's vocabulary crosses with the capability that takes it

  `13.0.0-next.6` exported `HookApprovalCapability` and withheld `HookApprovalGate`,
  `HookApprovalRequest` and `HookGateUnsupportedError`. A consumer could build the gate, and could
  neither type the object it takes nor catch its refusal by class — which matters more here than
  usual, because refusing loudly is the whole design.

  Fourth instance of the same shape (#663 `AgentModule`, #668 `transcriptOf`, #675 `RegistryOutcome`),
  and the first three were each found by installing the published package. The source is correct every
  time: the type IS exported from its own module, and only the barrel omits it.

  A guard now reads the EMITTED `dist/index.d.ts` export list rather than the source, and it was
  proved able to fail by removing one export and watching it name that one.

- 9915c19: `RegistryOutcome` is exported alongside the field that uses it

  `registryOutcome` shipped in `13.0.0-next.4` and its type did not, so a consumer could read the
  value and not name it — `function handle(o: RegistryOutcome)` did not compile. A union whose members
  cannot be named is read as `string`, which loses every distinction it exists to make.

  Third instance of the same omission (`AgentModule` in #663, `transcriptOf` in #668), and the third
  found by installing the published package into an empty project rather than by reading the source.

- 5451233: Say, where a consumer can read it, why `CompatSurface` has five names and the SDK's has four

  `CompatSurface` gained `'commands'` in #704 because this package reads
  `<projectDir>/.claude/commands/*.md` itself. The SDK's own union still has four. A caller who
  builds SDK `local` options directly therefore cannot pass a value of this type, and `TS2345` names
  the mismatch without naming the reason.

  The explanation existed only in `//` comments, which do not survive into the emitted `.d.ts` — so
  it was invisible to exactly the audience that hits the error. It now lives in the JSDoc block that
  does ship, together with the guidance to derive the SDK's four from this five rather than writing a
  second list by hand: a hand-copied list goes stale the day a surface is added, which is the
  divergence #704 existed to remove.

  Documentation only; no behaviour changes. Reported by a consumer who hit the compiler error while
  converging four call sites onto one declaration, and who supplied the sentence that was missing.

- Updated dependencies [cfe7f4c]
  - @theokit/presenter@0.9.0

## 13.0.0-next.13

### Minor Changes

- 6b07960: New `grantGate(store, classify)` in `@theokit/agents/auth` — the supported way to put a
  `PermissionStore` in force.

  The store shipped with a careful grant key, a "deny by default, always" docblock and no reader.
  Measured: `isGranted` had zero callers outside its own unit test, and `PermissionStore` appeared in
  zero files across six sibling repositories. An operator reading `.theokit/tool-permissions.json` to
  learn what an agent may run was reading a control that was not in force — a grant and its revocation
  produced identical behaviour.

  `grantGate` adapts the store to `pre_tool_call`, which is documented as the only hook with veto
  power and runs before the tool by construction, so a refusal is a refusal before the side effect. No
  new gate and no framework wiring: nothing is enforced unless a consumer attaches the handler, and an
  agent that does not is unaffected.

  `classify` returns `{ governed: true, query }` **or** `{ governed: false }` — a tagged union whose
  BOTH arms carry the discriminant. A bare `undefined` would say "this tool needs no permission" and
  "I forgot this tool" in the same word, and on a security gate the second must not silently pass.

  The discriminant is on both arms because the first shape — discriminated by whether a `governed` KEY
  was present — **failed open**: a consumer writing a policy record `{ governed: true, scope }` and
  spreading it into the query got the tool waved through, and so did `governed: undefined`. TypeScript
  does not stop that; excess properties pass freely through a variable or a spread. Fail-closed is now
  measured across `true` / `undefined` / `false` / `null`, and only `false` passes.

  Named `grantGate`, not `permissionGate`, because `@theokit/sdk` already exports `PermissionGate`,
  `PermissionGateContext`, `PermissionGateDecision`, `PermissionEngine` and `PermissionPlugin`. The
  rename also says something true: this gates on a standing grant the operator made, and the SDK's
  permission engine is a separate system — neither satisfies the other.

  A classifier that throws DENIES, naming the throw, rather than ending the turn. A corrupt store
  denies with a message that says so — "the permission store could not be read, so no grant applies" —
  distinct from "no standing grant matches", so an operator can tell the two apart.

  The read error's own text is deliberately NOT in that message: the veto travels to the model, and
  `lastReadError.message` carries the absolute store path and its file mode. It stays on
  `store.lastReadError` for the operator, which is where the actionable remedy (`chmod 600 …`) lives.
  The scope IS still interpolated, so this narrows the exposure rather than eliminating it.

  **Composing with a `pre_tool_call` you already have**: the field is singular, so assigning the gate
  over an existing handler loses one of the two silently. Compose explicitly —
  `async (ctx) => (await gate(ctx)) ?? (await mine(ctx))`; first veto wins.

  `PermissionStore`'s docblock now states that the class enforces nothing on its own, and records the
  precedence among the surfaces IN THIS PACKAGE that can refuse a tool — saying plainly that the list
  is not exhaustive, because `@theokit/sdk` has its own permission system that neither knows about
  these nor is known by them.

- 5211721: `moderateOutputStream` now delivers the redacted text to the client instead of computing it and
  replaying the original events.

  It called `runOutputGuards` and discarded the return value, so a guard that redacted correctly had
  its work thrown away: measured against the built artifact, a guard returning `[REDACTED]` delivered
  `sk-abc123`. Only `block` reached the client honestly.

  **Signature change**: `moderateOutputStream` takes a fourth argument,
  `rebuildText: (text: string, replaced: E) => E`, which builds one event carrying the
  moderated text, given the text-carrying event it replaces. It is required rather than optional —
  optional would let the function compute a redaction it cannot apply, which is the defect being
  removed. Only the caller knows how to construct its own events.

  **`extractText` MUST match exactly one event kind.** When it matches several, they COLLAPSE INTO
  ONE — measured: `[thinking('CoT: the key is sk-abc'), message(' Here you go.')]` yields a single
  `message` reading `"CoT: the key is [R] Here you go."`, with no `thinking` event surviving. A
  consumer who wants reasoning moderated runs a SECOND pass over that kind rather than widening one
  extractor.

  `replaced` does not prevent that collapse, and an earlier draft of this entry said it did. What it
  buys is narrower: the surviving event keeps the KIND and metadata of the text-carrying event it
  replaces, instead of being rebuilt from the text alone. `replaced` is ALWAYS the event being replaced.
  It was typed `E | undefined` for a case that cannot happen — a stream where no event carried text
  returns from the absence check before the guards run, so `rebuildText` is not reached at all. It is
  also never a non-text event, because a caller spreading one would emit a duplicate of it.

  **Second signature change**: a fifth argument, `rebuildResult: (text, result) => R`, applies the
  moderated text to the generator's RETURN value. A stream has two channels and the first release of
  this fix moderated one: the events were redacted while `step.value` — the aggregate `run()` returns
  — still carried the original text. Measured: the guard computed `"the key is [R]"` and
  `run().response` was `"the key is sk-abc123"`, so **`run()`, the primary non-streaming API, kept
  delivering the secret**. That was this fix's own defect one channel over. Required for the same
  reason `rebuildText` is; passed rather than re-derived, because re-running the guards on the
  aggregate would apply a non-idempotent guard twice.

  When the text is unchanged, the buffered events are replayed verbatim as before. When it changed,
  the **last** text-carrying event is REPLACED by a newly built event carrying the whole moderated
  string, and the earlier text events are dropped. Events carrying no text are never dropped. Note
  "replaced", not "modified": any non-text payload the surviving event carried is lost, as is that of
  the dropped ones — a consumer whose text events carry per-event metadata should moderate one kind
  only, or rebuild from `replaced`. An event whose extracted text is the EMPTY STRING is still
  text-carrying and can be the one replaced.

  **Known consequence:** when text events straddle a non-text event, their relative order does not
  survive a redaction. Given `text('tok ') , tool_call , text('sk-abc')` the client now receives
  `tool_call , text('tok [R]')` — text that preceded the tool call follows it. Landing on the last
  text-carrying event keeps a trailing terminator in place and keeps any completion claim after the
  work that produced it; what it cannot keep is the interleaving, because the redaction is about the
  whole string and the boundaries are gone by the time it exists. A test pins this so it is found
  here rather than in a transcript that stopped making sense.

  A guard that rewrites **unconditionally** — a disclaimer appender, a trim, an NFC normaliser —
  takes this path on every stream that DOES carry text. The cost is not proportional to how much the
  guard changed. It does NOT add a text event to a round that produced none — this entry claimed so,
  and the absence check refuses it: a tool-only round yields its tool call and nothing else.

- 98b2565: `resolveSettingSources` now returns `readonly GatedSettingSource[]`, and
  `CompiledAgentOptions.settingSources` takes that type — so a setting root no `TrustPosture`
  authorised no longer fits the field.

  `define-agent.ts` claimed that field "can only ever hold roots that some posture authorized".
  Measured against the emitted `.d.ts`: `setOnce(draft, 'settingSources', ['mdm','team','user','plugins'], 'cap')`
  typechecked **cast-free**. Writing a `Capability` is the documented way to extend the builder, and a
  capability writes the draft directly — so the gate was reachable around, for `project`, the root it
  exists to protect.

  A brand rather than a runtime check, because the obvious runtime check does not work: reading
  `draft.provenance` to refuse a capability's write would also refuse the LEGITIMATE builder path,
  which writes through `setOnce` too. What differs is where the value came from, and that is what a
  brand carries.

  **It refuses the accident, not the determined caller** — `as never` defeats it, like every brand.
  Saying so is the point: the comment it replaces claimed an invariant nothing enforced.

  **New: `settingSources.plugins`**, taking the same `ProjectSettingsGrant` as `project`.
  `PluginsManager.refresh` loads executable bundles from the same cwd-controlled tree, usually
  arriving with the clone, so it gets the same gate and not a weaker one. This is the root the SDK
  genuinely reads and the facade withheld.

  `team` and `mdm` stay absent, and that is the item's original premise dying under measurement: the
  SDK never reads them — `includesSetting` is called with exactly `"project"` and `"plugins"` — so
  forwarding them would be a capability in the type and nothing at runtime.

  **Migration**: a consumer constructing `CompiledAgentOptions` by hand must build roots through
  `resolveSettingSources` instead of a string array. That is the supported construction and always was.

  **Also: a narrowed `claudeCode.import` is now REFUSED on an SDK that cannot read it.**

  That field's docblock said the narrowed form was "refused at resolve time" below `@theokit/sdk`
  5.4.0. Nothing read a version for it — the only checks in this layer are the hook gate (a different
  option) and a `compatSources` warning that returns silently for any major ≥ 5. So on
  5.0.0 ≤ SDK < 5.4.0, inside this package's declared `^4.52.1 || ^5.0.0`, a narrowed `import` was
  forwarded, dropped by the runtime in silence, and the foreign root was **not read at all** — a
  consumer asking for "the skills but not the hooks" got nothing, which is further from what they
  asked for than the un-narrowed form. `compatSources` landed in 5.0.0 and the narrowing in 5.4.0;
  treating the two versions as one was the defect.

  `CompatImportUnsupportedError` now refuses, naming both versions and what would otherwise happen.
  It refuses rather than warns because a silent nothing is discovered by wondering why a skill is
  missing. An unreadable version is refused too: "cannot tell" and "is supported" must not collapse.

  **And `commands` is subtracted before the compat sources reach the SDK.** The two vocabularies
  diverge by one name on purpose — `.claude/commands/*.md` is read by this package and never by the
  SDK — and `setting-sources-gate.ts` prescribed the subtraction as advice to consumers while the
  projection that needed it did not do it. Measured: `import: ['commands']` forwarded a list
  containing zero names the SDK defines, which is its own empty-list case — the exact ambiguity
  `resolveCompatSources` refuses one layer up. A source whose surfaces all belong to this layer
  is now dropped from the SDK's list rather than sent empty.

  `CompatImportUnsupportedError` is exported from `@theokit/agents/bridge`, so a consumer can catch the
  refusal by class rather than by matching its message.

- 2bc5d84: `delegate()` now applies the guardrails its spec declares. It accepted them and never consulted them.

  Measured against the built artifact with a guard declaring both halves: the input reached the model
  with its injection intact and the caller received `sk-abc123`. `bridge/agent-orchestrator.ts`
  contained **zero** occurrences of `guardrail` — control on the same sweep: `loop/agent-runner.ts`
  has 9 — and called `runReflectiveLoop` bare. The operator had declared guardrails and the run was
  green.

  This is the same defect class as the streamed-redaction fix in this release, on a sibling public
  API, and it is model-reachable: `tools/delegate-tool.ts` wraps `delegate()`, so an agent can invoke
  a sub-agent whose declared guards do nothing.

  `checkInput` runs after `onDelegationStart` and `checkOutput` after `onDelegationComplete` — each
  moderating what actually crosses the boundary rather than a string a hook may then rewrite. A
  blocking input guard throws before the model is called at all, so a refused delegation costs
  nothing.

  `response` only. `toolCalls[].output` is tool output rather than model text, and `agent-runner.ts`
  excludes it from `extractText` on the same reasoning; the docblock says so, because leaving it alone
  should be a decision somebody reads rather than an omission somebody discovers.

  A spec declaring no guardrails behaves byte-identically.

  **A guardrail block now crosses the delegate tool as a refusal, not a crash.** `errorCodeOf` mapped
  only the three delegation errors, so `GuardrailViolationError` — reachable from `delegate()` for the
  first time because of this change — hit the "not a delegation outcome, a defect" arm and was
  rethrown, ending the parent's turn. The tool's own description, shipped to the model, promises
  `{ ok: false, error, message }` on a refusal.

  It crosses as `guardrail_violation` with a FIXED message: `the delegated task was refused by a
policy guard`. The message travels only for codes on an explicit ALLOWLIST — a budget or a timeout
  is a fact about the work, and the number in it is what the model acts on. A code nobody lists
  withholds, so forgetting is safe in the direction that matters. A guardrail message is not — it reads
  `Guardrail "pii-detector" blocked output: ssn found`, naming the guard and its exact trigger, and a
  model given that learns which words to avoid rather than that it should stop. The operator keeps the
  full typed error, which carries `guardName`, `phase` and `reason`.

- 019f828: Output guards now moderate `thinking` events, not only `text_delta`.

  `AgentRunner` handed `moderateOutputStream` an extractor matching `text_delta` and nothing else,
  while `thinking` is a public `AgentStreamEvent` that reaches the client like any other. Measured: a
  guard declared over the agent's output delivered `thinking "the key is sk-abc123"` verbatim.

  **This closes one channel and does not close all of them.** `DoneEvent.result` carries the model's
  whole answer and is still unmoderated — measured on the same turn, `text_delta` came out
  `"here: [R]"` while `done.result` came out `"here: sk-abc123"`. `task_progress.text` is a fourth and
  reaches the web wire. A third pass does not extend to them: there is one `done` per round, so a pass
  keyed on it would collapse every round's into one, and they need a different mechanism. Tracked
  separately; stated here because a security note that overstates its coverage is worse than one that
  does not exist.

  The third channel of a shape fixed twice already in this release — a streamed redaction that was
  computed and discarded, and `delegate()` consulting no guards at all.

  **Two passes, not one wider extractor.** Widening `extractText` to match both kinds is the obvious
  move and the wrong one: two kinds under one extractor COLLAPSE into a single event, so the reasoning
  would be promoted into a visible one — the moderation creating the disclosure it exists to close.
  Composing two passes is what `moderateOutputStream`'s own docblock prescribes, and each pass seeing
  one kind is what keeps them apart.

  The visible pass owns the aggregate: `DelegationResult.response` accumulates from `text_delta`
  upstream, so the reasoning pass passes the result through rather than replacing it.

  A blocking guard on either channel still throws before any event is emitted. An agent with no output
  guard is byte-identical.

- 0731584: `resolveCompatSources` now returns `readonly GatedCompatSource[]`, and
  `CompiledAgentOptions.compatSources` takes that type — so a compat source no `TrustPosture`
  authorised no longer fits the field.

  **BREAKING for hand-built compiled options**, exactly as its sibling was. Build compat sources
  through `resolveCompatSources`.

  The twin of the `settingSources` brand, and it exists because that fix closed one of the two fields
  one `SettingSourcesSelection` feeds and left the other bare. Measured, with the `settingSources`
  route as the control: the control errored, and `setOnce(draft, 'compatSources', ['claude-code'],
'cap')` compiled cast-free — while `agent-compiler.ts` told the reader that field "can only hold a
  source some posture granted".

  It carries more authority than its twin, not less. `applyLocalSources` forwards it to
  `Agent.create({ local: { compatSources } })`, which reads `<cwd>/.claude/` — `hooks.json` included,
  and that executes shell.

  **Signature narrowing**: `moderateOutputStream`'s `rebuildText` is now
  `(text: string, replaced: E) => E`. It was typed `E | undefined` for a case that cannot happen — a
  stream where no event carried text returns from the absence check before the guards run, so
  `rebuildText` is never reached. The branch handling that case was dead code, and three shipping
  artifacts described it as live.

  **Fixed**: `isPort` discriminated on the presence of `run`, so an object carrying both `compiled`
  and a `run` — reachable through a spread, which is how targets are built in practice — took the port
  branch and skipped `delegate()` entirely: no declared guardrails, no inherited parent veto, no
  budget clamp. A tie now goes to the spec, because the spec branch is the guarded one.

### Patch Changes

- bb0f451: A guardrail refusal thrown inside a round is no longer renamed into a delegation failure.

  `runReflectiveLoop` wrapped any error that was not already a delegation error into
  `DelegationError`, whose message reads `Delegation to agent "X" failed: ${cause.message}`. That code
  is on the delegate tool's message allowlist — a delegation failure's text is a fact about the work —
  so the wrapper carried the guard's own words to the model: `Guardrail "pii-detector" blocked output:
ssn found`, naming the guard and its exact trigger.

  Measured through `createDelegateTool` with a consumer-supplied `streamFactory` that throws
  mid-round. `streamFactory` is a public option, so this was reachable rather than theoretical.

  `GuardrailViolationError` now passes through as itself, alongside the two delegation errors that
  already did, so the tool classifies it `guardrail_violation` and withholds the message.

  Fixed by classification rather than by suppressing text downstream: a guard refusal is not a
  delegation failure, and a layer that renames an error cannot be expected to maintain a list of what
  the new name must hide.

- ac29eff: A permission-gate veto now emits a debug line.

  `grantGate` refused and emitted nothing — no log, no counter, no debug line. An operator could
  observe the refusal only through the tool result the model received, and the two causes the veto
  message distinguishes ("no standing grant matches" versus "the permission store could not be read,
  so no grant applies") are indistinguishable from there.

  That is pillar 3 of the wiring triad missing on a refusal seam. `bridge/approval-posture.ts`, the
  sibling gate, already logged through this exact seam.

  The QUERY is logged — tool, scope, and which of the two causes fired — and the grant is not: a query
  names what an operator needs to diagnose, while the store's contents are the thing being protected.
  A classifier that threw logs as its own event rather than as an ordinary veto, so a consumer-code
  defect is not read as a denied tool.

## 13.0.0-next.12

### Minor Changes

- a7e35bb: A guardrail returning `action: 'redact'` with no replacement `text` now throws
  `MalformedGuardrailResultError` instead of silently redacting nothing.

  `GuardrailResult.text` is optional, so such a guard compiles and reads like a working one. The
  pipeline tested `r.text !== undefined` and moved on, so the caller received the original text and
  believed a guard had run on it — the operator believing a protection is in place when none is.

  **This is a behaviour change.** A guard relying on the previous no-op will now throw. That is
  deliberate: the alternative is unredacted output reaching a model because a guard was written wrong.
  `text: ''` is unaffected and always was a real redaction — a guard choosing to erase everything.

  `MalformedGuardrailResultError` is exported from `@theokit/agents`, carries the guard's name and the
  phase, and is not retryable.

  This also reaches the streaming path (`moderateOutputStream`), which shares the same pipeline: a
  malformed guard there now throws where it previously continued.

### Patch Changes

- 2bc27d3: `inheritHooks` no longer lets a member's `transform_tool_result` or `pre_user_send` handler replace
  its parent's — both now chain parent-first, matching the six events that already composed.

  `inheritHooks` documents its security property as "the parent's refusal is evaluated first, and a
  member can only ever ADD a reason to refuse". For these two events the plain object spread did the
  opposite: a member declaring either handler silently discarded the parent's. The reachable surface is the EXPORTED `inheritHooks`, called with two handler maps.
  `delegate()` passes `undefined` for the member (`agent-orchestrator.ts:175`), so that path composed
  nothing and was never affected — a distinction the first version of this note got wrong.

  `pre_user_send` composes additively — both contributions reach the model, parent first — because
  `PreUserSendResult` carries only `recalledContext` and the seam exposes no prompt mutation.

- eaac7b0: The "will NOT fire" warning for a declared-but-unwired hook event now names where the capability
  already lives, instead of ending "the handler does not exist yet".

  Two of the three unwired events are served today by purpose-built seams — `Guardrail.checkOutput`
  for `transform_llm_output`, and `createToolHooksPlugin({ processInput })` for `pre_user_send` — so
  the old message told consumers to wait for work that will not come. The third, `on_session_end`, is
  named as genuinely uncovered, with the reason: its handler returns `void` and cannot refuse an
  ending, so wiring it would produce a hook that runs and cannot decide.

  Nothing is wired. `HOOK_EVENTS`, `WIRED_EVENTS` and `OBSERVATIONAL_EVENTS` keep the same members.

- ec899f4: An observational hook handler is now assigned to its own key rather than chosen by comparison.

  The dispatch loop used a two-branch conditional over a list of two event names, so a third
  observational event would have landed on `post_assistant_reply` — silently, with no test objecting.
  No behaviour changes for the events wired today; the fix removes the trap for the next one added.

## 13.0.0-next.11

### Patch Changes

- 5451233: Say, where a consumer can read it, why `CompatSurface` has five names and the SDK's has four

  `CompatSurface` gained `'commands'` in #704 because this package reads
  `<projectDir>/.claude/commands/*.md` itself. The SDK's own union still has four. A caller who
  builds SDK `local` options directly therefore cannot pass a value of this type, and `TS2345` names
  the mismatch without naming the reason.

  The explanation existed only in `//` comments, which do not survive into the emitted `.d.ts` — so
  it was invisible to exactly the audience that hits the error. It now lives in the JSDoc block that
  does ship, together with the guidance to derive the SDK's four from this five rather than writing a
  second list by hand: a hand-copied list goes stale the day a surface is added, which is the
  divergence #704 existed to remove.

  Documentation only; no behaviour changes. Reported by a consumer who hit the compiler error while
  converging four call sites onto one declaration, and who supplied the sentence that was missing.

## 13.0.0-next.10

### Minor Changes

- ca44ee7: A narrowed foreign root can name `commands`

  `settingSources.claudeCode.import` narrows the foreign root to named surfaces, and `CompatSurface`
  listed four of them — `hooks`, `plugins`, `skills`, `subagents`. It fed a fifth: this package loads
  `<projectDir>/.claude/commands/*.md` itself, outside the SDK's `compatSources` path. The name was
  missing from the vocabulary, so a consumer could neither ask for that directory nor be told it had
  gone unread, and `loadCustomCommands` tested `sources.includes('claude-code')` — string equality
  against a union whose narrowed member is an object, so every narrowed list read as _not declared_.

  `CompatSurface` now includes `'commands'`, and the loader understands both shapes: the bare source
  name grants every surface the root feeds, the narrowed form grants the ones it names.

  Purely additive — before this, no narrowed list reached the directory at all, so nothing that works
  today stops working. A narrowed list that wants foreign commands adds `'commands'` to `import`.

  An enumeration used to narrow a root must cover every surface that root feeds; otherwise it is not
  a narrowing but an undeclared drop. Reported as usetheokit/theokit#704, found by measuring a claim
  in a consumer's adoption report rather than by any test here — the fifth time a gap in this
  package's public surface was invisible from inside it.

## 13.0.0-next.9

### Minor Changes

- c59abf6: A foreign configuration root can be imported in part

  `resolveCompatSources` returned the bare literal `'claude-code'`, which the SDK reads as "import
  every surface" — hooks, plugins, skills, subagents. `settingSources.claudeCode.import` now names the
  surfaces, and the resolved value carries them.

  The distinction is the reason the grant exists: `.claude/` usually arrives with the clone and its
  `hooks.json` executes shell, so "take the skills, refuse the hooks" is the ordinary thing to want,
  and the only choices were all of it or none of it.

  Absent `import` still means the whole root, so nothing existing changes. An EMPTY list is refused
  rather than guessed: "no surfaces" and "unset, so all of them" are both defensible readings of `[]`,
  they differ by whether shell executes, and picking one would settle a security question by
  convention.

  `CompatSurface` and `ResolvedCompatSource` are declared here rather than imported from the SDK, for
  the reason already recorded beside the literal: they do not exist in `@theokit/sdk@4.52.1`, this
  package's declared floor.

  Closes usetheokit/theokit#686.

## 13.0.0-next.8

### Minor Changes

- feb5781: `AgentBuilder.create().hookApproval()` — the fluent twin of `defineAgent({ hookApproval })`

  `13.0.0-next.7` shipped the hook approval gate reachable through `defineAgent` and capabilities, and
  not through the fluent builder. A consumer that authors with `AgentBuilder.create()` had no way to
  reach it: `.use()` composes presets rather than sinking capabilities, and the definition reaches
  `streamAgentTurnInProcess` with `local` already assembled, so there was no downstream place to inject
  `local.hooks` by hand either.

  Fifth instance of one family and a NEW variant. The first four were "the symbol exists and the barrel
  omits it", which the emitted-export guard now catches. This one is the opposite: the symbol is
  exported, on the compiled waist, and reachable through one authoring door — the other door simply
  does not offer it, and an export check is green on that.

  So the guard for this variant builds the SAME agent through BOTH doors and asserts they arrive at the
  same compiled waist. It catches the worst case too: an interface that declares the method while the
  factory never wires it compiles, does nothing, and fails this test.

## 13.0.0-next.7

### Patch Changes

- a2b0a59: The hook gate's vocabulary crosses with the capability that takes it

  `13.0.0-next.6` exported `HookApprovalCapability` and withheld `HookApprovalGate`,
  `HookApprovalRequest` and `HookGateUnsupportedError`. A consumer could build the gate, and could
  neither type the object it takes nor catch its refusal by class — which matters more here than
  usual, because refusing loudly is the whole design.

  Fourth instance of the same shape (#663 `AgentModule`, #668 `transcriptOf`, #675 `RegistryOutcome`),
  and the first three were each found by installing the published package. The source is correct every
  time: the type IS exported from its own module, and only the barrel omits it.

  A guard now reads the EMITTED `dist/index.d.ts` export list rather than the source, and it was
  proved able to fail by removing one export and watching it name that one.

## 13.0.0-next.6

### Minor Changes

- 462bb62: The pre-spawn hook approval gate crosses the layer, or refuses to pretend it did

  `@theokit/sdk@5.4.0` added `local.hooks.approve` — a consumer's decision point before the runtime
  spawns a hook. This layer never forwarded it, so a hook declared in a config root, including a
  foreign dialect imported through `compatSources`, ran shell without passing the consumer's approval.

  Measured in a consumer against 5.4.0, with a control arm proving the zero was not an empty turn:

  ```
  control_nothing             fires=0  tool_ran=yes
  claude_project_unapproved   fires=1  tool_ran=yes
  ```

  `defineAgent({ hookApproval })` and the new `HookApprovalCapability` now carry it to
  `Agent.create({ local: { hooks } })`. Named `hookApproval` rather than `hooks` because
  `defineAgent({ hooks })` is already the LIFECYCLE seam, and two security-relevant things under one
  name is how a consumer configures the wrong one.

  **Declaring it against an SDK older than 5.4.0 is REFUSED, not forwarded.** The option is 5.4.0-only
  while this package's floor is `^4.52.1`, so a pass-through would compile and do nothing on most
  admitted versions — a gate that silently does not gate, which is worse than offering none, because
  whoever configured it stops looking. An unreadable SDK version is refused for the same reason:
  "cannot tell" and "is gated" must not collapse.

  The floor is unchanged, so no consumer is pinned to a newer SDK for a feature they did not ask for.

  Closes usetheokit/theokit#686 (the `hooks` half; `resolveCompatSources` widening is tracked there).

## 13.0.0-next.5

### Patch Changes

- 9915c19: `RegistryOutcome` is exported alongside the field that uses it

  `registryOutcome` shipped in `13.0.0-next.4` and its type did not, so a consumer could read the
  value and not name it — `function handle(o: RegistryOutcome)` did not compile. A union whose members
  cannot be named is read as `string`, which loses every distinction it exists to make.

  Third instance of the same omission (`AgentModule` in #663, `transcriptOf` in #668), and the third
  found by installing the published package into an empty project rather than by reading the source.

## 13.0.0-next.4

### Minor Changes

- a7f4d3d: `deleteSession` stops reporting a registry removal it cannot confirm

  `registryRemoved` was computed as `outcome !== false`, so a remover that resolved saying **nothing**
  was reported as a removal. That is the shape `Agent.delete` has — `Promise<void>` — and below
  `@theokit/sdk@5.3.1` it is what a no-op returns: measured in `4.52.1`, `removeRegisteredAgent`
  mutates an in-memory map and schedules a save only when the entry was in it, while `delete` — unlike
  `list` — never hydrates from disk. In any freshly started process the entry is not in memory, so the
  call resolves having left `registry.json` untouched and throws nothing.

  Breaking, inside the unreleased 13.0.0 line:

  - `DeleteSessionResult.registryRemoved: boolean` is replaced by
    `registryOutcome: 'removed' | 'nothing-to-remove' | 'unconfirmed' | 'failed' | 'not-attempted'`.
    Renamed rather than retyped: `if (result.registryRemoved)` would have kept compiling while
    silently changing which branch it took.
  - `SessionInUseError.registryRemoved` becomes `registryOutcome`, and the refusal no longer advertises
    "the registry entry was already removed" for a half it cannot confirm — it tells the caller to
    verify instead.

  `not-attempted` and `unconfirmed` are distinct on purpose: "nobody asked" and "we asked and got
  silence" lead a caller to opposite actions, and the old boolean said `false` to both.

  The declared SDK range is unchanged. `5.3.1` fixes the behaviour and not the signature — `delete`
  still returns `Promise<void>` — so `unconfirmed` remains the honest answer on every admitted version,
  and raising the floor is a separate decision that would make the removal happen without making it
  reportable.

  Closes usetheokit/theokit#675.

## 13.0.0-next.3

### Minor Changes

- 59d6dcc: A transcript nobody can read is listed without an id, and keeps its protection

  `listSessions` fell back to the filename stem whenever the first record could not be read. Under
  `@theokit/sdk` 5.x that stem is a one-way hash of the id, so the fallback did not return a degraded
  id — it returned an identifier belonging to no session. Session GC keyed protection on it, so a
  session someone had DECLARED protected lost its protection and was planned for deletion, while the
  registry removal was called with the hash and left the real entry behind.

  Protection now runs in the direction that has a function. `transcriptPath(root, cwd, id)` is total on
  both majors and its inverse is not, so protection is keyed by transcript PATH and caller-supplied ids
  are mapped forward onto paths. Whether a transcript can be read stops mattering to whether it is
  protected.

  Breaking, inside the unreleased 13.0.0 line:

  - `SessionSummary.id` is `string | undefined`, alongside a new `idSource: 'transcript' | 'unavailable'`.
    It is never derived from the filename.
  - **`protectedTranscripts` is RENAMED to `protectedTranscriptPaths`, and the rename is the fix.** Its
    keys changed from session ids to transcript paths while the signature stayed `Map<string, string>`,
    so a consumer that mapped the keys forward through `transcriptPath` — correct when they were ids —
    kept compiling and started double-mapping, leaving its protection array matching nothing. Measured
    on a real consumer against this build: `deleteSession` collected a session holding a LIVE writer
    lease. The old name is gone rather than aliased; a silent break that loses data is worse than a
    loud one, and an alias would have preserved the silence. `transcriptOf(id, cwd, root)` maps forward
    for callers that hold an id.
  - `GCCandidate.id`, `GCKept.id` and `GCError.id` admit `undefined` for the same reason.
  - `RunTranscriptGCResult` gains `orphaned` — transcripts collected whose session id could not be
    read, by path. A separate list rather than a second meaning inside `removed`, which answers "which
    sessions did I collect"; `theo sessions gc` reports both, and never prints a filename where an id
    belongs.

  Closes usetheokit/theokit#668.

## 13.0.0-next.2

### Minor Changes

- ecda4ae: The agent-module parameter names what it accepts, so a wrong shape fails at compile time

  `streamAgentTurnInProcess` and `compileAgentModule` took `mod: unknown`, so the contract lived only
  in the runtime guard. A consumer whose producer became `async` handed a `Promise` straight through
  and shipped two releases in which no turn could run — with typecheck, 1213 tests, lint and twelve CI
  checks green. The runtime was never wrong: it refused the Promise and threw a typed error. What
  failed was the moment.

  Both now take `AgentModule`, exported alongside them and re-exported from `theokit/server/agent`.
  The type mirrors the runtime guard rather than the fuller `CompiledAgentOptions` — an array under
  `tools`, an object under `agents` — so it refuses nothing that compiled before.

  `@theokit/tauri/sidecar`'s `runTurnToJsonl` is narrowed too: a desktop sidecar imports its agent
  module statically, which is exactly where a type catches the mistake.

  Entry points that receive a module from a path discovered at runtime keep taking `unknown`, and now
  say so by calling the new `compileLoadedAgentModule`. Their `unknown` has a reason; before this, the
  boundary that had one was indistinguishable from the one that did not.

  Closes usetheokit/theokit#663.

## 13.0.0-next.1

### Minor Changes

- e7a4d65: **A declared `.claude/` now reaches commands too** (theocode B-152).

  `loadCustomCommands` takes `compatSources`, in the SDK's own vocabulary: `['claude-code']` adds
  `<projectDir>/.claude/commands/` to what it reads.

  Three surfaces already reached that directory when a consumer declared it — hooks, skills and
  subagents, through the SDK's `compatSources`. Commands are loaded by this package instead, and were
  the one surface that never learned about it. Measured against a real TUI: the same command file was
  invocable under `.theokit/commands/` and silent under `.claude/commands/`, with no diagnostic
  anywhere. A partial dialect is worse than none — whoever watched the other three work has no reason
  to suspect the fourth.

  **The trust gate does not move.** The foreign directory is read only when the caller declared it
  AND the project is trusted, which is the same pair `resolveCompatSources` already requires. A
  command is a prompt that runs on the operator's behalf, and this one usually arrives with the
  repository, written for another product. An untrusted project now COUNTS the foreign commands it
  refused, so the refusal is not silent either.

  **The native root wins a name collision**, and the two frontmatter vocabularies stay separate: this
  loader reads `description:` and nothing else, so the other product's `model` and `argument-hint`
  are carried in the body rather than adopted.

- cfe7f4c: **`@theokit/sdk@5.x` is now supported, alongside 4.x**
  ([#654](https://github.com/usetheokit/theokit/issues/654)).

  The declared range becomes `^4.52.1 || ^5.0.0` (`^4.49.0 || ^5.0.0` for `@theokit/presenter`), and
  the full suite passes on both halves: 7533 tests against `4.52.1` and 7533 against `5.0.1`.

  This unblocks plugins whose open-ended `@theokit/sdk` peer resolves to 5.x. Until now `theokit` was
  the package that **refused** that resolution — the ERESOLVE named the plugin, but the bound that
  could not be satisfied was this one.

  **What had to change, and why it was not a version bump.** SDK 5.x writes a transcript to
  `${sessionUuidFor(sessionId)}.jsonl` where 4.x wrote `${safeSessionId(sessionId)}.jsonl` — a
  SHA-256 over a namespace, so the filename stopped being the session id and the mapping does not
  invert. `listSessions` derived ids from filenames, so listing, protection, GC and deletion all
  returned UUIDs where callers passed ids. One defect, twenty-nine failing tests.

  The id is now read from the transcript **record**, which the SDK writes on both majors and which is
  authoritative where the name was only a convention. The filename stem remains the fallback, so a
  truncated transcript still appears in a listing rather than dropping out of GC's sight.

  `LiveTranscriptError` — 5.x's new name for `LiveSessionError` — deliberately does not cross the
  `@theokit/agents` layer: it does not exist on the 4.x half, and 5.x keeps the old name working and
  deprecated, so the name that crosses is the one both majors have.

### Patch Changes

- Updated dependencies [cfe7f4c]
  - @theokit/presenter@0.9.0-next.0

## 13.0.0-next.0

### Minor Changes

- fe8a0c6: **`compatSources` reaches the SDK, and says so when the installed SDK cannot hear it** (#634).

  `@theokit/sdk` stopped reading `<cwd>/.claude/` unconditionally (`theokit-sdk#524`) and put it
  behind `local.compatSources`. This layer had no way to forward that, so an agent built here could
  not opt into the foreign dialect at all.

  The issue held the work back for a real reason: forwarding an option an older SDK does not know
  would be **silently inert** — the operator declares it, nothing reads `.claude/`, and no message
  explains why. The silence turns out to be removable from this side. `@theokit/sdk` declares
  `"./package.json"` in `exports` — verified on **4.52.1**, the oldest version a consumer can have
  today, not only on the 5.x prerelease — so the installed version is readable at runtime and a
  mismatch warns once per process. The floor stays `^4.52.1`; nobody is pinned to a prerelease.

  Declaring the dialect goes through `settingSources`, next to the roots it already gates:

  ```ts
  settingSources: {
    project: { trustedBy: posture },
    claudeCode: { trustedBy: posture },   // reads <cwd>/.claude/
  }
  ```

  **Two questions, answered by two different halves of that field**, because the SDK's own docblock
  separates them: _declaring_ the field answers "do I want another product's configuration imported?"
  (omitting is not enabling), and the `TrustPosture` inside answers "do I trust this directory's code
  to run?". The grant is `ProjectSettingsGrant` — the same type `project` takes — not because the
  questions are the same, but because a separate `'foreignDialects'` capability could not carry the
  distinction: `TrustPosture.allows` is `Record<K, boolean>` whose values all move with the trust
  level, so a second name would promise an operator a choice `resolveTrustPosture` never gives them.

  This is deliberately **stricter than the SDK**, where listing a dialect is sufficient: `.claude/`
  holds a `hooks.json` that executes shell, in a directory that usually arrived with the clone.

### Patch Changes

- Updated dependencies [9b5da86]
  - @theokit/http@2.1.0-next.0

## 12.1.0

### Minor Changes

- 0f88b0e: `@theokit/agents/tools` now forwards the image tool, and the `@theokit/sdk-tools` floor moves to
  `^0.27.1` to make that possible.

  Three symbols reach the layer for the first time: `createViewImageTool`, `CreateViewImageToolOptions`
  and `DEFAULT_MAX_IMAGE_BYTES`. `view_image` lets an agent LOOK at an image in the project — read the
  bytes, confine the path, and hand the model an image block rather than a base64 blob it cannot see.

  This is a gap closing rather than a feature arriving. `tools-entry.ts` states that the surface is
  preserved WHOLE and that any deliberately withheld symbol carries its reason in writing; these three
  were absent with no reason, because the pinned `^0.26.1` did not publish them. The layer was not
  withholding anything — its dependency was short. The cost was measurable: `view_image` was the only
  tool a consumer had to write by hand, in a registry where the other nine were built-ins, and an image
  reader that honours any path is a file-exfiltration primitive with a friendly name — exactly the code
  that should not be rewritten per product.

  `tests/unit/tools-view-image-parity.test.ts` had been skipping loudly for this reason and turned
  itself back on the moment the floor moved. Its two behavioural assertions were rewritten to observe
  `handler` rather than `toModelOutput`: `Tool.create` consumes the shaping it is given, so the
  returned tool carries `name`, `description`, `inputSchema` and `handler` and nothing else — which the
  source states in its own header. The behaviour they pin is unchanged and now actually measured: a
  readable image reaches the model as exactly ONE image block with no leading text, and a failed read
  stays a text envelope so the model can read the error and retry.

## 12.0.0

### Major Changes

- 8691f5c: `@theokit/agents/pty` is gone. The PTY backend now lives in `@theokit/agents-pty`, and installing `@theokit/agents` no longer compiles a terminal.

  `@theokit/sdk-pty` declares `"install": "node scripts/prebuild.js || node-gyp rebuild"` — a native step that downloads a prebuild or falls back to a C++ compile. As a hard dependency of this package, **every consumer paid it**, including every web application that will never open a terminal. Measured: installing `@theokit/agents` alone took **6.7 s** with it and **1.4 s** without, and in a scaffolded app that was most of the gap in time to first green run (30.40 ± 7.50 s against Next.js's 14.93 ± 0.91 s) — with our build faster and our dependency tree smaller.

  **To upgrade**, if you import the subpath:

  ```diff
  -import { PtyInteractiveBackend } from '@theokit/agents/pty'
  +import { PtyInteractiveBackend } from '@theokit/agents-pty'
  ```

  plus `npm install @theokit/agents-pty`.

  You do not have to find this note to know: `@theokit/agents/pty` still resolves, and using anything from it throws with the two lines above. It imports nothing, so keeping it costs no dependency and no native build — the failure is a sentence rather than an `ERR_MODULE_NOT_FOUND` you have to diagnose.

  The surface is identical — the same six symbols, and the new package's test asserts they are the upstream identities rather than a wrapper. Nothing else changes.

  If you do not import it, you install 5.3 s faster and there is nothing to do.

  **Why a package and not an optional peer.** That was tried and reverted: a peer means _the host provides it_, and the M63 boundary forbids an application from importing `@theokit/sdk*` at all — so it would ask a consumer to declare exactly what it may not use. A sibling package is something the consumer genuinely does import, with no inversion. Recorded in `docs/adr/0004-the-terminal-is-a-separate-package.md`, along with the two alternatives rejected (a lazy `import()`, which defers nothing that is being measured, and documenting the cost, which is read after the decision it would inform).

### Minor Changes

- ed68f9f: A configuration error now reaches the browser with its own message, instead of the generic mask.

  `missing_api_key` and `malformed_api_key` are the operator's own input — the person reading the blank error is the person who forgot to set the variable. Masking them cost that person the first ten minutes of every misconfiguration, and did it next to a `transient: true` that means _do not persist in history_ on this protocol and _retry may help_ everywhere else a developer has met the word. Together they read as a network hiccup.

  Everything else is unchanged. #390's default stands: a driver's message, an HTTP client's, a filesystem call's — anything that could name a host, a path, a query or a credential — still reaches the browser as `An error occurred.`, with the failure code travelling separately so consumers never go back to matching on text.

  The hole is keyed on **codes**, not on the error class. `ConfigurationError` is a large surface and parts of it do describe internals, so an allowlist keyed on the parent would widen by accident the first time something new subclassed it. Adding a code to the list is a decision about what a browser may read, and the bar is written beside it.

  A host that passes its own `onError` is unaffected — the allowlist is the default's behaviour, not a rule imposed above the hook.

- bf623e4: A paused run can reach its owner off the stream. `HitlWiring.onApprovalRequired` is the opt-in seam.

  The framework's asynchronous promise — _the agent works and comes back when it needs your approval_ — held only while a client was attached. `ApprovalRequiredEvent` went into the run's own event stream and nowhere else, so a caller not consuming that stream never learned the run was waiting, and it stayed parked until someone opened the surface and looked (#458).

  ```ts
  createHitlPlugin({
    gated,
    emit,
    awaitApproval,
    onApprovalRequired: async ({ toolName, question, callbackUrl, timeoutMs }) => {
      await myDelivery.send({ text: `${question} — ${toolName}`, url: `${BASE}/${callbackUrl}` })
    },
  })
  ```

  It receives the same facts the stream carries and does whatever the **application** does. Deliberately not a `@theokit/gateway` dependency: this package must not import from it, and choosing a channel is a policy decision the framework does not get to make. `@theokit/gateway`'s `DeliveryRouter` is the obvious thing to hand it, and that stays the app's decision.

  **Fire-and-forget by contract, and both halves of that are tested.** The run does not wait for it, so a slow dispatch cannot hold a gated tool open; and it does not fail on it, so a Slack outage cannot decide whether a gated tool runs. A rejected promise is swallowed — the outcome belongs to the human, not to the channel.

  Optional: a wiring without the hook behaves exactly as before.

## 11.1.0

### Minor Changes

- e01c3c2: The in-process turn can be told to retry, and a tool can read the run's real token usage.

  **`retry` on the in-process turn (#474).** `streamAgentTurnInProcess` — the entry point an embedded
  surface uses, and the one both surfaces of a terminal agent come through — accepts `retry?:
RetryOptions`. A transient provider failure that kills the turn before it produced anything is
  recovered instead of ending it. `streamAgentUIMessages` accepts the same field, so the HTTP path
  gains it too.

  This is not the forwarded field the issue expected, and the difference is the whole fix.
  `AgentRunnerRunOptions.retry` belongs to the reflective loop, whose round factory is allowed to
  throw; this path runs one SDK turn, and — measured against the shipped `@theokit/sdk@4.52.1` —
  the SDK never rejects on a provider failure. `agent.send()` resolves before the model is called, and
  the loop's failure comes back as the run's terminal `status: "ERROR"` **event**. A `Retry` wrapper
  around the stream's creation, which is what "thread the option through" would have produced, would
  have compiled, shipped, and never fired. What ships instead treats that first `error` event as the
  throw the SDK declined to make.

  The retry window closes on the first event, so nothing has reached the caller and no tool has run —
  a recovered failure can never re-apply an edit. Whether a failure is worth retrying is read from the
  run's own typed error (`RunResult.error.cause` → `isTransientError`), never from the message text: a
  rate limit retries, a bad key does not. Absent ⇒ a single attempt, byte-identical to before.

  **`ctx.usage` for tool handlers (#475).** With `exposeUsageToTools: true`, every tool handler
  receives the run's provider-reported token usage, read with `readRunUsage(ctx)` from
  `@theokit/agents/usage`. This is what a `get_context_remaining` tool needs; before it, the only
  figure reachable from inside a handler was a character-count estimate over `ctx.messages`.

  The numbers come from the SDK's own `BudgetTracker`, which the agent loop calls after each LLM
  completion with the provider's counts — so they are measurements, never projections. Until the first
  report arrives the snapshot is `undefined`, not `0`: "not known yet" and "zero tokens used" are
  different facts and only one is ever true. The context window travels with it when the model
  **declared** one (`ModelSelection.contextWindow`), along with the `remainingTokens` that needs both
  halves; for a bare model id both are absent rather than guessed from the model catalog, which
  answers an unknown model with a conservative default and no way to tell that apart from a real
  entry. A `budgetTracker` the caller already supplied is wrapped, not replaced, so an existing spend
  gate keeps gating.

  Both options are additive: omitting them leaves the stream, the SDK call, and the tool ctx exactly as
  they were.

## 11.0.0

### Major Changes

- bbdfc15: The server's raw error text no longer reaches the browser by default.

  Every failure the framework reported to a browser carried the server's own words: a tool handler's
  stderr verbatim in `tool-output-error.errorText`, a run failure's message verbatim in
  `error.errorText` — whatever a driver, an HTTP client or a filesystem call put in the exception.
  `ai@7`, speaking the same UIMessage protocol, masks by default and says why in its own comment:
  "prevent leaking server error details to the client by default". There was no equivalent here, and
  no seam to add one.

  Both are masked now, through one `onError` hook on the serving boundary
  (`streamAgentUIMessages`, `streamAgentTurnInProcess`, and `mountAgent` by pass-through), defaulting
  to a fixed string. The full text is not lost: it still reaches the server's logs and the
  `agent.run` span, and the hook receives it — what stops is it reaching a browser unless the host
  decides otherwise.

  **A tool's error text masks by the same default as a run's**, which the report that raised this
  deliberately left open. The deciding fact is that masking costs the model nothing: the presenter is
  downstream of the SDK loop, observing events the model has already consumed, so the copy being
  masked is the browser's and only the browser's. Two different defaults for "server text reaching a
  browser" would be a rule nobody could hold.

  The failure `code` keeps travelling on its own data part, so consumers still distinguish failures
  without matching on text — masking that removed the discriminator would push them back into the
  habit that part exists to have removed.

  **Breaking** for `@theokit/agents`: an application that read the server's message out of
  `errorText` now reads `'An error occurred.'`. Pass `onError: (e) => e.message` to restore the old
  behaviour explicitly, which is the point — it becomes a decision instead of a default.

- d4da51b: The agent route `generateAgentRoutes` mounts now speaks the wire this framework's clients read.

  There were TWO SSE encoders for agent runs and they did not agree. The durable one writes
  `data: <UIMessageChunk>` and a terminal `data: [DONE]`; this one wrote
  `event: <type>` + `data: <framework StreamEvent>` — snake_case agent events rather than kebab-case
  wire chunks — and no terminator at all.

  `parseWireStream` validates each `data:` payload against `wireChunkSchema` and drops what fails
  through a `warn` whose default sink is a no-op. So a `TheoApp` app mounted with `agentRuntime`
  served `POST {route}/chat` in a format none of its own clients could read: zero chunks, no
  assistant message, and a run reporting success with an empty answer — silent at every layer.

  The events go through `presentUIMessageStream` now, the same translator `mountAgent` uses, so there
  is one wire and one place that produces it. It also terminates: the missing `finish` chunk is what
  a client keys "completed" on, so without it a finished run and a dropped connection were
  indistinguishable there too.

  **Breaking** for anyone who built their own reader against the old framework-event format on this
  route. That is the trade the fix makes: a wire only a bespoke consumer could read, for the one every
  client in this framework already speaks.

### Minor Changes

- a896e4a: A conversation survives a reload: `chatId` can be supplied and read.

  `AgentClient` drew `#chatId` in its field declaration and offered no way to supply one or to read
  the one it drew. The id is not decorative — the HTTP transport sends it as the top-level `id`, which
  the server reads as the session id — so every `new AgentClient(...)` started a new conversation, and
  reloading the page silently abandoned the thread the server still held.

  ```ts
  const client = new AgentClient(transport, undefined, {
    chatId: localStorage.getItem('chat') ?? undefined,
  })
  localStorage.setItem('chat', client.chatId)
  ```

  Both halves matter. Reading without supplying lets an application persist an id it can never
  restore; supplying without reading leaves it nothing to persist.

  The default is unchanged and deliberately so: two clients built with no id are still two
  conversations. Sharing one by default would let two unrelated tabs write into the same thread, which
  is the opposite defect and the more dangerous one.

- d9e98e0: A model that takes no credential can delegate.

  `createDelegateTool` refused to construct when any target was a `SubAgentSpec` and
  `defaults.apiKey` was empty, and `delegate()` refused the same way deeper in its own call stack.
  Both read "non-empty string" as the definition of authenticated — a safe reading while every
  provider held a key, and no longer one now that a keyless provider (a model on the developer's own
  machine) is reachable.

  `apiKey: null` says the provider takes no credential. It is a distinct value from `''` on purpose:
  an empty string is also what an unset environment variable produces, so accepting THAT would turn a
  typo into an unauthenticated run. `undefined` still means the caller supplied nothing and is still
  refused — at startup rather than at the model's first call, which is what the guard was for.

  The refusal now names the option, so a reader who hits it is not left choosing between a fabricated
  value and giving up.

- da4db56: A run the server still holds can be reached after a page reload.

  The whole durable-reconnect machinery — sequence ids on every frame, the `RunEventCache`, the
  `Last-Event-ID` replay, the `x-theokit-run-id` header — was built and reachable, and one link made
  it unusable in the case with the highest user cost. The reconnect key lived in a private in-memory
  field, so a reloaded page built a fresh transport with an empty cell and `reconnectToStream`
  returned `null` before it reached the network. The run was alive, cached, replayable, and
  unreachable; the user got an empty thread instead of the answer the server had already finished.

  `HttpTransport` takes a `runIdStore` now — `{ get(): string | undefined; set(id): void }` —
  defaulting to an in-memory cell, which is exactly what the private field was. Nothing changes for a
  caller who passes nothing, including the reconnect-within-one-page-lifetime case that already
  worked.

  The MEDIUM is deliberately the consumer's decision. `sessionStorage` matches a run's lifetime better
  than `localStorage`, and either would be a client library writing to browser storage nobody asked it
  to write to, with privacy and SSR consequences. So the seam is injected and the package stores
  nothing it was not handed a place for.

  Deliberately NOT included: reconnecting automatically on load. This makes a cached run _reachable_;
  reaching for it is a product decision nobody has asked for.

- 3762c7d: An agent can declare a ceiling on the tool-calling turns of a single run, and the served agent obeys
  it. `AgentBuilder.create().maxIterations(5)` and `defineAgent({ maxIterations: 5 })` are new; the
  ceiling `@Agent({ maxIterations })` and `@MainLoop({ maxIterations })` already accepted now reaches
  the runtime as well.

  The number was written by every authoring path and read by none of them once the agent was served:
  the only code enforcing a ceiling was the reflective loop, which no served path calls. The adapter
  now lowers `CompiledAgentOptions.maxIterations` to the SDK's `SendOptions.maxIterations` — its
  documented per-send ceiling — on both the streaming path and the handle `toAgentFactory` serves,
  where a caller's own value still wins for that turn.

  An agent that declares no ceiling is untouched: the key is omitted entirely, so the SDK's own default
  still applies and nothing about that run changes. A value that is not a positive integer is refused
  where it was written rather than at the first send.

- 5f90ddd: A run that was cut short says so. The terminal `done` frame and the turn metadata a client reads off
  `UIMessage.metadata` now carry an optional `stopReason` — `'step_limit'` when the loop ran out of
  tool-calling turns while the model still wanted more, `'no_progress'` when the doom-loop guard
  stopped it repeating identical tool calls. The observability span `agent.run` records the same value
  as `stop.reason`.

  Both outcomes reached the caller as an ordinary `done` before this, identical in every field to a run
  that finished on its own, so a surface could not tell "the agent answered" from "the agent was cut off
  with a tool call still pending". The SDK reported both on its `RunResult`; the adapter's locally-typed
  `wait()` declared no field to read them from, so nothing read them.

  This is not the rare case it looks like: the SDK's iteration budget defaults to 8, so every served run
  needing a ninth tool-calling turn was being truncated and reported as finished — including runs of
  agents that never declared a ceiling.

  Two reasons rather than a `truncated` flag, because they demand opposite reactions: `step_limit` means
  re-sending continues the work, `no_progress` means re-sending repeats the loop that was just cut.
  Nothing here re-sends — the SDK owns continuation; this reports the outcome.

  A run that finishes on its own is unchanged: the field is absent, not `undefined`, so absence keeps
  meaning "the agent finished" and a consumer that has never heard of `stopReason` receives exactly what
  it received before.

- c131170: A run whose connection drops mid-answer is reported as interrupted instead of finished. The agent
  client used to settle a dropped stream in `status: 'done'` with `error` undefined and half a sentence
  on screen — the spinner stopped, the error surface stayed empty, and the truncated turn was committed
  to the thread as a completed one. `reconnect()` and the durable replay route were fully built and
  unreachable, because the only trigger a consumer has for them is a status that never arrived.

  `consumeChunkStream` (and `consumeUIMessageStream`) now return a `ChunkStreamOutcome` saying whether
  the stream carried its terminal `finish` chunk and how many chunks crossed. When it did not,
  `AgentClient` settles `status: 'error'` with an `AgentStreamInterruptedError` — a `TheokitAgentError`
  with `code: 'AGENT_STREAM_INTERRUPTED'` and `isRetryable: true`, so `isTransientError` sees it and a
  consumer decides on the type instead of on message text. The text already received stays on screen,
  and `send()`'s existing rule keeps the truncated turn out of history.

  The status is `'error'` rather than a new `'interrupted'` member on purpose: a new member fixes the
  lie only for consumers who update their switch, while every other surface keeps rendering a finished
  turn. Reusing `'error'` fixes it for all of them at once, and the reason for it lives in the typed
  error where this framework already puts error discrimination.

  This is a different axis from `stopReason` (#379), not another member of it. `stopReason` says why the
  RUN stopped and rides the terminal frame's metadata; an interruption is the absence of that frame,
  where the client cannot know why the run stopped because it never heard.

  A stream that ends on its terminal `finish` chunk is unchanged, down to the fields on the snapshot.
  A custom transport that never emitted `finish` — which no framework producer does, since
  `presentUIMessageStream` emits it on every path including the error one — will now be reported as
  interrupted, which is what it always was.

- e29e22e: `mcpInventory()`, from `@theokit/agents/mcp-health`: the per-server status of the agent's MCP
  servers — `loaded`, `failed` or `ignored`, each with its reason.

  `loadMcpJson` reads the configuration file; this reads what was observed. A server that failed its
  handshake and a server the loader refused both appear, which is what a `/mcp`-style command needs and
  what a configuration read cannot give.

  Tool-level enumeration is not included and is not planned here: the resolved tool table lives inside
  `@theokit/sdk`'s agent loop and no run event carries it.

- a5c6353: `readThreadHistory()` from `@theokit/agents/session`: read one thread's stored history with three
  answers — `present`, `absent`, or `unreadable` with the reason.

  Applications had two. Catching for a brand-new thread (which has no transcript yet) is mandatory, and
  that catch also swallowed parse and permission failures, so a damaged conversation rendered as an
  empty successful one.

  `absent` still does not distinguish a lost conversation from a new one, and the type says so: the
  thread id is minted client-side and nothing records that it was issued. That distinction belongs to
  the caller who knows whether the id was restored from storage or freshly minted.

### Patch Changes

- c8022db: Four separate defects the SAST gate was reporting, each fixed at its cause.

  **A generated property key could not contain a backslash.** The typed app-client emits a route
  segment that is not a plain identifier as a quoted key, escaping the quote but not the escape
  character — so a segment ending in `\` produced `'trail\'`, whose trailing backslash escapes the
  closing quote and swallows the rest of the emitted line. A backslash is a legal POSIX filename
  character, so it reaches this code from `server/routes/`.

  **An internal error could forge log entries.** `sendError` logs an `INTERNAL_ERROR` with its
  message and request id, and an exception message can be built from request data. A newline inside
  it reached the log verbatim, which is enough to append lines of one's own — a fabricated entry
  sitting in the log looking exactly like a real one. Both values are now rendered as one line.

  **Stripping TOTP padding was quadratic.** `base32Decode` removed trailing `=` with an anchored
  `/=+$/`, which retries from every start position, so a long run of `=` followed by anything else
  costs O(n²) — on an authentication path. The comment defending it argued the input was short
  enough ("10..50 chars typical"), which is an expectation rather than a bound. A scan back from the
  end is linear and needs no such argument.

  **The hook-output fence escaped only the first `<`.** `fenceHookOutput` neutralises an early
  fence-close by escaping its `<`, using a form of `replace` that stops at the first occurrence. The
  fence contains exactly one today, so nothing was wrong — and nothing said so, which made the
  correctness of a prompt-injection guard depend on a property of a string literal several lines
  away. `replaceAll` removes the dependency.

  Behaviour is otherwise unchanged: an identifier-safe key, a message without newlines, a normal
  base32 secret and a well-formed hook output all produce exactly what they produced before.

- 0e9e6dc: A human-in-the-loop tool call is one call on the wire again. A `@HumanInTheLoop` tool used to cross
  as TWO `tool-input-available` chunks under two different `toolCallId`s — the approval id the HITL
  plugin mints for its `approve/${approvalId}` callback, and the runtime tool-call id the SDK mints
  when it dispatches the tool. Neither producer can adopt the other's id: the SDK's `pre_tool_call`
  context carries `name`, `args`, `agentId` and `runId` and no call id at all, so the plugin has
  nothing to key on, and the approval has to be published before the tool exists.

  The translator correlates them now, so one logical call is announced once and its result carries the
  same id. `tool-approval-request` keeps the plugin's id in `approvalId` — the callback URL is
  unchanged and the same value still resolves the pause — and names the call it gates in `toolCallId`,
  which is what that field was always for.

  What this was costing: a consumer counting tool calls counted two, a UI grouping blocks by
  `toolCallId` rendered two cards for one call and left a permanently pending approval part next to the
  completed one, and the `agent.hitl` observability span opened on the approval id was never closed by
  a result arriving under the runtime id — so its duration approximated the whole run instead of the
  human's wait. That span now closes at the resume and carries `hitl.resume_observed: true`; the
  end-of-run sweep that marks the opposite is back to being the exceptional path it describes, reached
  when a pause genuinely never resumes (the client disconnected, the run failed mid-pause).

  Ungated tools are untouched — the correlation is identity for a call no approval ever claims.

- 4411a59: A web application can now render a human-in-the-loop approval prompt. `useAgent` returns
  `pendingApprovals` — one entry per decision the run is parked on, carrying the `approvalId` that
  `approve()` takes, the gated tool's name, the arguments it is about to run with, the question
  declared on the gate, and the window before it settles itself.

  Before this the hook exposed the settle half of the gate and no way to reach the other half. The
  store dropped the `tool-approval-request` frame on the way in, so its whole snapshot while a human
  was deciding was `messages`, `thread`, `status: 'streaming'` and `error` — and the paused tool sat in
  `state: 'input-available'`, which is exactly what an ungated tool looks like while it runs. An
  application could not tell "working" from "waiting for you", and could not have named the decision if
  it could. The only path left was polling `GET /api/agents/<name>/approvals` out of band.

  The transcript carries it too: the gated call's own part moves to `state: 'approval-requested'` with
  the id under `approval.id` while the decision is outstanding, and leaves that state when it is
  settled. That is the ai-sdk reader's own vocabulary, not a new one — the differential oracle compares
  the two readers on the paused run and the denied run and they reconstruct identically.

  What the gate is asking travels as a transient `data-approval` part rather than on the approval frame
  itself. The frame is shared vocabulary and `ai`'s validator for it is strict: a `question` added
  there would not give an ai-sdk client a poorer prompt, it would delete the whole approval frame for
  that client and re-create this defect on the other side of the wire. The tool's name and its
  resolved input are not repeated anywhere — the `tool-input-available` frame already announces both
  under the same call id, and both readers fold the frames into one part.

  `approve(approvalId, decision)` is unchanged; what changes is that the store now hands the id over.
  A tool with no gate produces exactly the same frames and exactly the same snapshot as before, with
  `pendingApprovals` empty.

- 3126e58: A tool that failed reaches the caller as a tool that failed.

  A tool whose handler threw — including one that threw on every attempt until its retries ran out —
  crossed the wire as `tool-output-available`, the SUCCESS part of the UIMessage protocol, with the
  error message sitting in the field a UI renders as the tool's answer, on a run that terminated with
  an ordinary `done`. Nothing on the wire told a failed call from a call that worked, so a consumer
  watching for a failure never fired, and a UI printed the failure as the result.

  The failure signal was in hand the whole time. `@theokit/sdk` catches whatever a handler throws and
  reports the call with `{stdout, stderr, exitCode}` — a non-zero code for a throw, a hook block, a
  human denial, a timeout or an unknown tool — under `status: 'completed'`, which is the SDK's word
  for "the call is over", not for "the call worked". Both translation sites read the status and
  hardcoded `isError: false`, and the timeline dedup then dropped the only report carrying the exit
  code as a duplicate of the report that structurally cannot carry one: the completion delta's payload
  is a rendered string, and the message carrying the code always arrives second.

  The exit code now travels. A failed call reaches the wire as `tool-output-error` with the message in
  `errorText` — the presenter branch that emits it already existed and was never reachable from a
  served run. A completion is held for one report rather than emitted immediately, so the second report
  can contribute its exit code to the first instead of being discarded; exactly one result per call
  still reaches the wire, and one that ends the run is flushed rather than held forever.

  A call that succeeded is unchanged, chunk for chunk: it emits `tool-output-available` with the same
  rendered output, under the same id, exactly once. A completion nobody reported an exit code for is
  not called a failure — the `[stderr]` prefix in the rendered text is a string convention, and
  classifying failures by matching error text is a mistake this codebase has already paid for once.

- Updated dependencies [bbdfc15]
- Updated dependencies [4411a59]
  - @theokit/presenter@0.8.0

## 10.1.0

### Minor Changes

- c227a8d: `LivenessVerdict` now carries the `cwd` it is about, so a caller can act on the verdict instead of parsing a sentence.

  `classifyProjects` PROBES a path to decide `alive` — it has it in hand at the moment it returns — and kept only a prose `reason`. That made the verdict unable to replace the function it was absorbed from: the consumer's GC uses the resolved cwd to consult the agent registry and the resumable pointer for that project (`all-sessions.ts:161,175`). Recovering it by string-matching `reason` would be exactly the fragile coupling this module exists to remove.

  `alive` reports the member of the collision class that was found to EXIST, not the first one read — the class can hold a gone path and a live one, and sending a registry lookup to the gone sibling defeats the point. `dead` reports the recorded cwd that was checked and found missing. `undetermined` established no path, so the field is absent rather than an empty string a caller might mistake for one.

  Additive and optional: no existing call site changes.

## 10.0.0

### Major Changes

- 4cd49ef: BREAKING: `deleteSession` and `runTranscriptGC` are now `async`.

  Their return type goes from `T` to `Promise<T>`. A caller that does not `await` reads `undefined`
  instead of the result and throws on the first field access — which is what happened to this repo's
  own `theokit agent sessions gc` command, unnoticed for a day because the workspace typecheck was
  measured against a stale `.d.ts`.

  The change is required rather than cosmetic: the only agent registry in the ecosystem is
  `Agent.delete(id): Promise<void>`, and the registry half of session deletion is unreachable without
  awaiting it. Migration is `await`.

  BREAKING: `SessionRegistryRemoverError` changes constructor arity and meaning. It was
  `constructor(sessionId)` for "you passed a thenable to a synchronous seam"; it is now
  `constructor(sessionId, timeoutMs)` for "the registry did not answer in time". The old condition no
  longer exists, so a `catch` that depended on it will never fire again. The class moved module and is
  re-exported from its old home, so import paths are unaffected.

  Also: the registry timeout now has a bounded DEFAULT (`DEFAULT_REGISTRY_TIMEOUT_MS`, 30s) where it
  previously waited forever. Unbounded remains available by passing a non-finite value.

### Minor Changes

- 7519927: Security: `auto-edit` no longer auto-approves from a framework-chosen default. A product declares its own set.

  `shouldAutoApprove`'s `auto-edit` branch defaulted to `WRITE_SCOPED_TOOLS` — `apply_patch`, `edit_file`, `write_file`. The only real consumer auto-approves one of those and registers two, so adopting the framework symbol would have made `edit_file` stop requiring a human: a live, model-callable write tool, silently un-gated as a side effect of deleting duplicated code.

  Two questions had been conflated. "Does this tool bound its own writes to a write root?" is a fact about the SDK's tool factories, and the framework can answer it. "May this tool run without asking a human?" is the product's policy, and the framework cannot answer it — it does not know which tools the product registered or what it renamed them to.

  `auto-edit` with no `writeScopedTools` now approves nothing, which is the same shape the module already applies to sandbox posture (an absent posture counts as unconfined). `WRITE_SCOPED_TOOLS` is still exported as the catalog; passing it is a decision rather than an inheritance.

  `WRITE_SCOPED_TOOLS` is now genuinely immutable — its mutators throw. `ReadonlySet` is erased at runtime, and one cast on an approval gate reachable from every consumer would widen what auto-approves everywhere. `Object.freeze` alone is not enough for a `Set`: entries live in internal slots, not own properties, so freezing leaves `add` working.

  Not a breaking change for published consumers: `npm pack @theokit/agents@9.4.0` exports neither `shouldAutoApprove` nor `WRITE_SCOPED_TOOLS`. Anyone already calling it on a pre-release build must pass `{ writeScopedTools }` to keep `auto-edit` approving anything.

- 0513d03: `deleteSession` re-checks protection immediately before unlinking, instead of trusting a snapshot taken before an await.

  The protection check ran at the top of the function; control then left for as long as the caller's registry remover took — 30s by default, unbounded with `registryTimeoutMs: Infinity` — and only then was the transcript removed. Anything concluded before that await is a snapshot, and a user resuming the session during the window makes it false. The file was deleted anyway and `SessionInUseError` never fired, which is the outcome that error exists to prevent.

  The batch path already treats this as non-negotiable: `transcript-gc.ts` invariant 4 is "the apply phase re-checks — a plan is a snapshot, and between snapshot and delete a user can resume a session". The single-session path skipped it, and it is the one with no later sweep to catch the mistake.

  `SessionInUseError` gains `registryRemoved`. Refusing after the registry half has run leaves an orphan file — the recoverable direction the function already chose in its ordering — but the caller has to be told, or it retries a removal that is already done and reads the resulting `false` ("no entry to remove") as a failure. The constructor parameter is optional and defaults to `false`, so existing construction sites are unaffected.

- 01735c7: `classifyProjects` (`@theokit/agents/session`) — answers "does the project behind `projects/<encoded>/` still exist?" without the caller writing the search itself.

  `minor`, not `major`, and the distinction was measured rather than assumed: `npm pack @theokit/agents@9.4.0` ships the `./session` subpath but contains neither `classifyProjects` nor `FsSeam`. This is a new export on an existing subpath, so the option and seam changes made while stabilising it break no published consumer — there is none. The only migration note that would be honest is the one for the consumer this was absorbed from, and it is written as adoption guidance below rather than as a break.

  The question is hard because `encodeProjectDir(cwd)` is `cwd.replace(/[^a-zA-Z0-9]/g, '-')` — one-way and many-to-one, so a directory name cannot be turned back into a path, only CHECKED against candidates. Every product that retains or garbage-collects transcripts has to answer it; the consumer's own version is 188 lines whose docstring measured 13,269 project directories, ~3,200 falling through to filesystem search and ~64M syscalls without a shared budget.

  Three properties carry the safety of this module, and each exists because dropping it produced a measured deletion of live data:

  - **The verdict is three-valued and `undetermined` is not a soft `dead`.** Callers DELETE on `dead`. Budget spent, unreadable directory, enumeration threw — all resolve to `undetermined`, because deleting on "could not tell" is data loss and the two errors are not symmetric.
  - **`FsSeam.exists` returns `boolean | undefined`.** The third state is in the return type rather than in prose because that is the only place an adapter author reliably reads it. A signature of `=> boolean` invites `try { return existsSync(p) } catch { return false }` — which is exactly the consumer's scar B-020, where a cwd that exists but cannot be stat-ed (EACCES on a non-traversable parent, ENOTDIR mid-path, EMFILE under a wide sweep) was classified DEAD.
  - **Every member of the collision class is probed, not the first match.** Because the encoding is many-to-one, `encodeProjectDir(cwd) === name` narrows to a CLASS, never to a path — `/home/op/my-app` and `/home/op/my/app` share one project directory. First-match-wins lets one record condemn the rest, and transcripts are user-writable, so that record can be PLANTED. Any live member now yields `alive`; `dead` requires every member to be definitively gone.

  **The budget is shared across the whole sweep, not per project.** A bound that resets each iteration is not a bound — that is what produced the 64M figure.

  Adoption (for a product that already wrote this search): supply `candidatePaths` returning REAL ABSOLUTE PATHS — not encoded directory names, which is the distinction that made 6 of 6 live projects classify `dead` while the two sides were being wired together — pass `projectsRoot` via the exported `projectsRoot()` rather than joining the segment by hand, and give `fs` an `exists` that returns `undefined` for every errno except ENOENT.

## 9.4.0

### Minor Changes

- 299a014: `createDelegateTool` — the agent can now ask the framework to delegate.

  `@theokit/agents/tools` handed the model 23 tools and none of them delegated to a local sub-agent.
  The capability shipped — `delegate()`, `delegateWithScoring()`, `delegateBackground()`, `Squad` —
  but only the app could reach it. `createA2ATool` did not cover the case: its target is a remote peer,
  inheriting none of the parent's tools, budget or authority.

  The factory is deliberately thin. `delegate()` already merges the parent's tools, clamps the budget
  and propagates authority; re-deriving any of that here would create a second owner of one rule.

  It refuses at construction what would otherwise fail on the model's first call: an empty roster,
  duplicate names (which collapse in the enum and dispatch silently to the wrong sub-agent) and a
  missing credential. Budget and timeout failures come back as JSON the model can act on rather than
  ending the parent's turn; an unexpected error propagates.

- d6a5928: `CustomCommand.frontmatter` carries the frontmatter lines, so a product can read its own keys.

  The loader knows one key (`description`). A product's commands declare more, and the sets do not
  agree: the closest consumer reads `model`, `agent`, `subtask` and `hints`, while Claude Code's custom
  commands declare `model` and `argument-hint`. Two vocabularies already, and neither is the
  framework's to adopt.

  Measured cost of not carrying them: that consumer wrote a 122-line loader — same directories, same
  trust gate, same precedence — because the result gave it nowhere to read its own keys from. The lines
  travel now, and `frontmatterValue` (already exported) reads whichever key the caller cares about.

- 7825605: `loadInstructionTree` takes an `order`, so a rules folder is walked the way a rules folder means.

  The predicate made a rules directory walkable and left the ordering the one an instruction TREE
  needs — every file at a level before descending, because there the outer file states the general rule
  and the inner one refines it. A rules FOLDER is the opposite shape: the files are peers, and the
  contract its users depend on is that the same directory assembles the same prompt on any machine, in
  one alphabetical pass.

  Half a capability is its own kind of defect: offering the walk without the order left a caller able
  to read a rules folder only in an order that misrepresents it.

  Additive — `'outward-in'` stays the default, so no existing caller shifts.

- c70eadb: `loadInstructionTree` now accepts a predicate for `fileNames`, so a rules DIRECTORY can be walked.

  `fileNames.includes(entry)` matched a basename, so the walk could only collect files the caller
  could name in advance. A rules directory is the opposite shape: the user drops arbitrarily named
  files in and expects all of them read. That is not one product's idiosyncrasy — Claude Code reads
  `.claude/rules/` and Cursor reads `.cursor/rules/*.mdc`, both arbitrary-name directories.

  Measured consequence of the gap: the closest consumer wrote its own 112-line walk — budget, depth
  ceiling, cycle guard and all — to ask `entry.endsWith('.md')`. The walk was ours; only the question
  was theirs.

  Additive: `fileNames` still accepts an array, with unchanged semantics.

- 339852d: `loadCustomCommands` reads subdirectories, so a namespaced command is no longer invisible.

  The loader stopped at `!statSync(path).isFile()`, which means a command in a subdirectory was not
  "unsupported" — it was invisible. No warning, no error: the file sits there and the command does not
  exist.

  Namespacing is not one product's idea. Claude Code reads `.claude/commands/frontend/component.md` as
  a namespaced command, and the closest consumer names nested files by their relative path for the same
  reason a flat directory stops scaling past a dozen commands.

  The name is now the path relative to the commands root with the extension removed
  (`frontend/component`). How it is rendered — `frontend:component`, `frontend/component` — stays the
  product's, because the two known products already disagree.

- b30fe9f: `projectsRoot(root?)` — one owner for where every project's transcripts live.

  `join(root, 'projects', …)` was written in three places: twice inside `project-index.ts`, and once in
  the closest consumer, which restated it as `join(transcriptRoot(), 'projects')` to enumerate every
  project for a GC sweep.

  The failure mode is what makes it worth a function rather than a comment. That consumer guards its
  enumeration with `existsSync(root) ? readdir(root) : []`, so a segment that stops matching does not
  throw — it returns an empty list. The sweep then finds nothing, deletes nothing, and reports success.
  A wrong path that throws is a bug report; a wrong path that returns nothing is a collector that
  quietly stopped collecting.

- e7c4d28: `InstructionBlock.scopesUnreadable` — a declared `paths:` that yields nothing is no longer
  indistinguishable from no scope at all.

  `parsePathsScope` reads lines and never fails, so a `paths:` whose value it cannot extract returned
  `[]` — the same value as a file that declared no scope. A consumer rendering `scopes` then turned a
  rule written for one subtree into a rule applying everywhere, and nothing said so.

  Widening a scope silently is the one frontmatter failure with a consequence: the model obeys a rule
  outside the files it was written for. The flag lets a product with a fail-closed policy drop the
  block instead of publishing it unscoped, and `onWarn` now reports the case.

### Patch Changes

- 6b15741: Frontmatter is read on CRLF files instead of being reported as never closing.

  `splitFrontmatter` split on `'\n'`, so on a CRLF checkout the closing line is `'---\r'`, which never
  equalled the fence: a perfectly valid file returned "frontmatter never closes" and was skipped. On
  Windows that is every instruction file with frontmatter, silently, with a warning blaming a missing
  `---` that is sitting right there.

  The trap ran one level deeper. `.` does not match `\r` and `$` does not match before it, so the
  list-item pattern behind `paths:` failed on `'  - src/**\r'`. Fixing only the fence would have
  turned "the file is skipped" into "the file is read and silently unscoped" — worse, because a rule
  that applies everywhere looks like it works.

  Line endings are now normalised at the boundary, and the closing fence is compared trimmed like the
  opening one already was — an asymmetry that let a file open a frontmatter block it could never close.

- b8f47a9: Two silent failures in the instruction-tree walk.

  `paths: [unclosed` produced the scope `unclose`. The inline branch did
  `inline.slice(1, inline.lastIndexOf(']'))`, and `lastIndexOf` returns -1 when the bracket never
  arrives — so the slice quietly dropped the last character and handed back a scope nobody wrote.
  Worse than an empty list, because a scope that exists suppresses `scopesUnreadable`: the block looked
  correctly scoped, to a path matching nothing, so the rule stopped applying anywhere and said nothing.

  The depth ceiling stopped in silence. The file ceiling already announced itself
  (`instruction budget: stopped at N files`) and this one was a bare `return false` — indistinguishable
  from a directory that had nothing left in it, which sends the reader looking for a typo in a filename
  that is spelled correctly.

- b023cef: `deleteSession` now refuses an async `removeFromRegistry` instead of reporting a delete that has not
  happened.

  The seam is synchronous by contract, and `options.removeFromRegistry?.(id) ?? false` sat at the
  return: hand it an async remover and the field evaluated to a Promise — truthy — so `registryRemoved`
  said the entry was gone before the removal occurred, and any rejection surfaced as an unhandled
  rejection. That is not a corner case. `Agent.delete` returns `Promise<void>` and is the only agent
  registry in the ecosystem, so every real caller has an async remover.

  The check now runs BEFORE the transcript is unlinked, so a refused call leaves the session intact and
  the caller can retry: await the registry removal first, then pass its outcome.

## 9.3.0

### Minor Changes

- **A tabela de prefixos passa a ter UM dono, e `providerFromApiKeyPrefix` e encaminhado.**

  A coerencia chave↔provider restatava os prefixos; agora ela PERGUNTA ao SDK
  (`providerFromApiKeyPrefix`, cuja ordenacao e derivada do comprimento). Uma segunda copia mantida a
  mao e exatamente o que produziu o bug de longest-prefix corrigido no `@theokit/sdk@4.52.0`, e a
  duplicacao so existia porque o simbolo estava exportado em runtime e ausente do `.d.ts` ate o
  4.52.1.

  `keyPrefix` no descritor continua, agora como escape hatch: um provider que o SDK nunca ouviu falar
  (um gateway self-hosted) ainda declara o proprio prefixo. E so um desacordo POSITIVO e recusado —
  `undefined` do SDK significa "nao reconheco a forma desta chave", que nao e contradicao.

  O simbolo tambem passa a ser encaminhado por `@theokit/agents/auth`. Quem surfaced o momento em que
  isso virou possivel foi o gate de paridade: `./auth` e o unico subpath sob gate DURO, e um export do
  SDK sem decisao escrita derruba o CI. Ninguem precisou lembrar.

## 9.2.1

### Patch Changes

- **O resolver passa a LER a credencial de chave de API que `writeCredential` escreve.**

  `writeCredential` persiste `{ provider, api_key }` no store, e o resolver lia de volta apenas a
  variante `oauth` — usava `readStoredOAuth`, que por construcao so responde uma delas. O framework
  conseguia GRAVAR uma chave que nada nele conseguia depois usar, e e por isso que o consumidor medido
  mantinha o proprio leitor de arquivo.

  Escrever sem conseguir ler e a mesma classe de defeito de uma capacidade que existe e nao se alcanca.

  A proveniencia diz `{ kind: 'file', path }` — "por que esta chamando a Anthropic?" precisa ser
  respondivel pelos dados, e "veio do store" e uma resposta diferente de "veio do ambiente". A
  coerencia chave↔provider e aplicada tambem aqui, e um provider que o app nunca declarou continua
  ignorado nas DUAS variantes.

  Achado ao tentar a migracao do consumidor, nao ao revisar o desenho.

## 9.2.0

### Minor Changes

- bb01ce8: **`resolveAgentCredential` — a montagem de autenticacao, para um app novo nao reescrever nenhuma.**

  O framework ja entregava as PECAS (store no 0600, device flow RFC 8628, refresh, `writeCredential`) e
  nao entregava a MONTAGEM. Medido no consumidor mais proximo: ele importa seis simbolos nossos e
  escreve ~250 linhas em cima, e nenhuma delas e sobre o dominio dele — sao a politica de resolucao que
  todo app de agente de terminal precisa e nenhum consegue importar.

  Adicionado:

  - **`DEFAULT_PROVIDERS`** — openrouter, anthropic, openai com variavel de ambiente, prioridade e
    prefixo de chave. O consumidor abre com TRES tabelas escritas a mao dizendo isto; agora um app novo
    nao escreve nenhuma. Prioridades espacadas de 10 para caber um provider entre dois padroes sem
    renumerar.
  - **`resolveAgentCredential({ env })`** — a chamada unica. Aplica os padroes e mantem todos
    sobrescreviveis: `providers` para estreitar (um produto que so fala com um provider) ou estender
    (um gateway self-hosted).
  - **O pin de provider** (`THEOKIT_PROVIDER` por padrao) que se RECUSA a cair para outro. Cair
    mandaria a requisicao — e a conta, e os dados — para um provider que o operador nao escolheu. Um
    typo no nome tambem e recusado: um erro de digitacao nao pode desligar o pin em silencio.
  - **Coerencia chave↔provider** via `keyPrefix`. `ANTHROPIC_API_KEY=sk-proj-…` e uma colagem na
    variavel errada, pega aqui de graca em vez de virar um 401 remoto cuja mensagem nao fala do
    desencontro.
  - **`requireCredential`** e `CredentialNotFoundError` carregando ONDE procurou. "Nenhuma credencial
    encontrada" sem a lista e a frase menos util que um CLI pode imprimir, e e por isso que o consumidor
    carregava a propria.

  `resolveCredential` segue devolvendo `undefined` — a forma nao-lancante e o que o caminho de primeira
  execucao quer, e `requireCredential` e o opt-in de quem nao pode continuar. Duas funcoes em vez de uma
  flag: a intencao fica visivel no call site.

  Os prefixos vivem aqui E no SDK (`providerFromApiKeyPrefix`), o que nao e ideal e esta guardado: um
  teste falha quando as duas tabelas discordam. Uma tabela so seria melhor, mas o simbolo do SDK esta
  exportado em runtime e AUSENTE do `auth/index.d.ts` (medido contra 4.52.0), entao um import tipado nao
  resolve. Guardado por CI em vez de esperado.

## 9.1.1

### Patch Changes

- **`readSecureJson` passa a recusar um store que outro usuario local pode ESCREVER.**

  `ensureSecureDir` segurava o diretorio em owner-only e a leitura entao abria o arquivo sem olhar o
  modo dele. Um `hook-approvals.json` deixado group- ou world-writable — por uma versao antiga, por um
  umask ruim, por quem tivesse acesso de escrita — era lido como autoritativo. Esse arquivo decide
  quais linhas de comando chegam ao `spawn(cmd, { shell: true })`.

  Falha FECHADA e reporta, em vez de lancar: um store ilegivel ja significa "nada aprovado", o turno
  do chamador nao deve terminar por causa disso, e `lastReadError` e como o operador descobre que as
  aprovacoes dele pararam de valer. Silencio tornaria um store adulterado indistinguivel de um vazio.

  Recusado em vez de reparado: apertar o modo em silencio esconderia que algo o mudou, que e o fato
  que importa saber.

  Achado por um teste do consumidor (B-019) falhando enquanto ele migrava para este helper.

## 9.1.0

### Minor Changes

- **`HookApprovalStore.approvals(scope)` — os registros, nao so os fingerprints.**

  `approvedFingerprints` responde "quais hashes estao aprovados aqui", que e o que `buildHookHandlers`
  precisa e mais nada. Uma tela de consentimento precisa dizer QUAL comando foi aprovado e quando — e
  o consumidor medido mantem a propria store exatamente por isso: sem os registros, adotar a nossa
  custaria a tela dele.

  `ApprovalRecord` passa a ser exportado pela mesma razao. Devolve copias, nao o mapa interno: um
  chamador que mutasse o retorno mudaria o que o proximo `stateOf` responde sem nunca escrever em
  disco.

## 9.0.1

### Patch Changes

- **`TrustStore` passa a garantir o modo do DIRETORIO, nao so o do arquivo.**

  Ela chamava `mkdirSync(dir, { recursive: true })` sem modo e sem reparo. O argumento `mode` e um
  NO-OP num diretorio que ja existe, e este diretorio e compartilhado com a raiz de transcricoes do
  SDK — quem cria primeiro define as permissoes. Resultado medido: o diretorio que guarda o arquivo
  que autoriza execucao de comando ficava em 0775 por umask, ou em 0777 se o SDK o criara assim.

  Os dois stores irmaos deste pacote (`HookApprovalStore`, `PermissionStore`) ja passavam por
  `ensureSecureDir`, que faz chmod e depois AFIRMA, exatamente por causa desse no-op. Tres stores no
  mesmo pacote, todos gateando execucao; dois impunham a propriedade e um nao.

  Achado por um teste do consumidor falhando durante a migracao, nao por leitura do nosso codigo — a
  mesma forma dos outros achados desta serie.

## 9.0.0

### Major Changes

- **`HookApprovalStore` passa a escopar aprovacoes por PROJETO. `scope` e obrigatorio.**

  BREAKING: `approve`, `revoke`, `stateOf` e `approvedFingerprints` recebem o diretorio do projeto.

  O store chaveava so pelo fingerprint, o que torna uma aprovacao valida na maquina inteira: um hook
  aprovado trabalhando num repositorio ficava pre-aprovado ao abrir outro que a pessoa acabou de
  clonar. O consumidor medido chaveia por `hooks[canonicalDir(dir)][fingerprint]` exatamente por isso —
  e nao conseguia adotar este store sem ALARGAR a propria postura de seguranca, que e a unica direcao
  que uma absorcao nunca pode tomar.

  A lacuna apareceu ao TENTAR a migracao, nao ao revisar o desenho. Ela nao e de formato de dados: e
  uma propriedade de seguranca que faltava aqui e existia la.

  `scope` e OBRIGATORIO, pela mesma razao que `approved` e obrigatorio em `buildHookHandlers` — um
  portao de seguranca opcional e um portao que alguem esquece, e esquecer este roda o comando de shell
  de um estranho porque foi aprovado em outro lugar. Manter a assinatura antiga como sobrecarga
  deixaria o caminho global disponivel, que e justamente o defeito.

  O escopo e canonicalizado com `realpath`, a mesma regra de `PermissionStore` e `TrustStore`: `/repo`
  e `/repo/` sao um diretorio e duas strings, e sem isso o operador aprova uma vez e e perguntado de
  novo no mesmo projeto — que e como se aprende a aprovar sem ler.

  `modified` continua distinguivel de `unknown` DENTRO do projeto. Num projeto que nunca aprovou nada
  nao ha aprovacao por tras da qual algo possa ter mudado, entao a resposta la e `unknown`.

## 8.7.0

### Minor Changes

- **`PermissionStore` — conceder "sempre permita isto" sem conceder "permita tudo".** Medido por
  grep nos dois lados: nada persistia uma concessao permanente para tools. A unica saida era o
  `full-auto`, que remove o portao em vez de estreita-lo — e a decima aprovacao da mesma coisa e
  onde a pessoa para de ler o que aprova, o que faz da opcao "segura" a que produz comportamento
  inseguro. A chave `(tool, scope, signature)` E a propriedade de seguranca: o escopo passa por
  `realpath` (um symlink nao toma emprestado concessao feita para outro lugar) e a assinatura nunca
  e casada por aproximacao (`npm test` nao autoriza `npm test --force`).

- **`HookApprovalStore` — o portao de fingerprint ganha um produtor.** `buildHookHandlers` exige
  `approved` e nega por padrao; o framework entregava o portao e nada que produzisse o conjunto,
  deixando ao consumidor duas saidas — aprovar tudo, ou escrever o store. Tres estados, nao dois:
  `modified` (alguem editou um comando DEPOIS de aprovado) e um evento diferente de `unknown`.

- **`@theokit/agents/config` — configuracao de agente, trust e arvore de instrucoes ganham porta
  propria.** Estavam alcancaveis so por um barrel que anuncia a propria remocao, num pacote que o
  consumidor nao instala. Foi por isso que um consumidor reescreveu 533 linhas e reintroduziu a
  falha de contencao de symlink que `assertNoSymlinkEscape` existe para fechar.

- **O pacote publicado passa a levar prosa.** O tarball entregava `dist/`, `LICENSE` e
  `package.json`. O README estava declarado em `files` e **nao existia em disco** (o npm omite o
  declarado-e-ausente em silencio); o CHANGELOG existia e nao estava declarado.

- **`resolveCredential` passa a produzir a variante `oauth`.** O tipo publicado declarava
  `'api-key' | 'oauth'` e todo caminho de retorno construia `'api-key'`. Uma variante declarada e
  improduzivel e pior que ausente: o consumidor escreve o `case 'oauth':` que nunca roda.

- **A protecao de ponteiro do GC de transcricoes fica injetavel.** Ela derivava a protecao da
  convencao DESTE framework; para um consumidor cujo ponteiro de sessao viva mora em outro lugar, a
  guarda era inerte — em silencio, dentro de algo que apaga transcricoes. A injecao so ADICIONA
  protecao, nunca remove, e um provedor que lanca falha FECHADO.

### Patch Changes

- **Duas escritas simultaneas no store de consentimento podiam disputar o mesmo arquivo
  temporario.** O nome saia de relogio + pid; medido, doze escritas de um mesmo processo produziam
  UM nome, e o segundo `rename` de um temp ja renomeado lanca `ENOENT`. Chamadas sincronas numa
  unica thread serializam e nunca colidem — por isso a suite estava verde —, mas `worker_threads`
  compartilham pid. O nome agora sai de `randomUUID()` e a unicidade e asserida diretamente.

- **`forkBeforeUserTurn` estava publicado quebrado.** Discriminava por `role`, que no
  `SessionRecord` do SDK mora aninhado sob `message.role`; o campo de topo e `type`. Toda chamada
  lancava. Junto, uma guarda para o caso de a sessao de origem e a nova coincidirem.

- **Um observador de hook herdado que falhasse desaparecia sem deixar rastro.** Nao derrubar o turno
  esta certo; sumir em silencio nao — um notificador que nunca dispara le igual a um que nao tem
  nada a reportar.

- **Um membro delegado passa a herdar o veto do supervisor.** A ordem e a propriedade de seguranca:
  a recusa do pai e avaliada primeiro, e o membro so pode ADICIONAR motivo para recusar.

## 8.6.0

### Minor Changes

- `transform_tool_result` roda UMA VEZ POR TOOL CALL, nao uma por lote, e o payload passa a ser o
  mesmo formato dos irmaos: `{ tool, name, args, result }`.

  A primeira versao mandava o lote inteiro como `{ tools: [...] }` — um TERCEIRO formato, num modulo
  cujos outros dois handlers mandam `{ tool, args, ... }`. Um script de hook escrito contra os irmaos
  nao conseguia ler, e um hook que decide sobre "qual tool, com quais argumentos" quer uma chamada
  por vez de qualquer forma.

  `name` e alias de `tool`, e e deliberado em vez de redundante: scripts de hook moldados na
  convencao do Claude Code leem `.name`, e esses scripts estao no disco de usuarios. Mandar so uma
  chave e quebrar todos eles seria mudanca de formato disfarcada de refactor.

  Um hook SEM matcher continua rodando uma vez mesmo com o lote vazio — e o que "sem matcher"
  significa, e `.some()` sobre array vazio dizia o contrario.

  **Nota de proveniencia:** o codigo desta mudanca entrou no repositorio junto com o `8.5.2`, porque
  o comando que faria o bump de versao foi bloqueado e o commit do codigo nao. Durante algumas horas
  o fonte e o `8.5.2` do registry divergiram sob o mesmo numero — a mesma deriva que o
  `@theokit/http@1.0.0` teve e que esta sessao passou a caçar. Esta versao e o que fecha.

## 8.5.2

### Patch Changes

- Duas regressoes no `transform_tool_result` que estreou no 8.5.0. As duas eram minhas, e as duas
  foram encontradas pelos testes que ja existiam num produto — nao por revisao.

  **Um hook SEM matcher parava de rodar quando o lote de tool calls estava vazio.** A checagem era
  `ctx.toolCalls.some(...)`, e `.some()` sobre array vazio e `false` — entao um hook que pediu para
  ver TUDO nao via nada no momento em que nao havia nada com que casar. Agora um hook sem matcher
  roda sempre; com matcher, a regra de casar por qualquer chamada do lote continua.

  **Os ARGUMENTOS da tool nao chegavam ao payload.** Eu mandava so os nomes. O produto que motivou
  este milestone ja tinha corrigido esse mesmo defeito na copia dele, com a razao escrita: um hook
  conseguia ver QUAL tool rodou e o resultado dela, e nunca com o que ela foi chamada. Uma guarda que
  nao le os argumentos nao consegue decidir sobre eles. Agora vao `{ name, args }`.

  Os dois casos entraram como teste aqui, com contra-prova — sem elas, "rodar sempre" satisfaria o
  primeiro e apagaria o matcher.

## 8.5.1

### Patch Changes

- Republicacao do 8.5.0 a partir do fonte commitado. Nenhuma mudanca de comportamento — os mesmos 37
  testes do motor de hooks passam nos dois.

  O 8.5.0 foi publicado a partir de uma arvore de trabalho cujo commit o `lint-staged` recusou
  (`buildHookHandlers` tinha passado do teto de 120 linhas). Corrigi extraindo dois construtores de
  handler e commitei — mas o `dist` no registry ficou sendo o de ANTES da extracao.

  Isso e a mesma deriva que o `@theokit/http@1.0.0` teve e que custou uma investigacao inteira: fonte
  e registry divergirem sob o mesmo numero de versao. Um patch e mais barato que deixar a divergencia
  de pe.

## 8.5.0

### Minor Changes

- Tres eventos passam a ser CONECTADOS de verdade: `transform_tool_result`, `on_session_start` e
  `post_assistant_reply`. O motor sai de dois handlers para cinco.

  `transform_tool_result` e o que o par `pre`/`post` nao consegue expressar: um hook que le o
  RESULTADO de uma tool e anexa feedback que o modelo depois ve. Era o unico evento cujo retorno o
  SDK consome, e era declarado, aceito pelo schema e nunca construido.

- **`continuationBudget` deixa de ser inerte.** Ele e `DEFAULT_CONTINUATION_BUDGET` estavam
  exportados e **lidos por nada** — um `grep` achava a declaracao e nenhum uso. Um knob que o
  chamador pode ajustar e que nunca faz nada le como funcionalidade, que foi o motivo do M74 ter
  REMOVIDO quatro. Este nao foi removido: implementar `transform_tool_result` e exatamente o que lhe
  da um trabalho, porque feedback anexado e o que permite um hook se realimentar. O orcamento e o que
  para o laco.

  Os dois observacionais sao FAIL-OPEN sem excecao: disparam depois do fato, e um notificador
  quebrado nunca pode ser o motivo de um turno concluido ser descartado.

  Restam tres eventos sem consumidor pedindo (`transform_llm_output`, `on_session_end`,
  `pre_user_send`). Eles seguem cobertos pelo aviso do 8.4.0 — construi-los seria superficie que
  ninguem pediu.

## 8.4.0

### Minor Changes

- Um hook declarado num evento que este motor **nao conecta** agora AVISA, em vez de nao fazer nada
  em silencio.

  `HOOK_EVENTS` publica oito nomes e `hookSpecSchema` aceita os oito — mas `buildHookHandlers` so
  conecta dois: `pre_tool_call` e `post_tool_call`. Medido sobre os oito: **seis nao produziam
  handler nem aviso**.

  O efeito: um operador escreve `on_session_start` no arquivo de hooks, ele passa no parse, ganha
  fingerprint, e a pessoa aprova — e nunca dispara, sem nada dito. O docblock deste modulo proibe
  exatamente isso, escrito sobre um evento COM ERRO DE DIGITACAO; o mesmo silencio cobria seis
  corretamente escritos.

  Conectar os outros seis e trabalho de verdade. Dizer que eles nao existem e um `if`, e e a metade
  que nao podia esperar.

  Apareceu tentando migrar um consumidor real, que conecta quatro eventos — incluindo um
  `transform_tool_result` com orcamento de continuacao proprio, que este motor nao tem.

## 8.3.0

### Minor Changes

- `buildHookHandlers` aceita `onVeto` — chamado quando um hook `pre_tool_call` VETA uma chamada,
  para que uma superficie possa dizer isso ao usuario.

  O sinal precisa sair dali. Um veto bloqueia a chamada e entrega ao modelo uma mensagem para ele se
  corrigir, e no fio isso e deliberadamente indistinguivel de um resultado de tool comum — o SDK
  documenta assim. Entao uma superficie nao consegue reconhecer um veto observando o stream; este e o
  unico ponto que sabe que houve um.

  Sem ele, um consumidor que mostra "um hook bloqueou isto" precisava manter a copia inteira deste
  builder so para disparar uma notificacao. Era exatamente o caso medido numa migracao real.

  Dispara tambem no veto por ESTOURO DE ORCAMENTO da cadeia. Omitir ali faria a superficie reportar
  todo bloqueio menos o causado por lentidao — que e o que um operador mais precisa ver nomeado.

  **Opcional, e nao e default de seguranca:** o veto bloqueia de qualquer forma. Isto decide apenas
  se alguem e informado — uma superficie headless nao tem a quem contar.

## 8.2.0

### Minor Changes

- `buildHookHandlers` aceita um `fingerprint` opcional — como um spec vira a chave conferida contra
  `approved`. O default continua sendo o nosso `hookFingerprint`.

  A lacuna apareceu numa migracao real, nao em hipotese. Um consumidor chegou com um store de
  aprovacoes JA EM DISCO, chaveado pelo esquema dele (projecao JSON com chaves ordenadas e prefixo
  `sha256:`), enquanto o nosso junta os campos com U+001E e emite hex cru. Os dois sao solidos; sao
  diferentes — o mesmo hook gera dois valores.

  Com a funcao fixa no codigo, o `approved` daquele consumidor nao casava com nada e **todo hook era
  recusado**. Nao um crash: um aviso por hook e silencio depois, que e a pior forma que uma regressao
  de seguranca pode ter.

  A alternativa era migrar os dados do store de aprovacoes — e uma migracao pela metade re-pergunta
  ao operador por hooks que ele ja aprovou. Re-perguntar tudo e como um usuario aprende a aprovar por
  reflexo, que e exatamente o que este gate existe para impedir.

  **O que NAO muda:** `approved` continua obrigatorio, um set vazio continua recusando tudo, e o
  default continua o nosso. Injetar a funcao decide como um hook e NOMEADO, nunca se o gate se
  aplica — e ha teste para os dois lados.

## 8.1.0

### Minor Changes

- Os tres erros do canal de pergunta (`ConcurrentQuestionError`, `ConcurrentListenerError`,
  `QuestionAbandonedError`) passam a carregar um `code` estavel:
  `question_already_pending`, `listener_already_attached`, `question_abandoned`.

  Eles ja eram tipados e ja diziam o que fazer — mas sem `code`. `name` e string de exibicao; `code`
  e o que um `switch` consome e o que sobrevive a minificacao. Os erros irmaos deste mesmo pacote
  (`DELEGATION_TIMEOUT`, `DELEGATION_FAILED`) sempre tiveram um; estes tres sairam sem, e apareceu
  quando um consumidor migrou da propria copia e encontrou `undefined`.

  O teste que deveria ter pego se chamava `test_every_error_is_a_TheokitAgentError_with_a_stable_code`
  e verificava `name` e a mensagem — nunca o `code`. Agora verifica os tres.

## 7.6.0

### Minor Changes

- M67 — the config/trust/wiring family crosses the layered boundary, and the `@theokit/sdk` floor
  rises to `^4.49.0` to make that possible.

  **Installation-contract change.** `theokit` and `@theokit/presenter` publish `@theokit/sdk` as a
  `peerDependency`; raising the floor means a consumer pinned below 4.49.0 will now fail peer
  resolution. Sized as a minor because the API is additive — nothing removed or renamed — but the
  peer floor is a real break at install time and is named here rather than left to be discovered.

  Six values (`foldLayers`, `verifyLayerOrdering`, `applySecurityFloor`, `resolveTrustPosture`,
  `auditEnvReachability`, `recordWiring`) and two types (`WiredEntity`, `ToolResultContentBlock`)
  now cross. Four more arrived with the floor: `classifySessionArtifact` + `SessionArtifact`,
  `atomicWriteTempTarget`, `writableRootsFor`, `assertSecureModes`. Plus the five root-bar typed
  error classes the `/errors` subpath never reached: `LayerOrderError`, `ToolError`,
  `GenerateObjectError`, `StreamObjectError`, `UngatedCapabilityError`.

  M68 (in progress) additionally crosses the trust vocabulary — `TrustLevel`, `TrustSource`,
  `TrustPosture`, `TrustPostureInput`.

  **Why 7.6.0 and not 7.5.0.** The first attempt at this release computed 7.5.0, which was already
  published on 2026-08-10 with different content. `workspace` had never received the back-merge from
  `main` after that release, so two already-consumed changeset files were still sitting there and
  changesets recomputed them on top of a stale base. Publishing would have put a different artifact
  under a version that already exists.

## 7.5.0

### Minor Changes

- 762c446: Forward `onRunEvent` through the in-process turn. The HTTP path threaded the SDK's typed `RunEvent` sink since theokit#132; the in-process entry point declared no field for it, so an embedded surface could not observe any run event. Additive — absent, the key is omitted and the SDK call is byte-identical to before.
- 92b962a: `ToolsetError` now extends `TheokitAgentError` instead of `Error`.

  It sat outside the SDK's error hierarchy, so `catch (e) { if (e instanceof TheokitAgentError) }` —
  the shape consumers use to tell an SDK failure from any other throw — missed it, leaving name or
  message matching as the only way to recognise it. A consumer reported writing a `translateError()`
  shim for precisely that.

  This layer had already settled the same argument in M61, when two `ConfigurationError` classes (one
  `extends Error`, one `extends TheokitAgentError`) made an `instanceof` check catch one path and
  silently miss the other. Same defect, same package, simply left standing here.

  `code` remains a public readonly field and `name` is unchanged, so existing
  `new ToolsetError(msg, 'unknown_tool')` calls and `err.code` reads keep working. It is still
  `instanceof Error`, via `TheokitAgentError`.

## 7.4.0

### Minor Changes

- 2cae085: `@theokit/agents/auth` now lets the OAuth engine cross over: `ensureFreshCredential`,
  `persistOAuthTokens`, `refreshOAuthTokens` and `extractAccountId`.

  M73 opened the credential-store mechanics and M110 opened the RFC 8628 device flow. What sits
  **between** them — exchanging a device grant for tokens, refreshing before expiry, persisting the
  result, knowing which account the tokens belong to — had no door. Since consumers have an unbreakable
  rule never to import `@theokit/sdk*` directly, the only legal way out was to reimplement; that is
  what happened, for the third time in this same subsystem.

  Pure pass-through (same reference as the SDK, locked with `toBe`), by the criterion M73 fixed: these
  are stateless I/O functions.

  `resolveCredential` deliberately stays out, and now has a test proving it — two functions share that
  name with divergent semantics (sync vs async, throws vs `undefined`, reads env vs does not), and
  exposing both in one scope invites importing the wrong one, silently.

## 7.3.1

### Patch Changes

- Updated dependencies [a6dd4c1]
  - @theokit/presenter@0.5.0

## 7.3.0

### Minor Changes

- A bridge consome UMA timeline ordenada do SDK — o merge de duas fontes acabou (#140).

  Antes, ela fundia `onDelta` (tokens e ciclo de vida de tool, sem `run_started`/`system`) com um
  `run.stream()` pós-conclusão (mensagens completas, em lote). Nenhuma das duas era completa sozinha,
  então todo o aparelho de dedup existia só para reconciliá-las — e essa reconciliação é de onde saíram
  o #47 (ordem), o #138 (namespace de `callId`) e o fallback de timestamp.

  `sdk-adapter-merge.ts` (221 linhas) foi deletado; `sdk-timeline.ts` (137) o substitui. Foram junto a
  fila assíncrona, o sink de delta, `mergeDeltaStream`, `MergeState` — e a dedup **por comparação de
  conteúdo**.

  Sobrevive uma dedup de tool **keyed por id** (`callId` + `modelCallId`), e ela não é resíduo: só o
  delta carrega `modelCallId`, e só a mensagem reporta um erro de tool que o delta apenas abriu.
  Preferir uma das fontes perde os casos da outra em silêncio. Comparar texto era a doença; comparar
  ids não é.

  Nada muda no que o consumidor recebe: os mesmos `StreamEvent`s, na mesma ordem. O que muda é de onde
  eles vêm — e que a classe de bug que produziu #47 e #138 deixa de ser representável.

  Requer `@theokit/sdk >= 4.40.0` (já declarado como dependência direta deste pacote).

## 7.2.0

### Minor Changes

- `setDiagnosticsSink` e o tipo `DiagnosticsSink` passam a ser exportados pelo barril (#173).

  Um consumidor cuja fronteira de camadas proíbe importar `@theokit/sdk` diretamente não tinha como
  instalar um sink: o canal existia e era inalcançável de dentro da fronteira. Reexport puro, sem
  semântica nova — o silêncio-por-padrão do SDK continua sendo a postura certa para uma biblioteca, e
  **onde** escrever segue sendo decisão do consumidor.

  ```ts
  import { setDiagnosticsSink } from '@theokit/agents'
  setDiagnosticsSink((m) => process.stderr.write(m + '\n'))
  // retry 1/3 in 431ms — RateLimitError (Retry-After: 400ms)
  ```

  Acompanha o `@theokit/sdk@4.39.2`, que é o release em que esse canal passou a funcionar de fato: até
  o 4.39.1 o registro do sink era um singleton **por instância de módulo**, então com duas cópias do
  SDK na árvore o sink instalado aqui caía num registro diferente daquele em que o emissor escreve — o
  símbolo resolvia, nada lançava, e nenhum diagnóstico chegava.

## 7.1.0

### Minor Changes

- O TheoKit passa a ser dono do wire `UIMessageStream`: instalar `theokit` não traz mais o `ai`.

  Schema, parser e reconstrutor vivem em `@theokit/presenter/wire`. **O formato da frame não muda** —
  um cliente ai-sdk continua conversando com um servidor TheoKit, e nenhum app existente precisa
  migrar. `ai` deixa de ser `peerDependency`; quem o declarava só por causa do TheoKit pode removê-lo.

  Por que **minor** e não major: nada que um consumidor faz deixa de funcionar. Remover um peer é
  relaxamento, não quebra; os tipos são estruturalmente compatíveis (medido: as declarações do ai-sdk
  não têm brand), então código que ainda importa de `ai` segue compilando. O `@theokit/presenter` ganha
  `zod` como peer — a única exigência nova, e ele está em 0.x.

  Correções que vêm junto, todas de defeitos que existiriam em qualquer parser de wire escrito sem
  elas:

  - O frame terminal `data: [DONE]` não é JSON. Sem guarda, um parser quebraria no **último frame de
    toda resposta**.
  - Terminadores CRLF/CR passam a ser normalizados. Sem isso, um proxy que os reescreve produzia
    silêncio total — nem erro, nem renderização.
  - Um erro de provider no meio do stream preserva o texto já entregue e só então falha.

  `ai` permanece como `devDependency`: um teste diferencial alimenta o mesmo stream nele e no nosso
  parser, exigindo saída idêntica variante por variante. É o que torna a reimplementação verificável
  em vez de uma aposta.

### Patch Changes

- Updated dependencies
  - @theokit/presenter@0.4.0

## 7.0.0

### Major Changes

- Dois re-exports mudam de nome, acompanhando o `@theokit/sdk@4.39.0`.

  - `@theokit/agents/persistence`: `sessaoTemEscritor` → `sessionHasWriter`
  - `@theokit/agents/sandbox`: `detectBwrapMemoizado` → `detectBwrapMemoized`

  Os dois nomes eram portugueses e atravessavam a camada verbatim. O SDK os traduziu
  ao tornar seu código inglês-only, e a camada **não guarda alias**: um alias manteria
  o identificador português vivo na superfície publicada, que é justamente o que a
  mudança existe para remover. Quem importa qualquer um dos dois renomeia na chamada;
  o comportamento é idêntico.

  Junto vem o bump de `@theokit/sdk` 4.27.0 → 4.39.0, com doze correções pedidas deste
  repo — entre elas `run.stream()` deixando de terminar em silêncio quando o run falha
  (#101), `Agent.describe()` reportando os subagents que o runtime de fato resolve
  (#123), `mcpLifecycle: 'session'` mantendo o servidor MCP vivo entre turnos (#155) e
  as embeddings de `azure-openai`/`cohere`/`gemini` passando a funcionar (#128, #159).

  Atenção a uma quebra de **comportamento** herdada do SDK: as diagnostics agora são
  silenciosas por padrão. Sem um sink instalado a biblioteca não escreve no terminal —
  antes ia direto ao stderr e corrompia o frame de qualquer TUI. Para restaurar:
  `setDiagnosticsSink((m) => process.stderr.write(m))`.

## 6.4.2

### Patch Changes

- **Correção de segurança.** O release anterior repassava a entrada do `.mcp.json` como veio do arquivo,
  em vez de montá-la a partir dos campos declarados. Isso deixava o `envPolicy` atravessar — e ele é o
  campo que decide se o processo do servidor MCP herda o ambiente **com** ou **sem** as variáveis
  sensíveis do host. Um `.mcp.json` (arquivo de projeto, versionado) podia declarar `envPolicy: "all"` e
  entregar chaves de API do ambiente a um binário de terceiro.

  Agora a entrada é montada por allowlist, ramo a ramo: `command`/`args`/`env`/`cwd` no stdio,
  `url`/`type`/`headers`/`auth`/`requestTimeoutMs` no remoto. Campo desconhecido não atravessa —
  inclusive um que o SDK venha a criar. `envPolicy` fica de fora deliberadamente: é decisão de postura do
  host, e o SDK a aceita do código que constrói o agente, onde um humano revisa.

  **E o aviso deixou de poder sumir.** `onWarn` continua opcional, mas quando omitido os avisos vão para
  `stderr` em vez de para lugar nenhum — antes, um chamador que não assinasse o canal descartava entradas
  em silêncio absoluto.

## 6.4.1

### Patch Changes

- a432fda: Os tipos de configuração de servidor MCP passaram a alcançar a raiz do pacote. Estavam em `types.ts` e
  não chegavam ao `index.d.ts` — na prática, o consumidor conseguia _usar_ um servidor remoto mas não
  conseguia **nomear** o tipo do mapa que `loadMcpJson` devolve, que é metade do problema que o release
  anterior resolveu. `McpServerConfig`, `McpServersMap`, `McpStdioServerConfig`, `McpHttpServerConfig`,
  `McpAuthConfig` e `McpOAuthConfig` agora atravessam.

## 6.4.0

### Minor Changes

- f950538: Um servidor MCP que o carregador não entende deixou de derrubar os que ele entende, e o transporte
  remoto passou a atravessar.

  Antes, um `.mcp.json` com um servidor stdio perfeitamente válido e um vizinho que o parser não
  reconhecia produzia `McpFileError` — e **os dois** eram perdidos. Fail-closed no raio errado: recusar
  _uma entrada_ é correto; recusar _o arquivo_ transforma "esse servidor não é suportado" em "você não
  tem MCP nenhum".

  Agora o raio é a entrada:

  ```jsonc
  {
    "mcpServers": {
      "local": { "command": "npx", "args": ["servidor"] },
      "remoto": { "type": "http", "url": "https://…/mcp", "headers": { "Authorization": "…" } },
    },
  }
  ```

  Os dois sobem. Uma entrada inválida é **omitida e NOMEADA** pelo canal `onWarn` — o erro continua
  tipado e visível, apenas deixou de ser fatal para os vizinhos. Um arquivo **impartível** (JSON quebrado,
  `mcpServers` que não é objeto) continua lançando: ali não há entradas para separar.

  **Nenhuma dependência nova.** O transporte remoto já era do SDK — `McpServerConfig` é
  `McpStdioServerConfig | McpHttpServerConfig`, com `type`/`url`/`headers`/`auth`/`requestTimeoutMs`.
  Este pacote declarava um tipo **mais estreito** e recusava o que o runtime aceita; agora re-exporta o
  do SDK. `McpAuthConfig`, `McpHttpServerConfig`, `McpOAuthConfig` e `McpStdioServerConfig` passaram a
  atravessar junto.

  **Mudança de contrato:** `loadMcpJson` deixa de lançar em defeito de entrada. Quem dependia disso
  recebe a entrada omitida e um aviso no `onWarn` opcional; o comportamento em defeito de **arquivo** é
  o mesmo de antes.

  O valor de `headers` nunca entra num aviso — a mensagem descreve a **forma** do campo, nunca o
  conteúdo.

## 6.3.1

### Patch Changes

- 8847d94: Testes do device provider endurecidos após review: o override de `clientId` por ambiente
  (`CODEX_CLIENT_ID_ENV_VAR`) ganhou oráculo — antes era API pública documentada com zero teste, e
  remover a leitura da variável mantinha tudo verde. Um teste que não invocava nenhum símbolo de
  produção (passava com o pacote deletado) foi removido; a cobertura real do caso vive no consumidor.
  Nenhuma mudança de comportamento.

## 6.3.0

### Minor Changes

- e7d99d9: O device flow **RFC 8628** atravessa a camada, e o do Codex também.

  `@theokit/sdk` já implementava o padrão (`deviceLogin`, `requestDeviceCode`, `pollDeviceToken`,
  `DeviceOAuthConfig`), e `@theokit/agents/auth` não re-exportava nenhum deles. Como o consumidor tem
  regra inquebrável de nunca importar `@theokit/sdk*` direto, quem precisasse do padrão tinha duas
  saídas: violar a fronteira, ou reimplementar o protocolo — exatamente a situação que o M73 já
  documentou neste arquivo (_"a lacuna era daqui, não indisciplina de lá"_).

  Medido junto: `openaiDeviceLogin` era **importado** para uso interno do `AuthProvider` e nunca
  re-exportado. Consequência — o flow do Codex só era alcançável construindo um `AuthProvider` (que
  exige `config` + `store`). Ele atravessa agora também.

  As duas formas **coexistem e não são unificadas**: `DeviceOAuthConfig` tem um `deviceCodeEndpoint`
  (RFC); `OpenAIDeviceConfig` tem dois (`deviceUsercodeEndpoint` → `devicePollEndpoint`, com PKCE).
  Fundi-las quebraria o Codex.

  Pass-through **puro**, pelo critério que o M73 escreveu: são funções de I/O sem estado a segurar, e
  envolver quebraria `instanceof`. `tests/unit/auth-parity.test.ts` trava a identidade dos quatro com
  `toBe`.

- 18fa6ef: Autenticar por device flow passa a caber numa chamada, e um provider novo entra sem editar a camada.

  Antes, quem usava `@theokit/agents/auth` para autenticar no Codex precisava saber que existem **duas**
  formas de device flow, copiar o `clientId` e três URLs da OpenAI para dentro do próprio código, montar
  `{ fetch, sleep, now }`, chamar `deviceLogin` e **lembrar** de chamar `persist` — e esquecer o último
  custava um round-trip OAuth completo que não guardava nada.

  Agora:

  ```ts
  import { CODEX_PROVIDER, loginWithDevice } from '@theokit/agents/auth'

  const [metodo] = CODEX_PROVIDER.methods // rotulado, para a sua UI mostrar
  const { path } = await loginWithDevice(CODEX_PROVIDER, metodo, store, { onPrompt })
  ```

  Um provider de terceiro usa a **mesma** chamada: basta construir um `DeviceAuthProvider` com os seus
  métodos. Nada na camada muda.

  **Novos símbolos:** `CODEX_PROVIDER`, `loginWithDevice`, `CODEX_CLIENT_ID_ENV_VAR`, e os tipos
  `AuthMethod`, `DeviceAuthProvider`, `PromptHooks`, `LoginWithDeviceOptions`.

  `AuthMethod` é união discriminada — um método `type: 'oauth'` **tem** de carregar `authorize`, e o
  compilador recusa `{ label, type: 'oauth' }`. Não há discriminante de protocolo: cada método aponta
  para a sua própria função, então o RFC 8628 e a variante da OpenAI coexistem sem `switch` e sem risco
  de serem fundidas.

  `deps` é opcional; `AuthProvider.deviceLogin` e `.persist` continuam públicos para quem precisa da
  granularidade. Nenhum símbolo existente mudou de assinatura.

## 6.1.1

### Patch Changes

- M107 (review HIGH-2) — require `@theokit/sdk@^4.37.0`, not `^4.36.0`.

  `6.1.0` shipped with `^4.36.0`, so a fresh install could resolve `4.36.0` — where `Agent.list`
  **silently ignores the `cwd` it advertises**. That is not a cosmetic mismatch: a consumer that
  narrows a listing by workspace to decide which sessions are still active would get the _process_
  directory's answer instead, and this project consumes exactly that list to protect transcripts from
  deletion.

  The range now names the version that actually honours the contract. Nothing else changed; `6.1.0`
  and `6.1.1` are byte-identical apart from this field. Consumers already resolving `4.37.0` (through
  an override or a fresh install) were never affected.

## 6.1.0

### Minor Changes

- 3575c8e: Two additions: `loadMcpJson(cwd)` reads the `.mcp.json` project convention from disk, and `reasoningEffortOf(model)` reads back the reasoning effort that `buildModelSelection` writes.

  **`loadMcpJson(cwd)`** — the layer already shipped the rare MCP cases (`resolveMcpServers` for per-request selection, `mcpRegistry` for a known provider) and not the common one: reading `<cwd>/.mcp.json`, the convention Claude Code and Cursor established. Every application that wanted it wrote the loader by hand, which is why the same 120-odd lines of read-parse-validate exist in more than one consumer.

  It returns the `McpServersMap` the package already exports — no new type. An **absent** file returns `{}`, because MCP is opt-in and a project without the file is a project without MCP. A **present but broken** file throws `McpFileError` naming the path: a read failure, invalid JSON, a root that is not an object, a server without a non-empty `command`, or an `args`/`env`/`cwd` of the wrong type. A valid JSON object with no `mcpServers` key returns `{}` — that is a project declaring no server, not a malformed file. An empty (0-byte) file is invalid JSON and throws, deliberately: "absent" and "present and empty" are different situations, and treating the second as `{}` would disable MCP in silence.

  `McpFileError` descends from `TheokitAgentError`, so `isTransientError` classifies it like every other error from this package (`isRetryable` is `false` — a malformed config file does not improve on retry).

  **Scope, so it is not a surprise later:** stdio servers only. HTTP/SSE entries are not accepted in this release. Widening it later is additive and breaks nothing written against this version.

  **`reasoningEffortOf(model)`** — the inverse of `buildModelSelection`, which is documented as the single site that maps a reasoning effort onto a `ModelSelection`. Only the write half was public, so callers that needed to read the effort back re-derived the parameter key by hand. Two spellings of one key drift apart quietly; now both directions live in one module and share one constant.

  It accepts a bare model id or a full selection, and returns `undefined` when there is no effort to read — a string id, a selection without parameters, or parameters that do not include the reasoning key. None of those throw: absence is a normal answer, not a failure. A value that is present but not one of the documented levels comes back **verbatim**, and the return type is `string | undefined` for exactly that reason: validating the value stays with the caller, and typing the result as the effort union would promise a check this function does not perform.

  Both symbols are reachable from the package root and from `@theokit/agents/bridge`.

## 6.0.0

### Major Changes

- 24c8011: **BREAKING:** `Agent.list` no longer accepts `limit` or `cursor`, and its result no longer declares `nextCursor`.

  The SDK's type promises all three; the runtime references none of them — `Agent.list` reads only `options.runtime`. A caller that writes `limit: 500` against a 688-entry registry believes it asked for a bounded page and silently gets the whole set, and on the day the runtime starts honouring the parameter that _same_ line silently gets a truncated one instead. Both directions are silent, and the consumer that motivated this change feeds the result into a NEVER-delete guard of a session garbage collector: a truncated list there means deleting a transcript the guard should have protected.

  This is a type-only change — the exported value is still the SDK's `Agent`, asserted by identity in `tests/unit/agent-list-narrowed.test.ts`. Every other static (`create`, `getOrCreate`, `get`, `delete`, `archive`, `unarchive`, `rename`, `compact`, `listRuns`, `getRun`, `registry`) keeps its shape, asserted in `tests/type/agent-list-narrowed.test-d.ts`.

  Migration is one line per call site: delete the `limit`/`cursor` property. The result is the full population, which is what the runtime was already returning.

  Exit criterion, written in `src/index.ts` next to the narrowing: when the SDK runtime actually honours `limit`/`cursor`/`cwd`, delete the block and restore the plain re-export.

## 5.0.0

### Major Changes

- 6aa5b6d: **BREAKING:** `toAgentFactory` now requires an `approvals` option declaring the surface's `ApprovalPosture` — one of `interactive`, `auto-approve`, `auto-reject` or `owned-by-surface`.

  Until now the factory compiled the HITL gate map that `.approvals({…})` produces and then discarded it, so tools declared as requiring approval executed with no policy consulted — while the sibling bridge (`streamAgentTurnInProcess`) refused for the same definition. The permissive behaviour is still fully available; it just has to be named, with a written reason, instead of happening by omission. Migration is one line per call site: pass the posture that describes what your surface actually does.

  `streamAgentTurnInProcess` also accepts `approvals`, but additively — omitting it preserves today's fail-closed refusal exactly.

## 4.30.2

### Patch Changes

- O mapeamento de erro do SDK para o evento de stream ganha módulo próprio.

  Um mapeador puro, com o mesmo tratamento que a seleção de modelo já tinha. Ter casa própria também deixa óbvio que existe **um** lugar construindo o evento de erro — antes era um objeto literal dentro de um `catch`, e era exatamente ali que o código do erro se perdia.

## 4.30.1

### Patch Changes

- Re-exporta a consulta que responde se uma sessão já tem escritor, sem tomar a trava.

## 4.30.0

### Minor Changes

- O chunk de erro do stream passa a carregar o código do erro, não só o texto.

  Uma falha de runtime não sobe como exceção para quem consome o stream — é convertida num chunk de erro, e esse é o contrato. Mas o chunk levava **só a mensagem**, então um consumidor que precise distinguir a falha (por exemplo, derivar uma sessão nova quando a original já tem escritor) não tinha alternativa senão casar texto de mensagem de erro. O código sempre existiu no evento de origem; ele só não atravessava. Um erro sem código continua exatamente como antes.

## 4.29.1

### Patch Changes

- Corrige um turno que quebrava quando a janela de contexto era declarada na seleção de modelo.

  A versão anterior passou a **aceitar** a seleção completa em `AgentBuilder.model()` e parou aí: o caminho de runtime por onde todo turno passa continuava assumindo um id em texto, e aninhava a seleção dentro de si mesma. O resultado era uma falha em **todo** turno de quem declarasse a janela. Passar um id continua funcionando exatamente como antes, e a janela declarada agora sobrevive à conversão.

## 4.29.0

### Minor Changes

- `AgentBuilder.model()` aceita `ModelSelection`, não só o id cru.

  A implementação do SDK sempre aceitou as duas formas; era a fachada tipada desta camada que estreitava para `string`. O estreitamento tornava **inalcançável** qualquer campo da seleção — incluindo a janela de contexto que o SDK passou a publicar. Passar um id continua funcionando exatamente como antes.

## 4.28.0

### Minor Changes

- M94 — re-exporta os resolvedores que o SDK passou a publicar.

  - `transcriptRoot` — a raiz do estado de transcript, que honra `THEOKIT_HOME`. O consumidor a duplicava em três arquivos, e as três cópias ignoravam a variável junto com a original.
  - `TranscriptMessage` / `TranscriptBlock` — a forma do corpo de um registro de sessão, que antes era `Record<string, unknown>` e obrigava o consumidor a recuperar o tipo com cast a cada leitura.

  `Provider.forModel` já atravessa a camada pelo re-export existente de `Provider`.

## 4.27.1

### Patch Changes

- 191aef8: **Correções da revisão adversarial do M92 — dois BLOCKERs e três furos de eviction.**

  - **O `concat` que o `4.27.0` prometeu e não entregou.** O `#prefixo` era um **alias** do `#committed`
    (mesma referência) e o `#emit` continuava espalhando: byte-idêntico ao anterior, medido em ~2 µs @400.
    Agora é um `concat` único. O ganho é de constante, não de ordem — e é honesto dizer isso.
  - **O coalescing não tinha teste capaz de falhar.** Substituir o corpo inteiro de `#agendarEmit` por
    `return` deixava **580/580 verdes**: os testes instalavam timers falsos e nunca os avançavam, e só
    exercitavam `reset()`, que faz flush síncrono por decisão. Os testes novos dirigem 30 deltas por um
    transporte falso e medem a razão de emits — **32 contra 2**, e o mutante mata 2 testes.
  - **Três furos na eviction de aprovação, todos medidos:**
    - Sinal **já abortado** no `sendMessages` não dispara `addEventListener`, então uma aprovação que
      estacionasse depois ficava pendente para sempre — o travamento que o milestone existe para fechar,
      alcançável por outro caminho. Agora o sinal é consultado **no momento em que a aprovação estaciona**.
    - O turno era lido de um **campo compartilhado**, então um runner do turno 1 estacionando depois do
      `send` do turno 2 nascia etiquetado turno 2 e o abort do turno 1 não o alcançava. O turno passou a
      viver num **closure por turno** — o único lugar onde não é sobrescrito.
    - Rejeitar sem handler mata o processo em Node ≥ 15; o caminho tem teste.

## 4.27.0

### Minor Changes

- f486258: **O stream ganha coalescing opt-in, e o transporte para de vazar aprovação estacionada.**

  - **`AgentClient` cacheia o prefixo commitado.** `#committed` só muda em dois lugares (o `done` de
    `send()` e o `reset()`), então reconstruí-lo por delta de token era trabalho que a estrutura já
    garantia inútil. Honestidade sobre o tamanho: medido, o spread custa **0,0062 ms por delta @400
    mensagens** — 3,1 ms no turno inteiro. É real e é micro.
  - **Coalescing opt-in: `new AgentClient(transport, ctx, { emitIntervalMs })`.** Sem o campo, emite por
    delta como sempre. É aqui que está a ordem de grandeza: o que pende de cada emit é a derivação da
    timeline, medida em **3,274 ms por chamada** no mesmo tamanho de thread — **≈ 528×** o spread. O
    coalescing não torna o emit mais barato; faz **menos emits acontecerem**. As transições de status
    (`done`/`error`/`abort`) fazem **flush síncrono**, porque um estado final preso num timer de 16 ms é
    um estado final perdido se o processo sair antes.
  - **`InProcessTransport` evicta aprovação de turno abortado**, rejeitando com `ApprovalAbortedError`.
    Antes, `#pending` guardava só o `resolve` e nada apagava a entrada: a promessa ficava pendente **para
    sempre** e a chamada de tool do SDK pendurava com ela. Uma promessa que nunca resolve **nem** rejeita
    é a forma mais silenciosa de engolir um erro — nem stack trace existe. Rejeitar e não `resolve(false)`
    porque `false` é indistinguível de _"o usuário negou"_: negar é decisão, abortar é interrupção. As
    entradas passaram a ser chaveadas por turno, então um `send()` novo varre o anterior.

## 4.26.2

### Patch Changes

- 379e5c0: **Restaura a compatibilidade que o `4.26.0` quebrou em silêncio: `BudgetExceededError` volta a ser a
  classe de DELEGAÇÃO no barril raiz.**

  O `4.26.0` **reaproveitou** o nome — o barril passou a exportar a classe do SDK (orçamento de JANELA)
  sob `BudgetExceededError`. Medido contra os tarballs publicados:

  |                                                   | 4.25.1   | 4.26.1                                           |
  | ------------------------------------------------- | -------- | ------------------------------------------------ |
  | `new BudgetExceededError('agente', 5, 1)` da raiz | funciona | `TypeError: Cannot read properties of undefined` |
  | raiz `===` `/bridge`                              | `true`   | `false`                                          |

  Para quem estava em `^4.25` com `catch (e) { if (e instanceof BudgetExceededError) … }`, o ramo de
  orçamento de delegação **deixou de casar, em silêncio** — o modo de falha exato que o rename existia
  para matar, em espelho, e publicado como MINOR.

  Agora: `BudgetExceededError` é o alias `@deprecated` de `DelegationBudgetExceededError` — mesma
  identidade referencial de sempre, zero quebra. A classe do SDK atravessa como
  `WindowBudgetExceededError`, que fecha a lacuna original **sem redefinir o que um nome significa**.
  Travado por `tests/unit/erro-de-dominio.test.ts`, que assere `barril.BudgetExceededError` **é** a
  classe de delegação e que as duas são classes distintas.

## 4.26.1

### Patch Changes

- 228d423: Corrige o tipo de `SdkAgentHandle.send` introduzido no `4.26.0`: ele devolve
  `Promise<SdkTurnHandle>`, não `SdkTurnHandle`.

  `SDKAgent.send` é `(message, options?) => Promise<Run>`, e o `GoalLoopAgent` do SDK declara
  `send(prompt): Promise<{ wait(): … }>`. A primeira versão do tipo era síncrona — e o detalhe é que o
  `tsc` do consumidor **não teria pegado**, porque o adaptador que este milestone existe para apagar
  (`runner-facade.ts`, com um `as never` na origem) absorvia exatamente essa diferença.

  É a divergência que o docstring daquele adaptador descrevia, reencontrada ao tentar removê-lo — a
  prova de que o `unknown` não era só feio: ele desligava a checagem no ponto onde o contrato importa.

## 4.26.0

### Minor Changes

- 3fb0d9e: **Contratos de tipo honestos: a camada passa a devolver o tipo que já sabe.**

  - **`toAgentFactory` aceita um THUNK de definição** — `(sessionId) => AgentDefinition`. O parâmetro
    `apiKey` já aceitava thunk desde o M74, adicionado por exatamente esta razão; a assimetria custava
    caro: com a forma objeto, trust, hooks, skills e MCP são compilados no load do módulo e ficam
    **congelados para o processo inteiro**. Num `theokit acp` que uma IDE mantém aberto por horas, isso
    reintroduzia a obsolescência que o M67 removeu. A forma objeto continua **byte-idêntica** — projeta
    uma vez, fora do closure; só o thunk paga por sessão.
  - **`SdkAgentHandle.send` deixa de ser `=> unknown`** e passa a `(msg, opts?) => { wait(): … }`, com
    `SdkSendOptions`/`SdkTurnHandle` publicados. O `unknown` custava ao consumidor um módulo inteiro de
    38 linhas cujo único trabalho era re-estreitar este retorno — e o docstring daquele módulo registra
    que, antes dele, o chamador escrevia `as never`, sob cuja capa a superfície goal divergiu do agente
    real por vários milestones.
  - **`Toolset` é a primitiva que faltava** (`@theokit/agents` barril). Coleção nomeada e imutável com
    política de resolução que falha alto em nome **desconhecido** e em **duplicado** — nos dois casos, o
    silêncio seria uma mudança de autoridade não observável, que é o que uma whitelist existe para
    impedir. **Não prefixa namespace**: o nome de uma tool é contrato com o modelo. Não constrói tools —
    quais e com que escopo é decisão do consumidor.
  - **`BudgetExceededError` → `DelegationBudgetExceededError`**, com alias `@deprecated` por uma major.
    O nome antigo **sombreava** a classe homônima do SDK (orçamento de JANELA contra orçamento de
    DELEGAÇÃO), e como o consumidor tem regra de nunca importar `@theokit/sdk` direto, ele nunca
    alcançava a do SDK: `instanceof` casava com o domínio errado **em silêncio**. O barril agora exporta
    as duas. A `lacuna` registrada em `subpath-coverage.test.ts` saiu junto com o conflito que a criou.

## 4.25.1

### Patch Changes

- 5167910: **Corrige uma regressão de superfície introduzida no `4.25.0`: `TruncationMode` voltou a ser exportado
  por `@theokit/agents/tools`.**

  A entrada do `4.25.0` afirma _"172 símbolos, superfície preservada inteira (nada sai)"_. Isso era falso:
  o gerador de re-exports rodou contra uma cópia local de `@theokit/sdk-tools@0.26.0` (92 exports)
  enquanto o registro já publicara `0.26.1` (93, com `TruncationMode`). O peer é uma faixa flutuante
  (`>=0.24.1 <1.0.0`), então consumidores instalavam a versão nova e perdiam o símbolo: sob `export *` ele
  atravessava; enumerado a partir da cópia velha, sumiu. A entrada anterior não pode ser editada, então
  a correção fica aqui.

  O gate que deveria ter pego isso era **vacuo para `/tools` e `/pty`** — 98 dos 173 símbolos, 57% da
  superfície. Ele comparava _a fonte_ contra o snapshot, e nunca _a camada_ contra a fonte; remover
  símbolos reais desses dois entries deixava a suíte inteira verde. `tests/unit/subpath-surface.test.ts`
  passa a enumerar o `dist/*.d.ts` **emitido** e a comparar nas duas direções (nada da fonte falta na
  camada; nada na camada é inventado), e deixa de engolir a ausência de `dist/`, que o fazia passar por
  vacuidade num clone sem build.

  Superfície agora: **173 símbolos** (`tools` 93, `sandbox` 36, `persistence` 29, `pty` 6,
  `interactive` 9).

## 4.25.0

### Minor Changes

- 9aea11c: Os cinco subpaths de infra (`/tools`, `/sandbox`, `/persistence`, `/pty`, `/interactive`) deixam de ser
  alias e viram camada.

  Até aqui, o corpo inteiro de cada `*-entry.ts` era uma linha `export *`, e o `dist/*.d.ts` emitido
  carregava a mesma coisa: o pacote emprestava o nome sem interpor decisão. Um rename upstream se
  propagava verbatim, **sem erro de build aqui**, e o consumidor descobria em call site.

  Agora os cinco enumeram — **172 símbolos**, superfície preservada inteira (nada sai; reduzir seria
  breaking, e a regra do `auth-entry.ts` desde o M73 é que enriquecer nunca reduz). Medido lado a lado no
  mesmo cenário de rename: com `export *` o build passa; com lista nomeada, `tsc` reprova com `TS2724` e
  sugere o nome novo.

  Acompanham a mudança um snapshot da superfície sobre `dist/*.d.ts`
  (`tests/unit/subpath-surface.test.ts`) e a promoção dos três subpaths de SDK em
  `subpath-coverage.test.ts` de `cobertura: 'amostra'` com lista **vazia** para `'total'`.

## 4.9.1

### Patch Changes

- O retry com backoff do refresh de OAuth passa a existir de fato no caminho de execução. As funções que
  classificam a falha e calculam a espera estavam presentes e testadas, mas nenhuma era chamada — uma
  reescrita de bloco as desconectou, e os testes que existiam validavam o classificador isolado, o que
  não prova que ele está ligado. Uma falha transitória agora é repetida até três vezes; `invalid_grant`
  continua falhando na primeira, porque repetir um token revogado só atrasa a mensagem.

## 4.9.0

### Minor Changes

- `toAgentFactory` também aceita um resolvedor de credencial (`() => string | Promise<string>`), resolvido
  quando a sessão é criada.

  A 4.8.0 alargou `AgentRunnerRunOptions.apiKey`, que é um seam real — mas não é o que as superfícies de
  consumidor usam. Um cliente ACP, um loop autônomo e uma delegação de time constroem o agente por
  `toAgentFactory`, e ali a credencial continuava sendo uma string obtida antes. O alargamento sem este
  complemento não alcançava nenhuma das três.

## 4.8.0

### Minor Changes

- `AgentRunnerRunOptions.apiKey` passa a aceitar um resolvedor (`() => string | Promise<string>`) além do
  valor. Ele é chamado quando o stream começa, não quando o agente é construído.

  O ponto de injeção já era por run; o que travava era o tipo. Com `string`, quem chama precisa ter o
  valor em mãos antes — então o momento era por run, mas o valor era obtido antes e congelado, e um
  bearer OAuth de validade curta atravessava a run inteira sem ser reconsultado. Uma sessão de IDE que
  dura horas, um loop autônomo de vinte turnos e uma delegação de time longa exibem o mesmo sintoma.

  `string` continua válido e continua sendo o caminho de quem usa chave de API: ela não expira, e exigir
  um resolvedor ali seria cerimônia sem ganho.

  O refresh de OAuth passa a rodar sob lock entre processos, com releitura depois de adquiri-lo — sem a
  releitura o lock apenas serializa, e o segundo processo refresca com estado velho, invalidando o token
  que o primeiro acabou de gravar. Como o lock não é reentrante e o resolvedor agora é chamado de dentro
  do stream, há um single-flight em processo antes dele: uma execução aninhada resolve pela promise em
  voo em vez de disputar o arquivo consigo mesma.

  Falhas de refresh passam a ser classificadas: rede e 5xx são repetidos com backoff e jitter,
  `invalid_grant` falha na primeira tentativa. Repetir um token revogado só atrasa a mensagem que o
  usuário precisa ler. A mensagem de erro nunca carrega material de token.

## 4.7.0

### Minor Changes

- `@theokit/agents/auth` passa a re-exportar a mecânica de store do `@theokit/sdk/auth` como
  pass-through puro: `credentialHome`, `authFilePath`, `CredentialError`, `readAuthFile`,
  `readStoredOAuth`, `writeCredential` e o tipo `ResolveCredentialOptions`.

  O subpath exportava um valor e seis tipos contra os dezenove símbolos do SDK — nenhuma função
  atravessava. Para um consumidor que não pode importar `@theokit/sdk*` direto, reimplementar era a
  única saída legal; um deles reescreveu seis destes nomes. A camada existe para enriquecer, e enriquecer
  nunca deve reduzir.

  Pass-through puro, e não wrapper: são funções de I/O sem estado a segurar, e envolvê-las quebraria
  `instanceof` para quem captura `CredentialError`. O novo `check:auth-parity` exige decisão escrita por
  símbolo do SDK — coberto, ou fora de escopo com a razão — para que a lacuna não se repita em silêncio.

  `resolveCredential` deliberadamente não atravessa: o SDK e o consumidor têm funções diferentes com
  esse nome, e o próprio SDK declara a precedência de env e a inferência de provider como política do
  consumidor.

## 4.6.0

### Minor Changes

- M63 — close the `SDK → Theokit → AgentBuilder` boundary: the main barrel now also re-exports
  `SubAgent` (the a2a delegation primitive, `SubAgent.create()`) and the pure `path-safety` helpers
  (`assertNoSymlinkEscape`, `isForbiddenPath`, `safePathJoin`). Same PASS-THROUGH doctrine as the M58
  core re-exports (parsimony Rung 9 — already the target OO/pure shape, wrapping would be ceremony), so
  a consumer can import ITS full runtime surface from `@theokit/agents` without touching `@theokit/sdk*`
  directly. Additive only — no existing export changes.

## 4.5.0

### Minor Changes

- `@theokit/agents/tools` — pass-through of the `@theokit/sdk-tools` factory surface (M62).

  The consumer imports its ready-made built-in tools (`createReadFileTool`, `createShellTool`, … +
  `withName`/`withDescription`) from the Theokit layer instead of `@theokit/sdk-tools` directly. Pure
  re-export, never enriched (parsimony Rung 9 — the sugar is the SDK-tools' own; wrapping it would be
  reinventing, blueprint Q5). A surface test locks the 16 symbols the consumer uses. `@theokit/sdk-tools`
  stays an OPTIONAL peer (only consumers of this subpath need it) and its range moves to `>=0.20.0` —
  the newer tool factories (`createCurrentTimeTool`/`createInteractiveShellTool`/`createUpdatePlanTool`/
  `createWriteStdinTool`) live there.

## 4.4.0

### Minor Changes

- ee9fb7b: Unify `ConfigurationError` on the SDK's class (M61).

  `@theokit/agents` used to define its own `ConfigurationError extends Error` while `@theokit/sdk`
  shipped a separate `ConfigurationError extends TheokitAgentError`. A `catch (e instanceof
ConfigurationError)` caught one throw path and silently missed the other. The layer now RE-EXPORTS the
  SDK's class, so authoring throws (`@theokit/agents`) and runtime throws (`@theokit/sdk`) are the SAME
  class — `instanceof` holds across the boundary in both directions. Existing single-arg
  `new ConfigurationError('msg')` calls are unchanged (the SDK options are optional); the class stays
  `instanceof Error`. Decision in `knowledge-base/adrs/0006-configuration-error-unification.md`.

## 4.3.1

### Patch Changes

- M60 follow-up: `AuthProvider.ensureFresh(resolved, deps, env)` — the HTTP deps and `env` are now
  separate params (was a single `opts` bag). Corrects the just-shipped 4.3.0 shape before any consumer
  depends on it; behavior (delegation to `ensureFreshCredential`) is unchanged.

## 4.3.0

### Minor Changes

- `AuthProvider` — the OO OAuth-lifecycle contract at `@theokit/agents/auth` (M60).

  The SDK ships OAuth as free functions stateful across a shared config + store
  (`openaiDeviceLogin` → `persistOAuthTokens` → `ensureFreshCredential`). The Theokit layer now unifies
  them into an `AuthProvider` class that HOLDS the `config`+`store` and delegates each step, so a
  consumer authors `new AuthProvider(config, store).persist(...)` / `.ensureFresh(...)` instead of
  threading the shared state through every call. Enrich, not pass-through (auth carries state); it
  DELEGATES, never reimplements (Rung 9) — login → persist → refresh yields identical state. SECRET-SAFE
  by contract: the wrapper never logs or emits token material (pinned by a secret-safety test). The auth
  domain's types (`OAuthProviderConfig`/`CredentialStoreConfig`/`OpenAIDeviceConfig`/`ResolvedCredential`/
  `OAuthTokens`/`DeviceDeps`) are re-exported alongside it.

## 4.2.2

### Patch Changes

- fb89c9e: Fix: the goal domain types (`GoalEvent`/`GoalLoopAgent`/`GoalOptions`/`GoalResult`) are now actually
  re-exported from the top-level barrel (the M59 re-export was only reachable from the loop submodule).

## 4.2.1

### Patch Changes

- 87fa3bb: Re-export the goal domain's types alongside `GoalRunner` (M59 follow-up).

  `GoalEvent`, `GoalLoopAgent`, `GoalOptions`, `GoalResult` now travel with `GoalRunner` from
  `@theokit/agents`, so a consumer types against the goal surface entirely from the Theokit layer
  without reaching back to `@theokit/sdk`.

## 4.2.0

### Minor Changes

- 7e37347: `GoalRunner` — the OO twin of the SDK's free `runGoalLoop` (M59).

  The layered boundary continues: the SDK ships goal orchestration as a free function
  (`runGoalLoop(agent, goal, options, deps)`); the Theokit layer now imposes its OO shape with a
  `GoalRunner` class parallel to `AgentRunner`, so a consumer authors `new GoalRunner(agent).run(goal,
options)` instead of a bare call. Unlike the M58 pass-through barrels, this ENRICHES an orchestration
  primitive with a contract — but it DELEGATES, never reimplements (parsimony Rung 9): `run` forwards
  verbatim to `runGoalLoop`, so the emitted `GoalEvent` stream and the final `GoalResult` are identical.
  A parity test pins that both ways (exact forwarded tuple + identical stream/result).

## 4.1.0

### Minor Changes

- dd044c1: Pass-through barrels for the 5 already-OO / pure SDK domains (M58).

  The layered boundary `SDK → Theokit → AgentBuilder`: `@theokit/agents` now re-exports the SDK domains
  that are already object-oriented or pure helpers, so a consumer imports them from the Theokit layer
  instead of `@theokit/sdk*` directly. Re-export, never a wrapper (parsimony Rung 9) — wrapping
  `Agent.create()` or a pure `transcriptPath()` would be ceremony without value.

  - **core** (main barrel): `Agent`, `Squad`, `Tool`, `Provider` + `SDKAgent` / `CustomTool` /
    `SessionRecord` types.
  - **`@theokit/agents/sandbox`**: `LocalSandbox`, `SandboxBackend`, `SandboxConfig`.
  - **`@theokit/agents/persistence`**: `transcriptPath`, `encodeProjectDir`, `atomicWriteText`,
    `SessionRecord`.
  - **`@theokit/agents/interactive`**: `InteractiveBackend`, `StartInteractiveOptions`,
    `StartInteractiveResult`.
  - **`@theokit/agents/pty`**: `PtyInteractiveBackend` (optional peer `@theokit/sdk-pty` — only consumers
    of this subpath need it installed).

  A surface test locks each barrel's symbols so a dropped re-export fails loudly. The `@theokit/sdk`
  peer range moves to `^4.19.0` — the `/interactive` and `/sandbox` subpaths this layer re-exports live
  there. Consumers already on SDK 4.19+ are unaffected.

## 4.0.0

### Major Changes

- fcd1536: Authoring surface is now 100% object-oriented (M57) — the free "sugar" factories are gone.

  The ~14 free capability factories and the two free builders are replaced by classes and static
  factories, finishing the `X.create()` migration `@theokit/sdk` completed at v3.0. One idiom, aligned
  with the runtime this layer wraps.

  **BREAKING — mechanical 1:1 rename, no behaviour change:**

  ```ts
  // before                          // after
  memory(x)                          new MemoryCapability(x)
  skills(x)                          new SkillsCapability(x)
  contextWindow(x)                   new ContextWindowCapability(x)
  checkpoint(x)                      new CheckpointCapability(x)
  subAgents(x)                       new SubAgentsCapability(x)
  projectContext(x)                  new ProjectContextCapability(x)
  mcpServers(x)                      new McpServersCapability(x)
  guardrails(x)                      new GuardrailsCapability(x)
  humanInTheLoop(x)                  new HumanInTheLoopCapability(x)
  skillsOptions(x)                   new SkillsOptionsCapability(x)
  settingSources(x)                  new SettingSourcesCapability(x)
  plugins(x)                         new PluginsCapability(x)
  runContext(x)                      new RunContextCapability(x)
  skillsResolver(x)                  new SkillsResolverCapability(x)
  agent()                            AgentBuilder.create()
  contextualTool(t)                  ContextualTool.of(t)
  ```

  The nine pure-assignment capabilities share a `FieldCapability` base (one line each); the five that
  carry behaviour (validation / delegation / merge / storage-metadata warning) keep the exact body.
  `AgentBuilder` / `ContextualTool` are each a type (generic interface) and a value (static factory) at
  once — the fluent type-state chain is unchanged.

  Zero-behavior: the deterministic suite (608) and type suite (104) pass without editing a single
  expectation after repointing call-sites. Reverses ADR 0001 § 4; rationale in
  `knowledge-base/adrs/0005-sugar-to-oo.md`.

## 3.0.0

### Major Changes

- 0e4ea93: Inject a custom loop stop-criterion via `AgentRunnerBuilder.loopStrategy(custom)` (M54).

  **MAJOR — type-level break.** `LoopStrategy.name` changed from the `'simple-chat' | 'plan-act-reflect' | 'react'` union to `string`. A consumer doing an exhaustive `switch (strategy.name)` over the three literals (no `default`) will now fail to typecheck — `string` is not exhausted by three cases. There is no runtime-only semver policy in this repo, so a source-breaking type change takes a major bump (M54 review F-3).

  The runner already let you inject reflection, compaction, and the round stream factory; the stop
  criterion (`LoopStrategy.shouldContinue`) was the one axis locked to three built-in names. Now:

  ```ts
  const stopWhenConfident: LoopStrategy = {
    name: 'confident',
    maxIterations: 8,
    shouldContinue: (o) => !o.responseText.includes('confidence: high'),
  }
  AgentRunner.fromSpec(spec).loopStrategy(stopWhenConfident).build()
  ```

  The injected strategy WINS over the strategy the spec's name would resolve to, exactly as
  `.compaction()` outranks the spec.

  **The ceiling is now the runner's guarantee, not each strategy's convention.** Previously the three
  built-ins embedded `round < maxIterations` inside their own `shouldContinue`, so a custom that never
  returned `false` would loop forever. The runner now caps every strategy at `maxIterations` — a
  `shouldContinue: () => true` terminates at the ceiling with `finishReason: 'step_limit'`.

  **Type change (note):** `LoopStrategy.name` is now `string` (was the `'simple-chat' |
'plan-act-reflect' | 'react'` union) so a custom can name itself freely. The internal resolver still
  validates the three built-in names via Zod; a custom never passes through it. Code that reads
  `strategy.name` expecting the exhaustive union should widen to `string`.

## 2.0.0

### Major Changes

- 96c0b05: Remove the backward-compatibility concessions the previous release carried (M56).

  **BREAKING — `ToolboxCapability.compile()` deleted.** It had zero callers anywhere and was kept only
  because removing a public method breaks consumers. `apply()` is the one path an agent's tools flow
  through. If you called `compile()` directly, apply the capability instead:
  `applyCapabilities([new ToolboxCapability(...)])`.

  **`ConfigurationError` is still exported from the package root — only the internal duplicate
  re-export was removed.** It used to reach the barrel through a compat shim in
  `capability/capabilities.js`; M56 removes the shim and pins the class to the barrel directly, so
  `import { ConfigurationError } from '@theokit/agents'` keeps working. Only a deep import from the
  internal `capability/capabilities.js` path — never a documented entry point — is affected. A
  `public-api-surface` test now locks the root export in place.

  Also in this release: the two `compileTools` failure paths that threw a bare `Error` (missing toolbox
  instance, non-method handler) now throw the typed `ConfigurationError` the rest of the module uses, so
  an authoring mistake is distinguishable from an unexpected runtime failure.

## 1.1.0

### Minor Changes

- Tool names are now validated where they are minted, against all three rules the SDK enforces.

  The fix for #145 changed the namespace separator but replicated only **one** of the three rules
  `@theokit/sdk`'s `validateToolName` imposes. The rule it missed was live: a toolbox with
  `namespace: 'mcp'` minted `mcp_*`, passed authoring validation, and was **rejected by
  `Agent.create`** with `tool_reserved_name` — the same defect class as #145, on a different axis.

  Validation now lives inside `toolRuntimeName`, the only function that mints a runtime name, so no
  path can escape it — including `compileTools`, which is exported publicly. The message names the
  offending **composed** name (the parts often look valid alone) and tells "the composition overflowed
  64 characters" apart from "invalid character".

  **Behavior change:** `compileTools` now throws `ConfigurationError` at compile time for a
  namespace/tool pair that previously failed later, at `Agent.create`. No working agent breaks — a
  name that reaches this error was already being rejected downstream; it now fails earlier and says
  why.

  Also: the HITL gate map and the tool registry are derived from a **single** structure instead of
  being built twice. Building them twice is exactly how they drifted apart in #145 — the tool became
  `ns_tool` while its gate stayed `ns.tool`, silently ungating it. No observable output change.

## 1.0.1

### Patch Changes

- c2454f5: **Fix #145 — a namespaced toolbox produced a tool name the SDK rejects.**

  `toolRuntimeName` joined namespace and tool with `.`, which is outside the charset `@theokit/sdk`
  accepts (`/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/`). Every namespaced toolbox therefore failed at
  `Agent.create` — a **documented** path that never worked against a real provider, unnoticed since M4
  because the suites mock the SDK.

  - Separator is now `_` (`ops_deploy`). No consumer had the old form working, so the break is
    theoretical; update any hardcoded gate key or allow-list entry.
  - The name is validated at **authoring** time: a namespace that cannot mint a valid name throws a
    typed `ConfigurationError` instead of exploding when the model calls the tool.
  - `ToolboxCapability` no longer duplicates the HITL key construction — that duplication is what let
    the gate drift from the tool (silently ungating a gated tool when the separator changed).

  The regression test does **not** mock `@theokit/sdk`: it calls the real `Agent.create`, whose name
  validation runs before any network.

## 1.0.0

### Major Changes

- b77cf03: **Agent decorators removed — authoring is now capability composition (M53).**

  BREAKING for `@theokit/agents`: every **agent** decorator is gone. The `@theokit/http` **controller**
  decorators (`@Controller`/`@Get`/`@Post`/`@UseGuards`) are untouched.

  - **Removed:** `@Agent`, `@MainLoop`, `@Tool`, `@Toolbox`, `@HumanInTheLoop`, `@Skills`, `@Memory`,
    `@ContextWindow`, `@ProjectContext`, `@MCP`, `@Guardrails`, `@Checkpoint`, `@SubAgents`,
    `@Compaction`, `@Gateway`, `@Trace`, `@Audit`, `@RequiresApproval`, `@Mixin` — plus nine that
    wrote metadata **no production code read** (`@Artifact`, `@Hook`, `@Observable`, `@Sandbox`,
    `@EditFormat`, `@Model`, `@RequiresCapability`, `@Policy`, `@Budget`). `@Model` never set the
    model and `@Sandbox` never sandboxed anything; deleting them removes no behavior.
  - **Replacement:** `applyCapabilities([...])` composing `ModelCapability`, `AgentConfigCapability`,
    `MainLoopCapability`, `ToolboxCapability`, `skills()`, `memory()`, `mcpServers()`, `guardrails()`,
    `checkpoint()` and friends. Conflicting declarations now fail with a typed
    `CapabilityConflictError` instead of last-write-wins, and `provenance` records which capability
    contributed each field.
  - **Also removed:** `bridge/walk-agent-metadata.ts` (the metadata walk) and `compileAgent`. The
    `reflect-metadata` **required peer dependency** and `experimentalDecorators`/
    `emitDecoratorMetadata` are gone from `packages/agents` — consumers of the agent surface can drop
    all three.
  - **BREAKING for `@theokit/http`:** `TheoApp.create({ agents })` and `agentsPlugin({ agents })` take
    prepared entries (`{ name, route, compiled }`) instead of decorated classes; `delegate()` and
    `AgentRunner` take a spec instead of a class (`AgentRunner.builder(Class)` →
    `AgentRunner.fromSpec(spec)`).

  Migration guide with the full decorator→capability map: [`MIGRATION.md`](./MIGRATION.md).

  Two real defects were found and fixed while doing this: every HTTP-served agent was silently running
  the **fallback model** (`@Agent({ model })` and `llmModel` were both dropped because `walk` was
  passed where `compiled` was expected, through an untyped dynamic import), and the agents branch of
  `TheoApp` had **no test at all** — `@theokit/agents` was never declared in `packages/http`'s
  `package.json`, so nothing could link it.

## 0.47.0

### Minor Changes

- 5793ec1: Capability core for agent authoring (M52). `@theokit/agents` gains `Capability` — a two-member contract (`name`, `apply`) that enriches the EXISTING `CompiledAgentOptions` waist instead of inventing a parallel representation. Ships `ModelCapability` / `ToolsCapability` / `skills()`, a `CapabilityRegistry` (which unlocks declaring an agent from a config FILE, not only from code), `CapabilityPreset` (a preset behaves as one capability), typed fail-fast conflicts (`CapabilityConflictError`, whose message reports a value's SHAPE and never its content, since a config-built draft can carry tokens), and `provenance` so composition is auditable.

  Proven zero-behavior: the capability path is deep-equal to BOTH the `defineAgent` compiler and the decorator `compileAgent` — the artifact M53 deletes — at the waist and through the shared `Agent.create` projection, including via the file/registry route, and confirmed end-to-end against a real provider. The proof also pins the waist fields no capability expresses yet (derived from the type, with a compile-time exhaustiveness check, verified to fail on over-claim as loudly as on omission) — that list is M53's entry criterion.

  The agent decorators are untouched in this release; they are removed in M53.

## 0.45.0

### Minor Changes

- 70a4daa: Presentation layer (M49): new `@theokit/presenter` package — the canonical `AgentOutputEvent` (narrow-waist normalized event) + the `Presenter` Strategy contract + registry + `UIMessageStreamPresenter` (the web surface) + `fromSdk` source translator. `@theokit/agents` now composes its web `UIMessageStream` path over the shared presenter (`presentUIMessageStream`), replacing the inline `translateToUIMessageStream` (removed — the public export is now `presentUIMessageStream`). Behavior is byte-identical (the full existing web test corpus — unit + M1 E2E — passes unchanged against the new path). This closes the web/terminal translation duplication surfaced by dogfooding agent-builder; terminal/JSON presenters follow in M50/M51. No backward-compat shim (owner-approved clean break).

## 0.44.5

### Patch Changes

- e38db92: Fix stream event order so tool events precede the final answer text. For providers whose `onDelta` reports text but not `tool-call-started` (e.g. gpt-5.4 via OpenRouter), tool events surface only via `run.stream()` (post-completion), so live onDelta text was emitted BEFORE the tool that produced it — even though the model is tool-first (verified against the raw provider response). The SDK adapter now holds `text_delta` and flushes it after the drained stream, so the timeline order matches the model's true chronology (tool → result → answer). Non-text deltas keep their live order; duplicate text stays deduped. Trade-off: on a text-only turn the answer is emitted at generation-complete rather than token-by-token.
- 4cc200b: M35 (multimodal) — thread images through the bridge to `agent.send`. `StreamAgentOptions` and `RuntimeOverrides` gain an optional `images` field; when present the adapter sends the SDK's structured `SDKUserMessage { text, images }` form instead of a plain string, so the model receives images alongside the text. Absent ⇒ the string send path is byte-unchanged (back-compat). Zero new dependencies.

## 0.43.0

### Minor Changes

- d398561: Surface per-turn usage on the streamed assistant message. `translateToUIMessageStream` now rides the turn's authoritative totals — `usage` (input/output/total + reasoning/cache buckets), `cost`, and `durationMs` — on the ai-sdk `finish` chunk's `messageMetadata`, so they reconstruct onto the client's assistant `UIMessage.metadata` (via `readUIMessageStream`) with no extra header or store wiring. A run that ends without a `done` event (error/abort) keeps a bare `finish` (no fabricated usage). New public type `AgentTurnMetadata`. This is what lets a surface (a TUI status bar, a web cost meter) show real tokens/cost for the turn it just streamed — previously the totals stopped at the server.

## 0.42.0

### Minor Changes

- Ecosystem integration guarantee for the `@theokit/sdk` seam (M48) — the load-bearing seam (the SDK is the only agent runtime) is now drift-guaranteed to the same FAANG-grade posture as the `@theokit/ui` and TheoCloud seams.

  - **Tool handlers now see `ctx.threadId` (the run's session identity, #119) and `ctx.messages` (the turn transcript, SE12).** The local `CustomTool` type mirror is synced to the SDK and kept in sync by a `.test-d.ts` type gate, so a future SDK `ctx` change fails `tsc` instead of drifting silently — a stateful tool can scope state per session instead of leaking it.
  - **`theokit start` fails fast when the installed `@theokit/sdk` is incompatible** — a typed `SdkIncompatibleError` (found-vs-required) at boot, instead of only a per-request error. An api-only app with no SDK installed still boots (the SDK is an optional peer).
  - **Closed the SDK-family peer ranges** (`@theokit/sdk-tools` `>=0.11.0` → `^0.11.0`) and added a consumer + producer contract test plus a version-drift guard so a breaking SDK change is caught in CI or at publish, never in production.

  No action needed for apps already on `@theokit/sdk ^4.0.1`.

## 0.41.0

### Minor Changes

- Adopt `@theokit/sdk@^4.0.1`. Agent conversation history now persists **automatically** via the SDK's native Claude-shaped `.jsonl` transcript — no storage adapter to wire. The framework roots each app's transcript under `<projectRoot>/.data/agent-sessions` (git-ignore `.data/`).

  **Breaking:** the pluggable conversation-storage surface is removed (SDK 4.0 no longer ships it). `AgentBuilder.conversationStorage()` and the `@Conversation` decorator are gone. Apps that passed a storage adapter should delete that wiring — persistence is on by default. Sessions still thread by `sessionId` for resume.

## 0.40.0

### Minor Changes

- 2cfc717: Opt into `.theokit/` file-based config with `.settingSources([...])`.

  A code-created agent can now discover its skills, subagents, hooks, MCP servers, context, and cron jobs from files under `.theokit/` — config-as-git. Add `.settingSources(['project'])` to the `agent()` builder and the framework wires the SDK's `local.settingSources` + the app-root `cwd`, so the SDK discovers `<cwd>/.theokit/` (and `~/.theokit/` with `'user'`).

  ```ts
  export default agent()
    .model('openai/gpt-4o-mini')
    .system(BASE_INSTRUCTIONS)
    .settingSources(['project']) // ← discover .theokit/ from the app root
    .build()
  ```

  - `.settingSources([...])` is an Axis-A "SWAP" value (per the `agent-dynamic-config` blueprint): an explicit, non-empty list wins; `[]` is treated as unset; an agent that declares inline `.skills()` still falls back to `['project']` (back-compat). Discovery is now **decoupled from inline skills** — an agent can use `.theokit/hooks.json` / `mcp.json` / subagents / context with no inline skill.
  - The app-root `cwd` is the **framework-resolved project root** threaded through `mountAgent`, NOT `process.cwd()` (which is not guaranteed to be the app root) — so discovery reliably points at `<app>/.theokit/`.
  - The SDK owns discovery + execution (skill loading, hook shell execution, MCP launch); theokit only wires `local.settingSources` + `cwd` (G2 / ADR-0040 — no runtime reimplementation).
  - **Security:** enabling `'project'` enables shell-executing hooks from `.theokit/hooks.json`. This is opt-in because `.theokit/` is your own repo (informed consent).

  Verified end-to-end in a real browser: a showcase agent with `.settingSources(['project'])` discovered a `.theokit/skills/` skill and listed it alongside its inline skill.

## 0.39.0

### Minor Changes

- f61b77f: Adopt `@theokit/sdk@3.x` (SE36 uniform `X.create()` API).

  SDK v3.0 removed the standalone factory functions in favor of static `X.create()` namespace methods. The `@theokit/agents` bridge now binds the new names — `Tool.create` (was `defineTool`), `SkillReadTool.create` (was `defineSkillReadTool`), `Retry.create` (was `withRetry`) — and the scaffold's code-defined skill uses `Skill.create` (was `createSkill`). While migrating, the tool-handler wrapper (`withRunContext`) was fixed to forward the **full** tool `ctx` — the SE12 `messages` transcript projection was being dropped, which would have silently broken a tool that reads the turn transcript; the handler types now track the SDK's canonical `CustomTool['handler']` instead of a hand-maintained duplicate.

  **Breaking (peer requirement):** `theokit` and `@theokit/agents` now require `@theokit/sdk >= 3.5.0` (and `@theokit/sdk-tools >= 0.9.1`, the SE36-migrated build). Apps on `@theokit/sdk@2.x` must upgrade — run `npx @theokit/codemod-sdk-3-0 --write` to migrate app code that calls the old factories directly.

## 0.38.1

### Patch Changes

- d186cb1: DX: move the `.skills()` mechanism explanation from the scaffold into the API's JSDoc.

  The `agents/chat.ts` scaffold carried a 4-line inline comment explaining _how_ skills work (the `<skills>` block + the on-demand `skill_read` tool). That belongs on the API, not in the developer's first file. The explanation now lives in the `.skills()` JSDoc (discoverable on hover / cmd-click) and the scaffold keeps a one-line pointer — so a freshly scaffolded `chat.ts` reads as intent (`​.skills([dailyBriefingSkill])`) with the "how" one hover away.

## 0.38.0

### Minor Changes

- **`.skills([inlineSkill])` now auto-provisions the `skill_read` tool — one call, not two.** An inline
  `createSkill` lists in the `<skills>` block by name + description ONLY; its body is unreachable to the
  model without a `skill_read` tool, so registering an inline skill implies wanting it readable. The
  runtime (`createSkillAgentStream`, where `@theokit/sdk` is dynamically loaded) now auto-appends
  `skill_read` when the agent declares inline skills — so `agent().skills([mySkill]).build()` both
  registers the skill AND makes it readable. Dedup: an explicit `defineSkillReadTool` the app added wins
  (never duplicated). Graceful: an SDK older than `defineSkillReadTool` degrades to list-only (no crash).
  The auto-wire lives at the runtime layer so the pure compile module (`compileAgentDefinition`) keeps its
  type-only SDK dependency. `defineSkillReadTool` remains available as an escape hatch (custom skill sets).

## 0.37.0

### Minor Changes

- **`.skills([...])` now accepts inline `createSkill` objects — not just filesystem skill names.** The SDK
  has always supported code-defined skills (`SkillsSettings.inline`, auto-injected into the `<skills>`
  system-prompt block), but the builder's `.skills()` / `defineAgent({ skills })` only took `string[]`
  names, so an inline skill could only reach the model through a `skill_read` tool + persona hardcoding.
  `SkillsSelection` is widened to `readonly (string | InlineSkill)[] | resolver`; `compileSkillsSelection`
  splits a mixed list into `skills.enabled` (filesystem names) + `skills.inline` (createSkill objects).
  So `agent().skills([mySkill]).build()` registers the skill's name + description into the `<skills>`
  block — the model KNOWS the skill exists without repeating it in the system prompt. Backward-compatible:
  a pure name list still compiles to `{ enabled, autoInject }` (no `inline` key). The run path already
  forwarded `compiled.skills` to `Agent.create({ skills })`; only the builder input surface changed.

## 0.36.0

### Minor Changes

- **`.conversationStorage(adapter)` on the agent builder — control the agent's memory.** `agent()` (and
  `defineAgent({ conversationStorage })`) now accept a `ConversationStorageAdapter`, so an app declares
  WHERE the agent's conversation turns persist right where it defines the agent:
  `agent().model(...).conversationStorage(store).build()`. The adapter flows through
  `compileAgentDefinition` → the run path → `Agent.getOrCreate({ conversationStorage })`. Precedence:
  a per-run override wins over the agent-level default, which wins over the SDK's lazily-chosen default
  (byte-identical to the previous behaviour when unset). Swap `InMemoryConversationStorage` (ephemeral)
  ⇄ `FileSystemConversationStorage` (durable) ⇄ a custom adapter without touching the runtime.

## 0.35.0

### Minor Changes

- 0e01bc6: M35 — TUI terminal-only in-process surface (Model A).

  - `theokit/server` exports `streamAgentTurnInProcess(mod, apiKey, { message, awaitApproval? })`: run an
    agent turn in a SINGLE process — no HTTP loopback, no port, no CSRF — reusing `compileAgentModule` +
    `streamAgentUIMessages` (zero runtime reimplementation, G2). HITL is resolved INLINE via a caller
    `awaitApproval` callback (the Claude Code / Codex single-process shape); a gated agent run without a
    resolver throws `InProcessApprovalRequiredError` (fail-closed — the #99 lesson). Parity with the HTTP
    mount is by construction: both call the same `streamAgentUIMessages`.
  - `@theokit/agents` now publicly exports the `HitlDecision` type — the settled approval decision an
    `awaitApproval` resolver may return (bare boolean OR `{ approved, reason?, payload? }`).

## 0.31.0

### Minor Changes

- eb1b70e: Agent capabilities batch M9–M17.

  - **M9 Guardrails** — `defineAgent({ guardrails })`: input/output guards at the boundary (`promptInjectionDetector`, `piiDetector`, `unicodeNormalizer`, `costGuard`, `outputModeration`), input applied fail-fast, output moderated before reaching the client.
  - **M10 Lifecycle hooks** — `createToolHooksPlugin({ beforeToolCall, afterToolCall, beforeLLMCall, afterLLMCall })` over the SDK's native tool/LLM hooks.
  - **M11 Conversation scoping** — `deriveConversationId`/`parseConversationId` for collision-safe `{resource, thread}` isolation.
  - **M12 Delegation hooks** — `onDelegationStart`/`onDelegationComplete` on `delegate()` (+ abortSignal, docs).
  - **M13 Per-request skills resolver** — `defineAgent({ skills: (ctx) => string[] })` resolved against the run-context at mount.
  - **M14 HITL surface** — `defineAgent({ approvals })`, `GET /api/agents/:name/approvals`, `toolName` forwarded to the registry.
  - **M15 A2A** — `buildAgentCard` + served at `/.well-known/<name>/agent-card.json`; `createA2ATool` client with auth.
  - **M16 MCP** — `buildMcpToolDescriptors`/`mcpServerInfo` + served at `POST /api/agents/<name>/mcp` (JSON-RPC).
  - **M17 ACP** — `AcpMessageDecoder`/`encodeAcpMessage` framing, `AcpClient`, and `createACPTool` + `NodeAcpTransport` (subprocess) with a required `onPermissionRequest` gate.

  Governance: ADR-0040 (runtime-vs-home boundary).

## 0.30.2

### Patch Changes

- 6a91f17: Fix (#81): `defineAgent({ tools })` now type-accepts the `@theokit/sdk` `CustomTool` that `defineAgentTool` and every `@theokit/sdk-tools` factory return (previously `CustomTool` was not assignable to the internal `CompiledTool`, so the documented tool pattern failed `tsc` even though it ran). The `tools` field is typed `readonly CustomTool[]` and normalized to `CompiledTool` at compile.

  Fix (#80): the `create-theokit` default template now type-checks, builds, AND renders on a fresh scaffold. `app/page.tsx` was migrated to the `@theokit/ui@1.0.0` auto-dispatch chat API (`ChatMessage` takes a `UIMessage` and renders its parts; the old manual `Message`/`ToolCallCard` flatten is gone), the template ships `@types/node` + `experimentalDecorators`/`emitDecoratorMetadata` (so tool handlers and the `@Agent` class surface type-check), and a jsdom render test (`app/page.test.tsx`) guards against future `@theokit/ui` drift. A pristine scaffold now passes `tsc --noEmit` with 0 errors (was 7).

## 0.30.1

### Patch Changes

- 2302dcb: M6 dogfood fixes — two real V1 bugs surfaced by a live `npx create-theokit` run.

  - **Tool calls crashed** (`TypeError: ... reading 'def'`): `buildSdkTools` re-ran `defineAgentTool`'s
    already-lowered JSON-Schema tool through the SDK's `defineTool` (which expects a live Zod schema).
    It now routes by `inputSchema` shape — Zod schema → `defineTool`; already-SDK-ready `CustomTool`
    (JSON-Schema `inputSchema`) → forwarded raw. Regression test + confirmed minimal repro.
  - **Fresh scaffold failed to start** (`ERR_PACKAGE_PATH_NOT_EXPORTED` on `@theokit/sdk/compaction`):
    the default template pinned `@theokit/sdk@^1.1.0`, below the `@theokit/agents@0.30.0` peer floor
    (`>= 2.13.0`). Bumped the template + fixture pins to `^2.13.0`.

## 0.30.0

### Minor Changes

- 604bca9: Cohesive agent harness (M4, Eixo C) — make the shipped-but-dead `@HumanInTheLoop` + `@Checkpoint`
  decorators functional as an adapter over `@theokit/sdk`, with no parallel runtime (ADR 0038).

  - **`@HumanInTheLoop`** now pauses the run before a gated tool: the stream emits the ai-sdk-native
    `tool-approval-request` chunk and the run stays paused (the SDK's own awaited `pre_tool_call`
    hook) until `POST /api/agents/<name>/approve/<approvalId>` resolves it — approve runs the tool,
    deny/timeout surfaces the denial and the run continues.
  - **`@Checkpoint({ storage: 'filesystem' })`** emits a transient `data-checkpoint` part and selects
    the SDK's durable `FileSystemConversationStorage`, so a same-session follow-up request resumes.
  - The M2 file convention gathers a class agent's `@Mixin` toolboxes so a gated tool actually gates
    through the endpoint. `@theokit/agents` adds `createHitlPlugin`; `theokit` adds the approve route
    - in-process approval registry. Additive — the M2 surface is unchanged.

## 0.29.0

### Minor Changes

- a1182ae: Ship an agent by writing one file — the zero-config `agents/<name>.ts` convention (theokit-ai-first M2, Eixo B).

  Create a top-level `agents/support.ts` that default-exports `defineAgent({ input, model, system, tools })` and TheoKit auto-serves `POST /api/agents/support` at both `theokit dev` and the built server — streaming the M0/M1 canonical `UIMessageStream`. On the client, `import { useAgent } from '@theo/agents'` gives a typed React hook: `useAgent('support').send(input)` where `input` is inferred end-to-end from the agent's Zod schema via the generated `.theokit/agents.d.ts` — zero manual type wiring. The hook reconstructs the streamed assistant messages with the `ai` package's own `readUIMessageStream` (the exact reader `@ai-sdk/react`'s `useChat` runs — no reinvented parser); `theokit/client` also exports the pure `consumeUIMessageStream` and the base `useAgent(path)`.

  `@theokit/agents` gains `defineAgent` — the canonical zero-config surface (ADR 0037) — a pure normalizer to the same SDK-ready shape the `@Agent` class decorator produces, so both surfaces converge on one runtime (`@theokit/sdk` stays the sole agent runtime). New exports: `defineAgent`, `compileAgentModule`, `streamAgentUIMessages`, `AgentDefinitionError`, `InferAgentInput`.

  The build scans a top-level `agents/` directory and records each agent in the manifest; dev and prod mount through a single shared `mountAgent` point so they never drift. The request body accepts both the `useChat` shape (`{ messages }`) and a simple `{ message }`. Agent endpoints enforce CSRF (the `X-Theo-Action` header + Origin match, strict by default) at the same mode as routes/actions — a cross-origin POST that would spend LLM tokens is rejected with 403 before it reaches the SDK. A non-agent file or an unknown route fails fast with a typed error. `/api/agents/` is a reserved prefix (a manual route there is shadowed by design, like `/api/__actions/`).

  Agents live in a top-level `agents/` (sibling of `server/`) per the LOCKED naming decision (ADR 0037). Non-breaking: additive API on both packages; the existing route/action/ws scanners still ignore `agents/`.

## 0.28.0

### Minor Changes

- 2ddfab9: A theokit agent's tool calls and reasoning now render in `@ai-sdk/react`'s `useChat` — a tool-call card (name + input + result) and a reasoning block, not just text (theokit-ai-first M1).

  `translateToUIMessageStream` widens the M0 text-only mapping to emit ai-sdk tool chunks (`tool-input-available` → `tool-output-available` / `tool-output-error`) and reasoning chunks (`reasoning-start` → `reasoning-delta*` → `reasoning-end`) via an open-block state machine that closes the current text/reasoning block before switching kind. Runtime-discovered tools carry `dynamic: true`, so the ai-sdk consumer materializes a `dynamic-tool` part whose tool name survives to the rendered part; a tool result that arrives without a preceding tool call synthesizes the tool-input part first, so the consumer never throws. `UIMessageStream` stays the canonical wire (AG-UI rejected — ADR 0036). Backward-compatible: M0 text/error runs are byte-unchanged; the translator signature and barrel exports are unchanged.

## 0.27.0

### Minor Changes

- 8842bc6: Surface the SDK's `partial-tool-call` update as a typed `PartialToolCallEvent` (`type: 'partial_tool_call'`) on the `AgentStreamEvent` stream, so consumers can render tool arguments progressively as the model generates them (closes theokit-sdk#70).

  Previously `translateInteractionUpdate` dropped `partial-tool-call`, forcing downstream apps to wait for the complete `tool_call` (args committed) — visible "dead air" for large Write/Edit tool bodies. The new event is emitted at a **distinct** lifecycle point (arg-streaming) and never duplicates `tool_call`: the same `callId` correlates the partials to the later committed `tool_call` and `tool_result`. Adds `isPartialToolCall` type-guard. Non-breaking union growth — existing consumers ignore the new variant.

- 403fdd7: A theokit agent's text stream now speaks the Vercel AI SDK `UIMessageStream` protocol, so `@ai-sdk/react`'s `useChat` renders it with no custom adapter (theokit-ai-first M0 walking skeleton).

  `@theokit/agents` adds `translateToUIMessageStream(events, { textId })` — a pure mapping of the agent text stream to ai-sdk `UIMessageChunk`s (`start → text-start → text-delta* → text-end → finish`), surfacing an upstream stream error as an ai-sdk `error` chunk before a graceful `finish` (never swallowed, never thrown past the boundary). `theokit/server/define` adds `uiMessageStreamResponse(chunks)`, which serializes them to an SSE `Response` on the exact wire `useChat` parses (`x-vercel-ai-ui-message-stream: v1` header + `data: [DONE]` terminal). `ai` is an optional `peerDependency` (with a devDependency for local build/tests) — zero runtime weight on the agent path; `@theokit/sdk` stays the sole runtime. Additive and backward-compatible: the existing `AgentEvent` SSE path is untouched (its removal is the M3 clean break).

## 0.26.0

### Minor Changes

- c85145d: Add opt-in `recoverLeakedToolCalls` knob (`@Agent({ recoverLeakedToolCalls })` + per-run `AgentRunner.stream({ recoverLeakedToolCalls })`, default off). It is the execution sibling of `stripToolDialect` (theocode#32): where `stripToolDialect` only HIDES a leaked Hermes `<function=…></tool_call>` dialect from the visible text, `recoverLeakedToolCalls` makes the leaked call actually EXECUTE. When enabled, the adapter clones the per-run `providers.routes` with the SDK's `extractToolCallsFromContent` flag, so a `chat_completions` finish with ZERO native `tool_calls` has its assistant text scanned for the dialect and any recovered calls are dispatched by the loop — for models (qwen3-coder via OpenRouter) that intermittently leak tool calls as text (theokit#58 follow-up). Has effect only when a provider is routed via `providers.routes`; fail-open and default-off, so a non-leaking route is unaffected. Requires `@theokit/sdk >=2.13.0` (the per-route flag); the peer floor is bumped accordingly.

## 0.25.1

### Patch Changes

- 77672ab: Fix `tool_call` StreamEvent surfacing an empty `input` (`{}`), which blanked consumer tool cards (theokit#58).

  `event-translator.ts`'s `translateToolCallEvent` read the running tool message's args from `msg.input ?? msg.arguments`, but the real `@theokit/sdk` `SDKToolUseMessage` field is `args` (`run-D22b53SU.d.ts:486`) — both read fields were `undefined`, so `input` fell back to `{}` and the UI tool card showed no command (e.g. a blank `SHELL_EXEC`), even though the tool executed correctly. Confirmed empirically (live Node 24 + OpenRouter: `msg.args={"command":…}`, `input`/`arguments` undefined) and by the SDK type.

  The fix reads `msg.args` first — `input: msg.args ?? msg.input ?? msg.arguments ?? {}` — keeping the legacy fields as defensive cross-shape fallbacks. No new dependency, no dedup change, no behavior change for the `tool-call-started` onDelta path (already reads the correct field). Covered by 3 unit tests + 2 integration tests.

## 0.25.0

### Minor Changes

- Strip a leaked tool-call dialect out of the visible answer (theocode#32). When a model emits its Hermes `<function=NAME>…</function></tool_call>` XML as assistant TEXT instead of a native `tool_calls` (observed live with `qwen/qwen3-coder`), the raw XML used to render verbatim as the reply. A new opt-in `stripToolDialect` knob (`@Agent({ stripToolDialect: true })` or per-run `AgentRunner.run(msg, { stripToolDialect: true })`, per-run wins) wraps the agent's text stream with a streaming stripper that removes the leaked `<function=…></tool_call>` block from `text_delta`. It is chunk-straddle-safe (both the `<function=` open and the `</tool_call>` close split across stream deltas are recognized) and lossless on a truncated leak (an unclosed `<function=` at stream end is flushed back as text, never silently dropped). The leak is STRIPPED, never parsed back into a tool call — parsing a provider-broken channel would re-introduce the no-progress spin closed in #53. Off by default (zero behavior change for existing agents — a code assistant may legitimately emit a literal `<function=` in answer/code text). Sibling of `parseThinkTags`. New exports: `createToolDialectStripper`, `stripToolDialectStream`.

## 0.24.1

### Patch Changes

- 3c2bf61: Fix the reflective loop's `no_progress` detector being defeated by narration drift (theokit#53). `roundSignature` folded the assistant's text into the per-round fingerprint, so a model that re-ran identical tool calls while rephrasing its prose ("…e executá-lo." → "Agora vou executar…") produced a different signature each round and evaded `NO_PROGRESS_THRESHOLD` — the loop spun (observed live: deepseek-v3.2, 7 rounds / 12 tool-calls re-doing the same `write_file`+`shell_exec`). The signature now keys on the tool-call set ONLY (name + canonicalized input), excluding narration — mirroring opencode's `doom_loop`. Repeated identical tool calls now terminate `no_progress` within 2 rounds regardless of what the model says around them; genuinely varying tool inputs still count as progress.

## 0.24.0

### Minor Changes

- 6830737: Step-cap force-close: the reflective loop now gates tools OFF on the ceiling round (`round === maxIterations`), forcing the model to emit the closing summary the existing `STEP_LIMIT_HINT` requests instead of spinning on more tool calls. The round factory is called with `disableTools: true`, which the SDK adapter maps to `agent.send(msg, { toolChoice: "none" })` — applied per-send because a cached `getOrCreate` agent's tools cannot be un-registered. Below the ceiling, tools stay enabled; injected stream factories (tests / custom transport) ignore the optional flag (backward-compatible). Mirrors opencode's `MAX_STEPS_PROMPT` + `toolChoice:"none"`. The `@theokit/sdk` peer dependency is tightened to `>=2.11.2` (first release with `SendOptions.toolChoice`) so the force-close cannot silently no-op against an older SDK that ignores `tool_choice`.

## 0.23.0

### Minor Changes

- a4f668f: Add an opt-in `<think>`-tag reasoning middleware (M2). When `parseThinkTags` is set — declaratively via `@Agent({ parseThinkTags: true })` or per-run via `AgentRunner.run(msg, { parseThinkTags: true })` (per-run wins over compiled) — the agent's text stream is wrapped with a streaming extractor that converts inline `<think>…</think>` into `thinking` StreamEvents, so models that emit reasoning as inline tags (qwen/deepseek-class) surface it the same way native-reasoning providers do (M1's `reasoningEffort`). The extractor is chunk-straddle-safe, preserves interleaved order, flushes a truncated `<think>` at stream end, and treats a non-tag prefix like `<thinkers>` as text. Off by default — zero behavior change for existing agents. New exports: `createThinkTagExtractor`, `extractThinkTagStream`, `Segment`.

## 0.22.0

### Minor Changes

- 9c04863: Add a provider-agnostic `reasoningEffort` knob to enable extended thinking (M1). Set it declaratively via `@Agent({ reasoningEffort })` or per-run via `AgentRunner.run(msg, { reasoningEffort })` (per-run wins over compiled); it maps to the SDK `ModelSelection.params` reasoning slot (`{ id: 'thinking', value: effort }`) at the single `getOrCreate` site, so the provider emits the `thinking` StreamEvents the bridge already forwards. Accepts the common levels (`'minimal' | 'low' | 'medium' | 'high' | 'xhigh'`) plus any provider-specific string. Backward-compatible — with no effort set, the model is sent as a bare `{ id }` (byte-identical to before) and there is no static capability gate (the SDK validates against the model's catalog). New exports: `ReasoningEffort` type and `buildModelSelection` helper.

## 0.21.2

### Patch Changes

- 919e138: Fix chronological event ordering in `AgentRunner.stream()` (#44). Tool and thinking events now stream through the SDK's real-time `onDelta` callback in true arrival order, interleaved with text — instead of all text first, then all tool cards (a regression from the 0.21.1 streaming work, where tool events were pulled from the post-completion `run.stream()` buffer). The merge queue is consumed concurrently with `send()` for real-time delivery, with per-category/per-callId dedup so the `run.stream()` fallback (for providers that don't drive `onDelta`) never double-emits and never drops a tool result reported only via the stream (e.g. a tool error). No public API change.

## 0.21.1

### Patch Changes

- 2c6e03f: fix(agents): stream incremental tokens, populate tool output, emit running tool_call

  The SDK↔agents bridge (`createSdkAgentStream` + `translateToolCallEvent`) now forwards
  the streaming + tool data the SDK already produces, fixing three SSE-DX defects:

  - **#40 — token streaming.** `createSdkAgentStream` now passes `SendOptions.onDelta` to
    `agent.send` and merges the incremental `text_delta` tokens into the event stream
    (`mergeDeltaStream`), deduping the complete-assistant text (`sawDelta`) so it is not
    double-emitted. A provider that never calls `onDelta` falls back to the complete-assistant
    text (no loss). Previously the whole round was emitted at once at turn end.
  - **#41 — tool output.** `translateToolCallEvent` now serializes a non-string tool `result`
    (`serializeToolOutput` → JSON, BigInt-safe) instead of dropping it via `asString(...,'')`,
    so object tool results (`{ ok, files }`) reach consumers instead of `''`.
  - **#42 — running tool_call.** The `running` tool status now emits a `tool_call` StreamEvent
    (callId + toolName + input) so UIs can show a running card with args, instead of only the
    terminal `tool_result`.

  Bridge-only; no SDK change, no runtime re-implementation (sdk-runtime.md/G2).

## 0.21.0

### Minor Changes

- 20338f5: `AgentRunnerRunOptions.plugins` now also accepts a `readonly Plugin[]` (an array of code Plugin objects), not only `PluginsSettings` ({ enabled }). Mirrors the @theokit/sdk `AgentOptions.plugins` widen — the runtime already forwards plugin arrays. Lets consumers pass `plugins: [permissionPlugin, cachePlugin]` without an `as unknown as` cast.

## 0.20.0

### Minor Changes

- 45f229a: V4-T: `delegate()` carries the same per-run config surface as `AgentRunner.stream()`.

  `DelegateOptions` gains optional `model`/`cwd`/`plugins`/`providers`/`agents`/`budgetTracker`/`conversationStorage`/`sdkTools`/`retry`/`reflection`/`maxIterations`, and `delegate()` forwards them to `createSdkAgentStream` (the model opt wins over the sub-agent's `@Agent` model) + the reflective loop (retry; custom reflection overriding the strategy-derived ladder/noop; `maxIterations` re-resolves the loop ceiling). The two on-ramps to the shared `runReflectiveLoop` driver now expose the same per-run surface, so a sub-agent inherits the parent's runtime config (providers, mode-selected permission plugin, working dir, pre-built SDK tools). Additive + backward-compatible: absent fields ⇒ byte-identical to before (decorator model only; strategy-derived reflection; no retry). The fields were already accepted by the adapter's `RuntimeOverrides` + the loop's `RunReflectiveLoopConfig` — pure forwarding, no new dependency (Rule 9). Unblocks an app delegating to a sub-agent without losing per-run config.

## 0.19.0

### Minor Changes

- 01e9ea8: V4-S: `plan-act-reflect` defers the continuation decision to the `ReflectionStrategy`.

  `resolveLoopStrategy('plan-act-reflect')`'s `shouldContinue` is now `round < maxIterations` (instead of the `finishReason === 'tool-calls'` gate). The reflective loop ANDs `reflection.continue` with `shouldContinue`, so this lets a custom `ReflectionStrategy` extend even a terminal (`stop`) round — e.g. "you answered without editing any file; make the edit now" — within the iteration ceiling. Backward-compatible with the shipped `ladderReflectionStrategy` (which itself returns `continue: true` only on `tool-calls`, so the observable behavior with the default ladder is unchanged). `react` is unchanged (the `noop` reflection means the strategy stays the gate: continue only on `tool-calls`). Closes the last seam for an app whose reflection ladder fires on final-answer rounds (theocode's `reflect_no_edit`/`verify`/`fix`).

## 0.18.0

### Minor Changes

- 6d02c56: V4-R: `AgentRunner` accepts an injectable `RoundStreamFactory` via `run-options.streamFactory`.

  `AgentRunnerRunOptions.streamFactory?: RoundStreamFactory` drives the reflective loop with a caller-provided per-round stream INSTEAD of `createSdkAgentStream` (for tests or a custom transport). When set, the SDK-create options (`tools`/`sdkTools`/`model`/`cwd`/...) are not used for that call — the consumer owns the stream. Absent ⇒ the SDK adapter (the default runtime), byte-identical to before. `RoundStreamFactory` (`(message, sessionId) => AsyncIterable<StreamEvent>`) is now exported from the package barrel so consumers can type their factory (the loop DRIVER `runReflectiveLoop` stays internal). Lets an app adopt `AgentRunner.stream()` while keeping its existing stream-injection tests — closes the last adoption seam the theocode discover found. Additive + backward-compatible; no new dependency.

## 0.17.0

### Minor Changes

- 6ec6124: V4-Q: `AgentRunner` accepts pre-built SDK `CustomTool[]` via `run-options.sdkTools`.

  `AgentRunnerRunOptions.sdkTools?: readonly CustomTool[]` (and `RuntimeOverrides.sdkTools`) forwards already-built SDK tools RAW to `Agent.create.tools`, appended after the `@Tool`-compiled tools, bypassing `defineTool` (which requires a Zod schema). Lets an app whose tools come from imperative SDK factories (`@theokit/sdk-tools` → `CustomTool[]`, JSON-Schema `inputSchema`, no recoverable Zod) adopt `AgentRunner.stream()` — closes the last tool-sourcing gap the theocode loop-adoption discover found. Additive + backward-compatible: absent ⇒ the compiled-tools path is byte-identical; distinct from `tools` (which REPLACES the compiled set). No new dependency (Rule 9).

## 0.16.0

### Minor Changes

- 208ea7f: V4-P: per-round transient retry in the reflective loop.

  `AgentRunnerRunOptions.retry?: RetryOptions` (and `RunReflectiveLoopConfig.retry`) opt into retrying a transient failure at a round START — the factory creation + first event, before any event is yielded, so a recovered 429/5xx/network blip never re-applies an edit. Reuses the SDK `withRetry` (`@theokit/sdk/retry`, default `isRetryable: isTransientError`), dynamic-imported only when `retry` is set so the loop stays SDK-optional. Once an event is yielded, a throw propagates (exactly-one-terminal + no double-edit preserved). Absent ⇒ single attempt (backward-compatible). Lets a consumer (theocode) keep its per-continuation-round retry safety when it adopts `AgentRunner.stream()`. No new dependency (Rule 9).

## 0.15.0

### Minor Changes

- d69f7b4: V4-O: forward the SDK reasoning/cache token buckets through the adapter `done` event and `DelegationResult`.

  `realUsageDone` (`createSdkAgentStream`) now reads `reasoningTokens`/`cacheReadTokens`/`cacheWriteTokens` from `RunResult.usage` and includes them on the `done` event (0 when the provider omits them); the reflective loop folds them per round and accumulates them into `DelegationResult` (alongside the V4-N split usage). The typed `DoneEvent.usage` declares the three optional buckets. Additive + backward-compatible: existing fields unchanged, the new fields are optional, absent buckets default to 0. Lets a consumer (theocode's `LlmUsage`) keep full per-turn usage when it adopts `AgentRunner.stream()` — closes the usage-richness regression the loop-adoption discover found. Reuses the `RunResult.usage` already read by `run.wait()` (Rule 9); no new dependency.

## 0.14.0

### Minor Changes

- 6f1a757: V4-N: the reflective loop now exposes faithful per-round tool calls + split token usage, so a custom `ReflectionStrategy` (and `DelegationResult` consumers) can read the tool-call command, correlate by id, and map split usage.

  - `LoopOutcome.toolCalls` / `DelegationResult.toolCalls` entries now carry `{ id, name, input, output }` — `input` is the tool-call args (correlated from the `tool_call` event by callId), no longer always `{}`, and `id` is the call id.
  - `DelegationResult` now carries `tokensInput` / `tokensOutput` (accumulated across rounds); `tokens` (total) is preserved.

  Additive + backward-compatible (existing fields unchanged; new fields are optional on `DelegationResult`). `consumeOneRound` correlates each round's `tool_call` events (which carry the input/command) with their `tool_result` events (which carry the output) by callId; an unmatched result degrades to `input: {}` (no worse than before). The tool-call id+input half flows on the real SDK path. NOTE: the split-usage half is plumbing — the SDK adapter must emit real per-turn token counts on the `done` event for `tokensInput`/`tokensOutput` to be non-zero (today it emits zeros, unchanged from before; a follow-up). Unblocks a consumer's verify-before-finish / fix-failed-test ladder + tool persistence that need the command and the id.

### Patch Changes

- a4e1c25: V4-N.1: `createSdkAgentStream` now emits the SDK Run's REAL token usage on the `done` event.

  It reads `run.wait()` after the stream and emits one `done` carrying the real `TokenUsage` (`inputTokens`/`outputTokens`/derived `totalTokens`) + `cost`, suppressing the stream's zero-usage `done`. This completes V4-N's split-usage story end-to-end: `DelegationResult.tokens`/`tokensInput`/`tokensOutput` now report real values on the real SDK path (previously hardcoded to 0). An error round skips the `wait()` re-emit (exactly-one-terminal); a `wait()` rejection surfaces as an `error` (fail-loud). Additive; reuses the SDK's documented `run.wait()` (Rule 9); no new dependency.

## 0.13.0

### Minor Changes

- 8811577: V4-M: `AgentRunner.stream()` reflective-loop rounds now share a persisted SDK session, so round N+1 sees what rounds 1..N read and did.

  - Each round resumes the same session via `Agent.getOrCreate(sessionId, { conversationStorage })` with ONE shared `conversationStorage` created per run (default `InMemoryConversationStorage` — per-run, no disk), survivable across the per-round agent dispose.
  - Rounds 2+ no longer re-send the original task — the persisted session carries it; the round-2+ prompt is the reflection block (or a short continuation). Round 1 sends the original message unchanged.
  - New `AgentRunnerRunOptions.conversationStorage` (and `RuntimeOverrides.conversationStorage`) lets an app plug a `FileSystemConversationStorage`/custom adapter for durable cross-run history.

  **Behavior change (fix):** previously each round created a fresh, memoryless agent (history was NOT carried across rounds) — a multi-round reflective loop whose rounds could not see prior tool results. Rounds are now stateful by default. This reuses the SDK's own session-persistence primitives (Rule 9); no new dependency. It unblocks consumers (e.g. a code agent) adopting `AgentRunner.stream()` for continuation loops. The `delegate()` sub-agent path shares the same loop driver, so sub-agent delegation rounds gain session memory too.

## 0.12.0

### Minor Changes

- 47dd837: V4-L.3: `AgentRunner.stream()/run()` complete the per-request `Agent.create` surface with four more `AgentRunnerRunOptions` fields (Axis-A / SWAP), each forwarded to the SDK when present — parallel to the existing `tools`/`model`/`cwd`/`maxIterations`.

  - **`plugins`** (`PluginsSettings`) — per-request plugins (e.g. a permission gate selected by request mode).
  - **`providers`** (`ProviderRoutingSettings`) — per-request provider routing.
  - **`agents`** (`Record<string, AgentDefinition>`) — per-request sub-agent definitions (opts-only; `@SubAgents` compiled agents stay deferred).
  - **`budgetTracker`** (`BudgetTracker`) — per-request SDK budget tracker capping the INNER tool-loop per send (distinct from the OUTER reflective-loop USD `budget`).

  Internals: `createSdkAgentStream`'s per-request parameters are collapsed into a single `RuntimeOverrides` object (subsuming the prior `envModel`/`cwd` positionals) to avoid a parameter explosion; the model now resolves at a single site (`overrides.model ?? compiled.model ?? default`). Backward-compatible (absent fields ⇒ no `Agent.create` key; the 3-arg `createSdkAgentStream` call still compiles); no new dependency. With this slice the full per-request surface theocode needs is expressible through `AgentRunner`.

## 0.11.0

### Minor Changes

- b1c6a71: V4-L.2: `AgentRunner.stream()/run()` accept three per-request overrides on `AgentRunnerRunOptions` (Axis-A / SWAP), each merge-over-compiled, parallel to the V4-J `tools` override.

  - **`model`** — overrides the compiled model for this call (`opts.model ?? compiled.model ?? default`).
  - **`cwd`** — forwarded into `Agent.create({ local: { cwd } })`, so the SDK populates `SystemPromptContext.cwd` (read by a V4-L.1 `SystemPromptResolver` / `@ProjectContext`). Absent ⇒ no `local.cwd`.
  - **`maxIterations`** — overrides the reflective-loop ceiling for this call by re-resolving the loop strategy (zod-validated — `< 1` throws, never a silent unbounded loop); the build-time strategy is not mutated. Terminal `step_limit` when the override stops a would-continue round.

  All three are backward-compatible (absent ⇒ build-time defaults); a `{ apiKey }`-only call and existing `tools` overrides behave exactly as before. No new dependency.

## 0.10.0

### Minor Changes

- 13a4abc: V4-L.1: `@Agent`'s `systemPrompt` now accepts a per-request `SystemPromptResolver`, not just a static string.

  - `@Agent({ systemPrompt: (ctx) => ... })` declares a prompt COMPUTED per request (from project rules, memory, cwd, etc.); the SDK invokes the resolver each send with the run's `SystemPromptContext`. A plain string still works unchanged (backward-compatible union widening — `string | SystemPromptResolver`).
  - The resolver flows byref through the compile boundary (`compileAgent` → `CompiledAgentOptions.systemPrompt`) into `Agent.create` — no translation, no new dependency (the type is the SDK's own `SystemPromptResolver`).
  - `@ProjectContext` now COMPOSES with a resolver base: env + repo map + project instructions are prepended to the resolved base output (resolve-then-prepend); a failing base resolver propagates (fail-loud). Previously `base` was `string`-only.
  - This is Axis-B (computed-per-request config) of the dynamic-`@Agent` design and closes the long-standing M8 edge case where the decorator could only carry a static prompt. Sub-agent resolver execution remains out of scope (the type is carried, not invoked).

## 0.9.0

### Minor Changes

- 079f725: V4-J + V4-K: two backward-compatible `AgentRunner` hooks that unblock loop adoption by apps with per-request tools and stateful reflection.

  - **V4-J — runtime tool override:** `AgentRunner.stream(message, opts)` / `run(...)` accept `opts.tools?: readonly CompiledTool[]` that replaces the build-time `compiled.tools` for that call only (a consumer selecting tools by request mode/permission). Absent ⇒ the agent's compiled tools (unchanged). Decorators and the compile path are untouched.
  - **V4-K — ReflectionContext:** `ReflectionStrategy.reflect(outcome, ctx?)` now receives a per-run mutable `ReflectionContext` (a generic scratch bag). The reflective loop creates ONE per run and passes the SAME reference to every round, so a stateful custom strategy can accumulate cumulative state (counters, one-shot flags). The framework writes nothing app-specific into it (the strategy owns the contents). `ctx` is optional — shipped `ladderReflectionStrategy`/`noopReflectionStrategy` and existing custom strategies are unaffected.

## 0.8.0

### Minor Changes

- 0620275: V4-D-stream: the reflective `@MainLoop` runtime now streams events live. `AgentRunner` gains a `stream(message, opts)` method that yields each round's events incrementally (the on-ramp for SSE-first apps) while still returning the aggregated result. `run()` is unchanged for callers — it drains the stream internally. Fully backward-compatible: the collect-mode `delegate()` path is untouched.
- 0620275: V4-F: a named, callable `TranscriptCompactionStrategy` authoring layer. `@Compaction('token-budget', { keepTokens })` (and `AgentRunner.builder(...).compaction(...)`) resolve a strategy exposed as `runner.compaction`, which the app calls directly — `runner.compaction?.compact(messages, { summarize })`. The `'token-budget'` strategy delegates to the SDK's `compactTranscript` (no reimplementation — the SDK owns the algorithm); the app keeps when-to-compact and the summarize callback. Compaction is opt-in (`runner.compaction` is `undefined` when undeclared); the builder override wins over the decorator. Requires `@theokit/sdk >= 2.9.0` (the `keepTokens` token-budget mode).

## 0.7.0

### Minor Changes

- V4-D — `@MainLoop` react/plan-act-reflect loops gain two outer-loop terminals on `LoopStrategy`, surfaced on `DelegationResult.finishReason`: `no_progress` (the loop ends when the agent repeats the same round signature — sorted, key-canonical tool-call set + text — for 2 consecutive rounds, so a stuck agent no longer drains the whole `maxIterations` budget) and `step_limit` (the loop reports when it stopped at the `maxIterations` ceiling, distinct from a natural `stop`, and injects a graceful "summarize, no more tools" prompt hint on the final round — modeled on opencode's `MAX_STEPS_PROMPT`). Both fire on both on-ramps (`delegate()` + `AgentRunner`) via the shared `runReflectiveLoop`; no new dependency, no `@theokit/sdk` change. Derived from the codex/opencode agent-loop study — neither implements no-progress, so it is a theokit value-add.

## 0.6.0

### Minor Changes

- d9012b4: V4-B/V4-C — `@MainLoop({ strategy })` gets a real multi-round reflective runtime (was metadata-only). A Zod-validated `LoopStrategy`/`ReflectionStrategy` contract + a shared `runReflectiveLoop` driver give the strategy field execution: `simple-chat` ⇒ one round (unchanged); `react`/`plan-act-reflect` ⇒ multi-round bounded by `maxIterations` (forced terminal at the ceiling), with a degenerate/empty round terminating as `stop`. Both on-ramps — `delegate()` (decorator) and `AgentRunner.builder()` (imperative twin) — route through the same driver, so the runtime metric, cumulative budget, typed errors and result shape are identical (ADR D4). The loop lives in the bridge while the model call stays in the SDK `Run.stream()` (no second runtime, ADR 0031). Modeled on Mastra's `agentic-loop`/`stopWhen` + `maxSteps` ceiling.

  Also fixes the `event-translator` against the real `@theokit/sdk` `SDKMessage` union: assistant content is read from `msg.message.content`, the cloud-run status enum is matched UPPERCASE (`FINISHED`/`CANCELLED` → done, `ERROR`/`EXPIRED` → error — fail-loud), `tool_call` uses `call_id`, and `thinking` reads `msg.text`. Previously a live SDK run returned an empty response and silently swallowed `ERROR`. The adapter's fallback `done` is now conditional so a translated `FINISHED` does not double-emit the terminal.

## 0.5.0

### Minor Changes

- fa1518b: M8 — declarative decorators get SDK-backed runtime. `@Skills`, `@ContextWindow`, and `@ProjectContext` are no longer metadata-only: the bridge compiles each into a native `@theokit/sdk` `Agent.create()` field (`skills` → `SkillsSettings`, `@ContextWindow` → `ContextSettings.maxTokens`, `@ProjectContext` → a `systemPrompt` resolver composing the env block + repo map + nearest `THEO.md` via `@theokit/sdk-tools` + `@theokit/sdk/project`), and the SDK executes it (the bridge compiles; the SDK runs — `sdk-runtime.md`). Decorator knobs with no native SDK mapping now emit a stable `THEO_AGENT_*_METADATA_ONLY` warning at compile time instead of silently doing nothing. Requires `@theokit/sdk >= 2.5.0`; adds `@theokit/sdk-tools` as an optional peer.
