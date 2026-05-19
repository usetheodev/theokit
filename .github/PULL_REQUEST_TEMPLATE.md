# Summary

<!-- 1-3 sentences: what changes, why it matters. -->

## Test plan

<!-- Bulleted checklist of what you ran or what reviewers should run -->
- [ ] `npx vitest run` — unit + integration green
- [ ] `npx tsc -p packages/theo/tsconfig.json --noEmit` — type check clean
- [ ] `npx playwright test` — browser tests green
- [ ] `bash scripts/dogfood-smoke.sh` — health ≥ 41/48
- [ ] CHANGELOG.md updated under `[Unreleased]` (if user-visible)
- [ ] New code has at least one test that would have failed without the change

## Breaking changes

<!-- Yes / No. If yes, list:
   1. What breaks
   2. Migration path
   3. Whether docs/migrating/ needs an update -->

## Related

<!-- Link issues, PRs, plans, ADRs. Use #123 for issues/PRs. -->

## Notes for reviewers

<!-- Anything that helps reviewers focus: surprising design choices,
known risks, follow-up work that intentionally isn't in this PR. -->
