---
'@theokit/agents': patch
---

State, where hook events are declared, that no seam can run before compaction

B-002 FR-004. A consumer needing to persist state before the transcript is compacted has no event to
bind to, and could only learn that by writing a handler and watching it never fire.

Measured against `@theokit/sdk@5.5.0`: `HookName` is a closed union of ten names with no compaction
member, and `PluginContext.on` keys its callback by that union — so no event name can be added from
this package. The SDK's own auto-compaction path is further out of reach: bundle-internal, absent
from every emitted `.d.ts` and all 33 export subpaths, and it builds its own summarizer at the call
site.

The docblock now says so and names `usetheokit/theokit-sdk#653`, the issue that unblocks it, so a
reader arrives at the nine candidate seams already ruled out rather than repeating the enumeration.

`hook-events.ts` is split out of `hook-spec.ts`, which had drifted to 616 lines against the 600 its
brief caps it at. Every symbol callers import stays importable from `hook-spec.js`.
