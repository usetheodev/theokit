---
'@theokit/agents': minor
---

`resolveSettingSources` now returns `readonly GatedSettingSource[]`, and
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
`resolveCompatSources` refuses four lines earlier. A source whose surfaces all belong to this layer
is now dropped from the SDK's list rather than sent empty.
