import { defineConfig } from 'theokit'

export default defineConfig({
  // Web port allocated by tests via { port: 0 } at startDevServer time.
  // Service port fixed (Wave 2 completion T0.2 reserved range 8100-8199).
  port: 3000,
  services: {
    agent: {
      runtime: 'python',
      port: 8101,
      proxy: '/api/agent',
      dev: 'uv run uvicorn main:app --reload --port 8101',
      start: 'uv run uvicorn main:app --port 8101 --workers 4',
      healthcheck: '/health',
      openapi: 'http://localhost:8101/openapi.json',
    },
  },
})
