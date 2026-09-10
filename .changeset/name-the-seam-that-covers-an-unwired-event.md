---
'@theokit/agents': patch
---

The "will NOT fire" warning for a declared-but-unwired hook event now names where the capability
already lives, instead of ending "the handler does not exist yet".

Two of the three unwired events are served today by purpose-built seams — `Guardrail.checkOutput`
for `transform_llm_output`, and `createToolHooksPlugin({ processInput })` for `pre_user_send` — so
the old message told consumers to wait for work that will not come. The third, `on_session_end`, is
named as genuinely uncovered, with the reason: its handler returns `void` and cannot refuse an
ending, so wiring it would produce a hook that runs and cannot decide.

Nothing is wired. `HOOK_EVENTS`, `WIRED_EVENTS` and `OBSERVATIONAL_EVENTS` keep the same members.
