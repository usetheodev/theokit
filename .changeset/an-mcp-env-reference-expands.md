---
'@theokit/agents': patch
---

`${VAR}` in a `.mcp.json` `env` or `headers` block now resolves against the host environment.

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
That refusal is about a committed file handing a server the *whole* environment. A named reference
resolves *one* variable the host already chose to set — and refusing to expand it protects nothing,
since it pushes the author to paste the literal secret into the file instead.
