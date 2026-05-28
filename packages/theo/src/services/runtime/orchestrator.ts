/**
 * Dev orchestration entry point (T2.4).
 *
 * Spawns declared polyglot services, waits for all healthchecks to pass,
 * then signals readiness. The `theokit dev` CLI calls `orchestrateDev`
 * BEFORE starting Vite — Vite only boots after all services healthy.
 *
 * Empty `services: {}` → no-op (Wave 1 BC).
 *
 * Single composable entry that the CLI consumes. Spawn/healthcheck/log
 * primitives live in their own modules; this file ties them together.
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import type { ServiceDefinition, ServicesConfig } from '../schema/schema.js'

import { pollHealthcheck } from './healthcheck-poller.js'
import { createLogMerger } from './log-merge.js'
import { buildSpawnEnv, installLifecycleHandlers } from './process-spawn-helpers.js'

export interface SpawnedService {
  name: string
  port: number
  process: ChildProcess
}

export interface OrchestrateDevOptions {
  cwd: string
  services: ServicesConfig
  /** Defaults to `process.stdout.write.bind(process.stdout)`. */
  write?: (s: string) => void
  /** Test injection — replace child_process.spawn. */
  spawnFn?: typeof spawn
  /** Test injection — replace global fetch (for healthchecks). */
  customFetch?: typeof fetch
  /** Healthcheck timeout per service. Default 30_000. */
  healthcheckTimeoutMs?: number
  /** Whether to install parent lifecycle handlers (EC-7). Default true. */
  installSignalHandlers?: boolean
}

export interface OrchestrateDevResult {
  spawned: SpawnedService[]
  /** Whether ALL services passed healthcheck. */
  allHealthy: boolean
  /** Services that timed out (only populated when !allHealthy). */
  unhealthy: string[]
  /** Call to gracefully stop all spawned services. */
  stop: () => Promise<void>
}

function spawnService(
  name: string,
  service: ServiceDefinition,
  cwd: string,
  options: {
    spawnFn: typeof spawn
    onLog: (s: string, stream: 'stdout' | 'stderr', line: string) => void
  },
): SpawnedService {
  const env = buildSpawnEnv(name, service, process.env)
  const spawnOpts: SpawnOptions = {
    cwd,
    shell: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
  const child = options.spawnFn(service.dev, spawnOpts)
  child.stdout?.setEncoding('utf-8')
  child.stderr?.setEncoding('utf-8')
  child.stdout?.on('data', (chunk: string) => {
    options.onLog(name, 'stdout', chunk)
  })
  child.stderr?.on('data', (chunk: string) => {
    options.onLog(name, 'stderr', chunk)
  })
  return { name, port: service.port, process: child }
}

async function stopSpawned(s: SpawnedService): Promise<void> {
  return new Promise<void>((resolve) => {
    if (s.process.killed || s.process.exitCode !== null) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      s.process.kill('SIGKILL')
      resolve()
    }, 5_000)
    s.process.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    s.process.kill('SIGTERM')
  })
}

export async function orchestrateDev(
  options: OrchestrateDevOptions,
): Promise<OrchestrateDevResult> {
  const entries = Object.entries(options.services)
  if (entries.length === 0) {
    return {
      spawned: [],
      allHealthy: true,
      unhealthy: [],
      stop: () => Promise.resolve(),
    }
  }

  const write =
    options.write ??
    ((s: string) => {
      process.stdout.write(s)
    })
  const spawnFn = options.spawnFn ?? spawn
  const merger = createLogMerger({ write })

  const spawned: SpawnedService[] = entries.map(([name, def]) =>
    spawnService(name, def, resolve(options.cwd, 'services', name), {
      spawnFn,
      onLog: merger.onLog,
    }),
  )

  const stop = async (): Promise<void> => {
    await Promise.all(spawned.map(stopSpawned))
  }

  if (options.installSignalHandlers !== false) {
    installLifecycleHandlers(process, stop)
  }

  // Parallel healthcheck
  const results = await Promise.all(
    entries.map(([name, def]) =>
      pollHealthcheck({
        url: `http://localhost:${String(def.port)}${def.healthcheck}`,
        timeoutMs: options.healthcheckTimeoutMs ?? 30_000,
        intervalMs: 500,
        customFetch: options.customFetch,
      }).then((r) => ({ name, result: r })),
    ),
  )

  const unhealthy = results.filter((r) => !r.result.healthy).map((r) => r.name)
  return {
    spawned,
    allHealthy: unhealthy.length === 0,
    unhealthy,
    stop,
  }
}
