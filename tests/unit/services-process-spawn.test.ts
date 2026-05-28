import { describe, it, expect, vi } from 'vitest'
import {
  buildSpawnEnv,
  formatLogPrefix,
  installLifecycleHandlers,
} from '../../packages/theo/src/services/index.js'
import type { ServiceDefinition } from '../../packages/theo/src/services/index.js'

const SERVICE: ServiceDefinition = {
  runtime: 'python',
  port: 8001,
  proxy: '/api/agent',
  dev: 'uvicorn main:app',
  start: 'uvicorn main:app --workers 4',
  healthcheck: '/health',
  cors: false,
  passSetCookie: false,
}

describe('T2.2 — process-spawn helpers', () => {
  describe('buildSpawnEnv (EC-8 auto-inject)', () => {
    it('injects THEOKIT_SERVICE_NAME', () => {
      const env = buildSpawnEnv('agent', SERVICE, { OTHER: 'x' })
      expect(env.THEOKIT_SERVICE_NAME).toBe('agent')
    })

    it('injects THEOKIT_SERVICE_PORT as string', () => {
      const env = buildSpawnEnv('agent', SERVICE, {})
      expect(env.THEOKIT_SERVICE_PORT).toBe('8001')
    })

    it('user env wins over auto-injected names', () => {
      const env = buildSpawnEnv(
        'agent',
        { ...SERVICE, env: { THEOKIT_SERVICE_NAME: 'custom' } },
        {},
      )
      expect(env.THEOKIT_SERVICE_NAME).toBe('custom')
    })

    it('preserves process.env values not overridden', () => {
      const env = buildSpawnEnv('agent', SERVICE, { PATH: '/usr/bin' })
      expect(env.PATH).toBe('/usr/bin')
    })

    it('service.env overrides process.env', () => {
      const env = buildSpawnEnv('agent', { ...SERVICE, env: { MY_VAR: 'a' } }, { MY_VAR: 'b' })
      expect(env.MY_VAR).toBe('a')
    })
  })

  describe('formatLogPrefix', () => {
    it('returns service name prefix', () => {
      expect(formatLogPrefix('agent')).toMatch(/agent/)
    })

    it('keeps prefix short', () => {
      const prefix = formatLogPrefix('agent')
      // ANSI codes ignored, raw string contains service name + brackets
      expect(prefix).toContain('[')
      expect(prefix).toContain(']')
    })
  })

  describe('lifecycle handler registration (EC-7)', () => {
    it('exposes installLifecycleHandlers function', async () => {
      const mod = await import('../../packages/theo/src/services/index.js')
      expect(typeof mod.installLifecycleHandlers).toBe('function')
    })

    it('installLifecycleHandlers registers exit/SIGINT/SIGTERM', () => {
      const onMock = vi.fn()
      const proc = { on: onMock } as unknown as NodeJS.Process
      installLifecycleHandlers(proc, async () => {})
      expect(onMock).toHaveBeenCalledTimes(3)
      const events = onMock.mock.calls.map((c) => c[0] as string)
      expect(events).toEqual(expect.arrayContaining(['exit', 'SIGINT', 'SIGTERM']))
    })
  })
})
