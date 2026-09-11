---
"@theokit/agents": minor
---

An operator can decide which MCP servers from a project `.mcp.json` may start. Nothing decided before.

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
