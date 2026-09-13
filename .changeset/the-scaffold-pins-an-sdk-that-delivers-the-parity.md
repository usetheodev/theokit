---
"create-theokit": major
---

A scaffolded project now pins `@theokit/sdk@^5.0.0`, the line that actually carries the parity.

The default template pinned `^4.52.1`. Measured by unpacking the published tarballs: `CompatSurface`,
the `.claude/rules` discovery spec, `settings.local.json` and `CLAUDE_PROJECT_DIR` have **0 files**
in 4.52.1 and 10 / 4 / 4 / 14 from 5.0.0, against a control of `AgentOptions` at 83-86 in every one.
So every project this scaffold created started with an SDK delivering none of the `.claude`
compatibility the framework advertises, and nothing said so. Of everywhere that floor was declared,
this is the one that reaches people who never read a range.

Found by the framework's own gate rather than by inspection: `create-theo-default-template.test.ts`
asserts the template's pin is not below the floor the framework declares, and it went red the moment
that floor moved (B-029).

**The template's own prose changed with it, because the pin falsified it.** `dot-theokit/THEO.md`
explained that `.theokit/THEO.md` was the **only** path a `THEO.md` is read from, and justified
keeping the file there on the grounds that 5.x was published on the `next` channel only. Both halves
expired — 5.5.0 is `latest`, and on 5.x a root `THEO.md` is read at priority 55 while
`.theokit/THEO.md` sits at 60. The file stays where it is, and the reason is now that it **wins** a
conflict rather than that the root is unreadable. `theo-md-location.test.ts` is what forced that
rewrite instead of letting the explanation outlive its premise; its anchor moved to the two
priorities whose order is the actual reason.

**Breaking** for anyone generating a project that must stay on `@theokit/sdk@4.x`. That project was
already receiving none of the parity above.
