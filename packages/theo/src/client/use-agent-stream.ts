import { useCallback, useEffect, useRef, useState } from 'react'

import type { AgentEvent } from '../core/contracts/agent-events.js'

import { consumeAgentStream } from './agent-stream-core.js'

/**
 * T5.2 — useAgentStream
 *
 * React hook to consume an agent endpoint defined with `defineAgentEndpoint`.
 *
 * Transport (ADR D7, EC-3): fetch + ReadableStream — NOT EventSource.
 * EventSource is GET-only; agent endpoints need POST + body.
 *
 * Returns:
 *   events  — array of AgentEvents accumulated so far
 *   send    — call with a payload to (re)open a stream
 *   status  — 'idle' | 'streaming' | 'done' | 'error'
 *   abort   — manually cancel an in-flight stream
 *
 * Cleanup (EC-8): on unmount, the current AbortController fires .abort(),
 * which propagates to the underlying fetch and the ReadableStream reader.
 * Safe under React.StrictMode double-mount.
 */

export type AgentStreamStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface UseAgentStreamReturn<TBody = unknown> {
  events: AgentEvent[]
  status: AgentStreamStatus
  send: (body: TBody) => void
  abort: () => void
  reset: () => void
}

export interface UseAgentStreamOptions {
  /** Extra headers (e.g., auth). */
  headers?: Record<string, string>
  /** Override fetch (rare — primarily for tests). */
  fetch?: typeof fetch
}

export function useAgentStream<TBody = unknown>(
  path: string,
  options: UseAgentStreamOptions = {},
): UseAgentStreamReturn<TBody> {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<AgentStreamStatus>('idle')
  const controllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort()
      controllerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    abort()
    setEvents([])
    setStatus('idle')
  }, [abort])

  const send = useCallback(
    (body: TBody) => {
      // Cancel any in-flight stream first.
      abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setStatus('streaming')

      let sawError = false
      consumeAgentStream<TBody>(path, {
        body,
        fetch: options.fetch,
        headers: options.headers,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'error') sawError = true
          setEvents((prev) => [...prev, event])
        },
      })
        .then(() => {
          if (controllerRef.current !== controller) return // superseded
          setStatus(sawError ? 'error' : 'done')
        })
        .catch(() => {
          if (controllerRef.current !== controller) return // superseded / aborted
          if (controller.signal.aborted) return
          setStatus('error')
        })
    },
    [abort, path, options.fetch, options.headers],
  )

  // EC-8: cleanup on unmount aborts in-flight stream.
  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort()
        controllerRef.current = null
      }
    }
  }, [])

  return { events, status, send, abort, reset }
}
