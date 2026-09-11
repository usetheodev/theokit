---
'@theokit/agents': minor
---

Names the settings precedence stack: `SettingsLayer`, `SETTINGS_LAYERS`, `layerPrecedence` and
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
