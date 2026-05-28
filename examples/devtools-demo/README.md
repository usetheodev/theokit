# Theo Devtools — Live Demo

A minimal app that exercises every devtools tab. Run, click buttons, watch the chip light up.

## Run

```bash
# from monorepo root
pnpm install
cd examples/devtools-demo
pnpm dev
# open http://localhost:3470
```

## What to try

The home page has 5 buttons; each surfaces a different devtools feature:

| Button | What you'll see |
|---|---|
| **POST /api/hello (clean)** | Requests tab → row with method/path/status/duration/traceId |
| **POST with `?token=` + Auth header** | Requests tab → token in path is `[REDACTED]`; Authorization header is `[REDACTED]` |
| **Raw fetch (no CSRF header)** | Errors tab → `CSRF_STRICT_CUTOVER` entry with clickable `docsUrl` |
| **console.error()** | Errors tab → console entry |
| **Unhandled rejection** | Errors tab → unhandled entry |

Plus:

- **Nav links (Home / About / Products)** → Routes tab highlight follows you.
- **Click a row in Routes tab** → opens the file in your editor (needs `VITE_EDITOR=code` env).
- **Drag the chip** → springs to nearest corner; position persists across reloads.
- **Escape** → closes the panel.
- **Ctrl+Shift+D** (or Cmd+Shift+D on Mac) → toggles chip visibility.
- **Settings tab** → change position/theme; reload to confirm persistence.

## Config knobs (try in `theo.config.ts`)

```ts
// Disable devtools entirely (chip won't appear)
devtools: false

// Start in a specific corner
devtools: { position: 'top-left' }

// Force theme
devtools: { theme: 'dark' }
```

After any config change: restart `pnpm dev`.

## Production verification

```bash
pnpm build
# Inspect .theo/client/assets/index-*.js — zero devtools code (tree-shaken)
grep theo-devtools .theo/client/assets/*.js   # MUST find nothing
grep goober .theo/client/assets/*.js          # MUST find nothing
```

## What's in this demo

```
examples/devtools-demo/
├── app/
│   ├── layout.tsx          ← shared shell with nav
│   ├── page.tsx            ← Home — the 5 demo buttons live here
│   ├── about/page.tsx      ← second route for Routes tab demo
│   └── products/page.tsx   ← third route
├── server/routes/
│   └── hello.ts            ← POST /api/hello — exercised by the buttons
├── theo.config.ts          ← devtools config knobs (all commented out by default)
├── index.html
├── tsconfig.json
└── package.json
```
