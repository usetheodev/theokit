---
"@theokit/agents": patch
---

A `.mcp.json` written against the current MCP spec is accepted.

The specification renamed the HTTP transport to "Streamable HTTP". `validateRemote` accepted
`"http"` and `"sse"` and refused anything else, so a server declared with the spec own current
name was dropped — with a message about a field the author had written correctly.

It is an ALIAS, normalised at the boundary, not a third transport. They are one transport under two
names, and forwarding the synonym downstream would ask every consumer of the parsed config to learn
it too; the SDK own `McpServerConfig` does not carry it. The parser accepts what the author wrote
and hands on what the runtime speaks.

An invented transport is still refused. Accepting the alias must not turn the check into a
pass-through, and a silent acceptance would be worse than the refusal this started as.
