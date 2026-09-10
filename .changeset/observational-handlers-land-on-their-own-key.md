---
'@theokit/agents': patch
---

An observational hook handler is now assigned to its own key rather than chosen by comparison.

The dispatch loop used a two-branch conditional over a list of two event names, so a third
observational event would have landed on `post_assistant_reply` — silently, with no test objecting.
No behaviour changes for the events wired today; the fix removes the trap for the next one added.
