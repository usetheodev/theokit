---
"@theokit/agents": minor
---

A shared session store can be declared through the authoring surface. Serverless and multi-pod were unreachable without it.

The SDK takes `local.sessionStore` — a Postgres / Redis / KV / durable-object store used as the
primary session store and resume source, for deployments where the filesystem is ephemeral or the
next request lands on a different host. Measured: `sessionStore` returned 0 files in this layer.

This layer's stated doctrine, repeated across roughly eight docblocks, is that a consumer should not
import `@theokit/sdk` directly. With no authoring surface for the store, the only way to reach it was
to do exactly that — so **the doctrine and the capability disagreed, and the consumer paid**.

`SessionStoreCapability` writes the field and `assembleM8CreateOptions` projects it. `SessionStore`
crosses the barrel with it: forwarding a capability whose type cannot be named does not close the
gap, and the item says so.

The block is written only when a store was declared. An unconditional write creates `local` for every
agent — a claim about setting sources and a cwd that no author made. The first version of the control
asserted only `local?.sessionStore`, which passes for the unconditional write too since the key lands
as `undefined` either way; it asserts the block now.

Two existing gates fired on this change and were right both times: the compile-time waist-field
exhaustiveness check demanded the new field be classified, and the derived coverage test demanded the
capability join the "everything switched on" fixture. Neither needed to be found by review.
