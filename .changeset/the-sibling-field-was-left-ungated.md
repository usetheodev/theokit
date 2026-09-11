---
'@theokit/agents': minor
---

`resolveCompatSources` now returns `readonly GatedCompatSource[]`, and
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
