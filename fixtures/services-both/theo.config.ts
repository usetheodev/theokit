import { defineConfig } from 'theokit'

export default defineConfig({
  port: 3000,
  services: {
    agent: {
      runtime: 'python',
      port: 8103,
      proxy: '/api/agent',
      dev: 'uv run uvicorn main:app --reload --port 8103',
      start: 'uv run uvicorn main:app --port 8103 --workers 4',
      healthcheck: '/health',
    },
    worker: {
      runtime: 'node',
      port: 8104,
      proxy: '/api/worker',
      dev: 'pnpm dev',
      start: 'pnpm start',
      healthcheck: '/health',
      dependsOn: ['agent'],
    },
  },
})
