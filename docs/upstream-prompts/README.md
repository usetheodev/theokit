# Upstream prompts — `@usetheo/ui`

Architectural prompts shipped to the `@usetheo/ui` team to fix issues discovered while integrating with TheoKit. Each prompt follows the same pattern: precise repro, root cause from real built-source line numbers, ranked options, recommended fix with code, acceptance criteria, prior-art references.

The pattern works: every prompt below was accepted + shipped in a `next.0` release within the same sprint.

## Tracking

| # | Issue | Prompt → ship | Fix verified in TheoKit |
|---|---|---|---|
| 1 | Tailwind v4 utilities not picking up `@source` glob on pnpm symlinks (hover state didn't work) | Prompt (informal) → `@usetheo/ui@0.6.1-next.0` — precompiled `components.css` defense-in-depth | ✓ verified in `examples/full-stack-agent` |
| 2 | Tailwind v4 button preflight removed `cursor: pointer` — button looked non-clickable | Prompt (informal) → `@usetheo/ui@0.6.2-next.0` — defense-in-depth `cursor: pointer` reset | ✓ verified in `examples/full-stack-agent` |
| 3 | ThemeSwitcher hydration mismatch on SSR — `useState(() => localStorage.getItem(...))` anti-pattern | **[Prompt arquivado neste diretório](./usetheo-ui-themeswitcher-hydration-mismatch.md)** → `@usetheo/ui@0.6.3-next.0` — `useEffect` deferral + `skipFirstPersistRef` + `ThemeScript` with `defaultDensity` | ✓ verified 2026-05-23: zero hydration errors, SSR renders `Violet Forge`, useEffect promotes to stored value post-mount |

## Why these prompts work

Pattern that produces shippable fixes:

1. **Repro in ≤7 steps.** No "sometimes", no "in certain conditions". Exact command sequence.
2. **Root cause from the built source.** Line numbers from their actual `dist/index.js`, not from speculation. They open the file and see the bug.
3. **Three options ranked.** Not "do X". Show the alternative paths, name the trade-off explicitly, pick one with rationale.
4. **Full code for the recommended option.** Drop-in replacement they can paste. No "TODO finish this".
5. **Acceptance criteria.** Observable conditions (DevTools console, byte-equal HTML, no flicker). Not "should be better".
6. **Semver hint.** Tell them which version bump kind fits (patch/minor/major) so they don't lose time deciding.
7. **Prior art (3+ refs).** Cite who else solved this exact problem and how (Vercel `next-themes`, Mantine, shadcn). Reduces "but my way is special" friction.
8. **No marketing language.** No "production-ready", "robust", "elegant". Just engineering claims.

## Anti-patterns (don't ship prompts like these)

- "Please fix the theme thing, it doesn't work." — no repro, no root cause, no proposal.
- "Add a flag to disable this." — pushes maintenance burden onto users; doesn't fix the bug.
- "This is broken for everyone." — without evidence.
- Long preamble + politics. The prompt is engineering communication, not stakeholder management.

## Process

1. Hit a real bug while integrating.
2. Reproduce minimally (single command).
3. Read the consumer's actual built code (find `node_modules/.pnpm/<pkg>@<v>/.../dist/`).
4. Locate the exact line that's wrong.
5. Write the prompt following the template (see existing ones).
6. Save to `docs/upstream-prompts/<short-slug>.md`.
7. Ship via the team's preferred channel (issue, Slack, repo PR).
8. When the fix lands, add a row above + bump the package version in the relevant manifests.
9. Verify via `pnpm install` + manual smoke + add row to "Fix verified" column.
