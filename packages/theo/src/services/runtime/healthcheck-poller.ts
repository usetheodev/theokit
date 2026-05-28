/**
 * Healthcheck poller (T1.5).
 *
 * Polls `GET <url>` with backoff until 200 OR timeout. Used by `pnpm dev`
 * (T2.4) to gate readiness on declared services being healthy before
 * starting Vite.
 *
 * Invariants:
 *  - Returns within `timeoutMs + intervalMs` (no hang)
 *  - Never throws (returns `{ healthy: false }` on any error)
 *  - `attempts >= 1` always
 *  - Respects external AbortSignal (pre-aborted → immediate return, EC-18)
 */

export interface HealthcheckOptions {
  /** Full URL to poll, e.g. 'http://localhost:8001/health' */
  url: string
  /** Total time budget in ms. Default 30_000. */
  timeoutMs?: number
  /** Sleep between attempts in ms. Default 500. */
  intervalMs?: number
  /** Optional external cancel. Aborted signal causes early return. */
  signal?: AbortSignal
  /** Test injection — replace global fetch. */
  customFetch?: typeof fetch
}

export interface HealthcheckResult {
  healthy: boolean
  attempts: number
  durationMs: number
  lastError?: string
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const t = setTimeout(() => {
      resolve()
    }, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        resolve()
      },
      { once: true },
    )
  })
}

export async function pollHealthcheck(options: HealthcheckOptions): Promise<HealthcheckResult> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const intervalMs = options.intervalMs ?? 500
  const f = options.customFetch ?? fetch
  const start = Date.now()
  let attempts = 0
  let lastError: string | undefined

  // EC-18: signal already aborted → return immediately with at least 1 attempt counted
  if (options.signal?.aborted) {
    return {
      healthy: false,
      attempts: 1,
      durationMs: Date.now() - start,
      lastError: 'aborted',
    }
  }

  // Infinite poll loop terminated by status === 200 OR timeout OR abort.
  for (;;) {
    if (options.signal?.aborted) {
      return {
        healthy: false,
        attempts: Math.max(attempts, 1),
        durationMs: Date.now() - start,
        lastError: 'aborted',
      }
    }
    attempts++
    try {
      const res = await f(options.url, { method: 'GET', signal: options.signal })
      if (res.status === 200) {
        return { healthy: true, attempts, durationMs: Date.now() - start }
      }
      lastError = `status ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }

    if (Date.now() - start >= timeoutMs) {
      return {
        healthy: false,
        attempts,
        durationMs: Date.now() - start,
        lastError,
      }
    }
    await sleep(intervalMs, options.signal)
  }
}
