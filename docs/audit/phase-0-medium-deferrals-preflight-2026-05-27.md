# Preflight baseline — architecture-medium-deferrals

Date: 2026-05-27

## LOC
  253 packages/theo/src/cli/commands/build.ts
  648 packages/theo/src/vite-plugin/index.ts
  901 total

## switch case count in build.ts
14

## tsc

## depcruise
✔ no dependency violations found (271 modules, 829 dependencies cruised)


## check:naming
> ls-lint


## Note on case count

Preflight finds 14 case statements:
- Lines 128-167 (9 cases): runAdapterBuild target switch — TARGET of P-1 refactor (Adapter Registry will eliminate these)
- Lines 208-224 (5 cases): emitCronArtifacts per-target cron translation — DIFFERENT concern (platform-specific cron emission, NOT dispatch); out of scope for P-1

After P-1 implementation, expected:
- 9 cases removed from runAdapterBuild
- 5 cases remain in emitCronArtifacts (intentional — different OCP variant requiring separate plan if addressed)
- Final case count: 5
