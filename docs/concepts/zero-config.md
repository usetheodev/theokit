# Zero-Config: how TheoKit gets out of your way

> What the framework auto-loads, auto-wires, and auto-cleans so you can focus on the agent — and where it deliberately stops, so you stay in control.

## What's automatic

### 1. `.env` files load into `process.env` for server code

When you run `theokit dev`, `theokit build`, or `theokit start`, the framework loads `.env` files in this priority order (top wins):

1. `.env.{mode}.local` (e.g., `.env.development.local`)
2. `.env.local` (skipped in `mode === 'test'`)
3. `.env.{mode}` (e.g., `.env.production`)
4. `.env`

Values become available via `process.env.KEY` in your route handlers, server actions, middleware, and any code under `server/`.

```dotenv
# .env
OPENROUTER_API_KEY=sk-or-v1-...
DATABASE_URL=postgres://localhost/myapp
```

```ts
// server/routes/chat.ts
export const POST = defineRoute({
  handler: () => {
    const key = process.env.OPENROUTER_API_KEY // populated by the framework
    // ...
  },
})
```

#### `${VAR}` expansion

`.env` files support cross-referencing variables, including ones already in `process.env`:

```dotenv
BASE_URL=https://api.example.com
WEBHOOK_URL=${BASE_URL}/webhook
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@host/db
```

`DB_USER` and `DB_PASS` resolve from your shell env (or earlier `.env` lines).

#### Real `process.env` wins

If `process.env.KEY` is already set (CI/CD, shell export, Docker `-e`), the `.env` value does **not** overwrite it. The framework treats real env as the source of truth.

#### Standalone scripts

For standalone scripts (cron jobs, queue consumers, Telegram bots) that run outside `theokit dev/build/start`, import `loadEnv` and call it before reading env vars:

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'theokit/server'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ cwd: resolve(__dirname, '..') }) // explicit cwd — anti-EC-7
```

#### Known limitations

- **No hot-reload on `.env` edits.** Restart the dev server after editing `.env`. Reload-on-watch is on the roadmap.
- **`NODE_ENV` from `.env` is stashed in `__THEOKIT_USER_NODE_ENV`, not propagated.** The real `process.env.NODE_ENV` (set by the CLI) wins. This prevents accidental `NODE_ENV=production` in a dev `.env` from breaking the dev server.
- **`.env` files larger than 1MB are skipped with a warning** (anti-OOM / anti-supply-chain).

---

### 2. Tailwind + `@usetheo/ui` styling auto-configures

When you have `@usetheo/ui` in your `package.json` dependencies, TheoKit's Vite plugin automatically:

1. Detects `@usetheo/ui` and `@tailwindcss/vite` via Node module resolution (handles pnpm hoist).
2. Dynamic-imports both and chains them into the Vite plugin array.
3. No consumer-side `tailwind.config.ts` or `postcss.config.js` required.

```bash
pnpm create theokit my-app
cd my-app
pnpm add @usetheo/ui @tailwindcss/vite
pnpm dev
# Styled TheoUI components work immediately.
```

#### Override: your config wins

If you create a `tailwind.config.{ts,js,mjs,cjs}` or `postcss.config.{ts,js,mjs,cjs}` (walked up to 3 levels from project root), the framework **defers** — auto-config skips, and a one-line info message reminds you that you can extend with the UI preset:

```ts
// tailwind.config.ts
import preset from '@usetheo/ui/preset'

export default {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}'],
}
```

This keeps the TheoUI theme tokens in sync while letting you add your own classes/plugins.

#### When `@tailwindcss/vite` is missing

If you have `@usetheo/ui` but not `@tailwindcss/vite`, the framework emits a single line:

```
[theokit] @usetheo/ui detected but @tailwindcss/vite is not installed.
Run `pnpm add -D @tailwindcss/vite` to enable styling.
```

---

### 3. State cleanup runs automatically

#### `.theo/` (build output) — emptied at build start

`theokit build` empties the `.theo/` directory at the start of every build (preserving `.git`, `.gitkeep`, `.gitignore`). Build output is always hermetic — no stale manifests from a prior build version.

Path safety: the framework refuses to clean any directory outside your project's `cwd`, even if `distDir` is somehow misconfigured. A misconfigured `distDir: '/'` would throw at config load (Zod refine) AND at runtime (cleanOutDir guard).

#### `.theokit/agents/<id>/` (runtime cache) — LRU on dev startup

Each `theokit dev` boot runs LRU cleanup of `.theokit/agents/`:

- Lists all subdirectories.
- Sorts ascending by mtime.
- Deletes the oldest entries until count ≤ `agents.maxRegistries` (default: 100).

If anything got cleaned, you see a single log line:

```
[theokit] Cleaned 12 stale agent registries (kept 100)
```

Override the cap in your config:

```ts
// theo.config.ts
export default defineConfig({
  agents: {
    maxRegistries: 250,
  },
})
```

Cleanup is lockless. Two `theokit dev` invocations racing each other accept the lost-update — agent caches are regenerable.

---

## What's NOT automatic (deliberate)

- **API key rotation, secret management.** TheoKit reads `.env`; it does NOT sync with Vault, AWS Secrets Manager, or any cloud secret store. Use your CI/CD's env injection for production secrets.
- **Static asset CDN upload, image optimization.** Out of scope. Use your deploy adapter's native tooling (Vercel image CDN, Cloudflare Images, etc.) for these concerns.
- **Production `.env` enforcement.** The framework loads `.env` in `production` mode too — but the strong recommendation is to use real env vars in production (Docker `-e`, K8s secrets, platform vars) so you can audit secret rotation independently.
- **Cross-tenant `.theokit/agents/` isolation.** If you run multi-tenant agents in production, you need to manage agent lifecycle / GC at your application layer. The framework's LRU is a dev-time convenience, not a multi-tenant production guarantee.

---

## Migration from manual configs

If you had a hand-rolled `.env` loader, manual `tailwind.config.ts` extending `@usetheo/ui`, or were accumulating `.theokit/agents/` cruft, run:

```bash
theokit check
```

The upgrade-readiness scanner flags:

- `zero-config-tailwind-suggest` — your `tailwind.config` is missing `@usetheo/ui/preset` extension.
- `handrolled-dotenv-suggest` — a `server/` file imports `dotenv` directly. You can delete the import; the framework auto-loads.

Each hint includes a one-line fix suggestion.

---

## See also

- Reference doc: `.claude/knowledge-base/reference/zero-config-integration.md` (940 LOC prior-art audit of Next.js / Astro / Nuxt / Vite / SvelteKit conventions).
- Plan: `docs/plans/framework-zero-config-polish-plan.md`.
- Spike: `docs/spikes/usetheo-ui-vite-plugin-shape.md` (cross-repo `@usetheo/ui` API contract).
