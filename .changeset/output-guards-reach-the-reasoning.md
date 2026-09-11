---
'@theokit/agents': minor
---

Output guards now moderate `thinking` events, not only `text_delta`.

`AgentRunner` handed `moderateOutputStream` an extractor matching `text_delta` and nothing else,
while `thinking` is a public `AgentStreamEvent` that reaches the client like any other. Measured: a
guard declared over the agent's output delivered `thinking "the key is sk-abc123"` verbatim. An
operator who declares `guardrails` believes the output is moderated; one of the two client-visible
text channels was not.

The third channel of a shape fixed twice already in this release — a streamed redaction that was
computed and discarded, and `delegate()` consulting no guards at all.

**Two passes, not one wider extractor.** Widening `extractText` to match both kinds is the obvious
move and the wrong one: two kinds under one extractor COLLAPSE into a single event, so the reasoning
would be promoted into a visible one — the moderation creating the disclosure it exists to close.
Composing two passes is what `moderateOutputStream`'s own docblock prescribes, and each pass seeing
one kind is what keeps them apart.

The visible pass owns the aggregate: `DelegationResult.response` accumulates from `text_delta`
upstream, so the reasoning pass passes the result through rather than replacing it.

A blocking guard on either channel still throws before any event is emitted. An agent with no output
guard is byte-identical.
