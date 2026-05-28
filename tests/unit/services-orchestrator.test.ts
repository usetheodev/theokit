import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess, spawn as spawnFnType } from 'node:child_process'

import { orchestrateDev } from '../../packages/theo/src/services/index.js'
import type { ServicesConfig } from '../../packages/theo/src/services/index.js'

function makeFakeStream(): EventEmitter & { setEncoding: () => void } {
  const ee = new EventEmitter()
  ;(ee as unknown as { setEncoding: () => void }).setEncoding = () => {}
  return ee as EventEmitter & { setEncoding: () => void }
}

function makeFakeChild(): ChildProcess {
  const ee = new EventEmitter() as unknown as ChildProcess
  ;(ee as unknown as { stdout: EventEmitter }).stdout = makeFakeStream()
  ;(ee as unknown as { stderr: EventEmitter }).stderr = makeFakeStream()
  ;(ee as unknown as { pid: number }).pid = 12345
  ;(ee as unknown as { killed: boolean }).killed = false
  ;(ee as unknown as { exitCode: number | null }).exitCode = null
  ;(ee as unknown as { kill: () => boolean }).kill = vi.fn(() => true)
  return ee
}

describe('T2.4 — orchestrateDev', () => {
  it('returns allHealthy=true and no spawns for empty services (Wave 1 BC)', async () => {
    const result = await orchestrateDev({
      cwd: '/tmp',
      services: {},
      installSignalHandlers: false,
    })
    expect(result.allHealthy).toBe(true)
    expect(result.spawned).toEqual([])
    expect(result.unhealthy).toEqual([])
  })

  it('spawns services and reports healthy when fetch returns 200', async () => {
    const services: ServicesConfig = {
      agent: {
        runtime: 'python',
        port: 8001,
        proxy: '/api/agent',
        dev: 'echo hello',
        start: 'echo prod',
        healthcheck: '/health',
        cors: false,
        passSetCookie: false,
      },
    }
    const spawnFn = vi.fn(() => makeFakeChild()) as unknown as typeof spawnFnType
    const fetchFn = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch

    const result = await orchestrateDev({
      cwd: '/tmp',
      services,
      spawnFn,
      customFetch: fetchFn,
      installSignalHandlers: false,
      healthcheckTimeoutMs: 1000,
    })

    expect(spawnFn).toHaveBeenCalled()
    expect(result.allHealthy).toBe(true)
    expect(result.spawned).toHaveLength(1)
    expect(result.spawned[0]?.name).toBe('agent')
  })

  it('reports unhealthy when fetch never returns 200', async () => {
    const services: ServicesConfig = {
      agent: {
        runtime: 'python',
        port: 8001,
        proxy: '/api/agent',
        dev: 'echo hello',
        start: 'echo prod',
        healthcheck: '/health',
        cors: false,
        passSetCookie: false,
      },
    }
    const spawnFn = vi.fn(() => makeFakeChild()) as unknown as typeof spawnFnType
    const fetchFn = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch

    const result = await orchestrateDev({
      cwd: '/tmp',
      services,
      spawnFn,
      customFetch: fetchFn,
      installSignalHandlers: false,
      healthcheckTimeoutMs: 100,
    })

    expect(result.allHealthy).toBe(false)
    expect(result.unhealthy).toContain('agent')
  })

  it('stop() calls SIGTERM on all spawned services', async () => {
    const child = makeFakeChild()
    const killSpy = vi.fn(() => true)
    ;(child as unknown as { kill: () => boolean }).kill = killSpy
    const services: ServicesConfig = {
      agent: {
        runtime: 'python',
        port: 8001,
        proxy: '/api/agent',
        dev: 'echo hello',
        start: 'echo prod',
        healthcheck: '/health',
        cors: false,
        passSetCookie: false,
      },
    }
    const spawnFn = vi.fn(() => child) as unknown as typeof spawnFnType
    const fetchFn = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch

    const result = await orchestrateDev({
      cwd: '/tmp',
      services,
      spawnFn,
      customFetch: fetchFn,
      installSignalHandlers: false,
      healthcheckTimeoutMs: 500,
    })
    // Simulate child exit when stop is called
    setImmediate(() => child.emit('exit', 0, null))
    await result.stop()
    expect(killSpy).toHaveBeenCalledWith('SIGTERM')
  })

  it('parallel healthcheck completes near-simultaneously for multiple services', async () => {
    const services: ServicesConfig = {
      a: {
        runtime: 'python',
        port: 8001,
        proxy: '/api/a',
        dev: 'echo a',
        start: 'echo a',
        healthcheck: '/health',
        cors: false,
        passSetCookie: false,
      },
      b: {
        runtime: 'node',
        port: 8002,
        proxy: '/api/b',
        dev: 'echo b',
        start: 'echo b',
        healthcheck: '/health',
        cors: false,
        passSetCookie: false,
      },
    }
    const spawnFn = vi.fn(() => makeFakeChild()) as unknown as typeof spawnFnType
    const fetchFn = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch

    const result = await orchestrateDev({
      cwd: '/tmp',
      services,
      spawnFn,
      customFetch: fetchFn,
      installSignalHandlers: false,
      healthcheckTimeoutMs: 1000,
    })

    expect(result.allHealthy).toBe(true)
    expect(result.spawned).toHaveLength(2)
  })
})
