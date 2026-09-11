---
'@theokit/agents': patch
---

An `.mcp.json` field this runtime does not carry is now REPORTED instead of silently dropped.

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
