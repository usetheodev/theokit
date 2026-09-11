---
"@theokit/agents": minor
---

`.plugins()` refuses a filesystem-bundle entry instead of accepting and ignoring it, and its parameter says what belongs there.

**BREAKING:** `plugins` was `readonly unknown[]` and is now `readonly CodePlugin[]`. Anything that
already passed `{ name, register }` objects is unaffected.

The word `plugins` appears in both vocabularies and means different things. This layer's are CODE
objects registered with the runtime's lifecycle seam; the Claude Code format's are filesystem
BUNDLES. A consumer who read the other product's documentation passed
`[{ type: 'local', path: './p' }]`, the compiler accepted it because the parameter was `unknown[]`,
and the agent ran with the plugin absent — **the typecheck that should have caught it was what let it
through**.

**The survey's "not implemented on either side" was too strong, and the correction matters for the
error message.** A bundle *directory* is discovered: `pluginBundleDirs` reads `.claude/plugins/*` and
`.theokit/plugins/*`, and the `skills/` and `agents/` subdirectories of each are loaded. What is
absent is the manifest (`.claude-plugin/plugin.json`), marketplaces, and the format's other
contributions — hooks, MCP servers, output styles, LSP servers.

So a path-shaped entry is not refused because bundles are unsupported. It is refused because this
*parameter* is not how a bundle is declared, and the message says where one goes and what a bundle
does and does not contribute. A refusal that does not name where the capability lives sends the
reader to a changelog.

The check runs at the projection, the single point every authoring path converges on. Putting it on
the builder method would miss `defineAgent({ plugins })` and the capability — which is how the shape
reached the runtime unexamined in the first place.

A plain wrong value gets a different message from a bundle reference: a string is not a bundle, and
pointing its author at a `plugins/` directory would send them somewhere that cannot help.
