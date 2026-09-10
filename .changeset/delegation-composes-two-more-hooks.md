---
'@theokit/agents': patch
---

`inheritHooks` no longer lets a member's `transform_tool_result` or `pre_user_send` handler replace
its parent's — both now chain parent-first, matching the six events that already composed.

`inheritHooks` documents its security property as "the parent's refusal is evaluated first, and a
member can only ever ADD a reason to refuse". For these two events the plain object spread did the
opposite: a member declaring either handler silently discarded the parent's. The reachable surface is the EXPORTED `inheritHooks`, called with two handler maps.
`delegate()` passes `undefined` for the member (`agent-orchestrator.ts:175`), so that path composed
nothing and was never affected — a distinction the first version of this note got wrong.

`pre_user_send` composes additively — both contributions reach the model, parent first — because
`PreUserSendResult` carries only `recalledContext` and the seam exposes no prompt mutation.
