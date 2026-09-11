---
'@theokit/agents': minor
---

Read the settings files the declared layers correspond to

`SETTINGS_LAYERS` published a precedence stack — `user` 10, `project-shared` 20, `project-local` 30 —
and opened no file. Measured with controls (`loadMcpJson` 5 files, an invented term 0):
`settings.local.json` appeared once in this package, as a comment; `outputStyle` appeared zero times
here and zero times in the SDK's built output.

Three documented features were unreachable for that one reason. `settings.local.json` had a
precedence and no reader. `outputStyle` had a loader — shipped in this same line of work — with no
caller and no source for the name it takes. The session `env` had neither.

`loadSettings` opens the three files, folds them through the existing `LayeredConfig` (rather than
deriving a second answer to "which layer wins"), and reports which declared layers contributed
nothing. `resolveOutputStyle` joins the two halves so the documented path works end to end: name a
style in settings, get the style — and a named style with no file behind it still refuses, because
returning nothing there would restore the silence this work removed.

Unknown keys pass through untouched. The brief is the same mechanisms, not every configuration, and
a reader that dropped what it did not recognise would silently discard an operator's settings.
