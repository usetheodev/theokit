# fixtures/cron-basic

Minimal TheoKit fixture exercising `defineCron`. Used by integration tests.

## Layout

```
server/
  crons/
    morning-summary.ts  — runs at 09:00 UTC every day
```

Build emits `.theo/crons.json` manifest. Adapter translators (Vercel/CF/AWS/Deno)
read the manifest and emit platform-native triggers. See
`packages/theo/src/server/cron/adapter-translators.ts`.
