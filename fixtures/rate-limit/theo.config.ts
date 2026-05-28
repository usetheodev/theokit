import { defineConfig } from 'theokit'

export default defineConfig({
  rateLimit: {
    windowMs: 10_000, // 10 second window
    max: 5, // 5 requests per window per client
  },
})
