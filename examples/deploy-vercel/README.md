# deploy-vercel example

Minimal TheoKit project used to validate the Vercel adapter end-to-end.

## What it validates

The `deploy:smoke` script asserts (against a live URL):

1. `GET /` returns 200 with `<h1>TheoKit deployed</h1>` in the HTML
2. `GET /api/health` returns 200 with `{ ok: true, adapter: "vercel" }`
3. The framework's `x-theo-deployed-by: vercel` header is present
4. Response is HTTP chunked transfer encoding (SSR streaming verified)

## How to run it (locally)

```bash
pnpm install
pnpm dev
# open http://localhost:3471
```

## How to deploy + smoke (requires `VERCEL_TOKEN`)

```bash
export VERCEL_TOKEN=your-vercel-token
pnpm deploy:smoke
```

The script:
1. Runs `vercel build` to produce the output
2. Runs `timeout 300 vercel deploy --token $VERCEL_TOKEN --yes` (5-min cap, EC-7)
3. Captures the deployment URL
4. Runs `curl --max-time 30` against `/` and `/api/health`
5. Appends a JSON line to `deploy-evidence.jsonl` at the repo root

Exit code 0 = all assertions passed.
