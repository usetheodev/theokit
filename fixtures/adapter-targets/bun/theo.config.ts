import { defineConfig } from 'theokit'

// Adapter target is selected via CLI flag:
//   pnpm theokit build --target=bun
//
// All adapter-target fixtures share the same theo.config.ts shape; what
// changes per target is the CLI invocation and any target-specific
// platform file (wrangler.toml, vercel.json, netlify.toml).
export default defineConfig({})
