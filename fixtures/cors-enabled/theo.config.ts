import { defineConfig } from 'theokit'

export default defineConfig({
  security: {
    cors: {
      origins: ['http://localhost:5174'],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Theo-Action'],
      exposedHeaders: ['X-Trace-Id'],
      credentials: true,
      maxAge: 600,
    },
  },
})
