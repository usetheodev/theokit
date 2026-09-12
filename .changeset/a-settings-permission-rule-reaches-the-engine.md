---
'@theokit/agents': minor
---

Translate a settings `permissions` block into rules the engine evaluates

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
