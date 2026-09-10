---
'@theokit/agents': patch
---

A delegated member no longer replaces its parent's `transform_tool_result` or `pre_user_send`
handler — both now chain parent-first, matching the five events that already composed.

`inheritHooks` documents its security property as "the parent's refusal is evaluated first, and a
member can only ever ADD a reason to refuse". For these two events the plain object spread did the
opposite: a member declaring either handler silently discarded the parent's. `transform_tool_result`
is wired today, so a parent redacting tool output lost that redaction to any member that also
transformed.

`pre_user_send` composes additively — both contributions reach the model, parent first — because
`PreUserSendResult` carries only `recalledContext` and the seam exposes no prompt mutation.
