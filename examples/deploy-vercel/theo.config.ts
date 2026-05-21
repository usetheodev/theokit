import { defineConfig } from 'theokit'

/**
 * T4.1 — Minimal example deployable to Vercel for the deploy adapter
 * end-to-end smoke. SSR enabled so the smoke script can assert page
 * content via curl (no JS execution).
 */
export default defineConfig({
  ssr: true,
})
