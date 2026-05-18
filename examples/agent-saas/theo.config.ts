import { defineConfig } from 'theokit'

export default defineConfig({
  port: 4242,
  ssr: true,
  ssrStreaming: true,
  ui: { theme: 'violet-forge', fonts: 'bundled' },
  rateLimit: { windowMs: 60_000, max: 60 },
  upload: { maxFileSize: 5 * 1024 * 1024, maxFiles: 3 },
  serialization: 'superjson',
  logging: { level: 'info' },
})
