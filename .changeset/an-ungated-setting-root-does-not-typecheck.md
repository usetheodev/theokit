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
