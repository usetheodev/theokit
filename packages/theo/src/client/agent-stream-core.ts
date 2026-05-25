import type { AgentEvent } from '../server/agent/agent-types.js'

/**
 * T5.2 — Pure SSE consumer used by useAgentStream.
 *
 * Split out from the React hook so the wire behavior can be tested
 * without a DOM. The hook is glue: useState + useEffect + this primitive.
 *
 * Transport (ADR D7, EC-3): fetch + ReadableStream — NOT EventSource.
 * EventSource is GET-only and cannot carry a body. Agent endpoints need
 * POST + JSON body, so we use fetch + manual SSE chunk parsing.
 */

export interface ConsumeOptions<TBody = unknown> {
  /** Request body — JSON-serialized into the POST. */
  body: TBody
  /** Called once per SSE event parsed off the stream. */
  onEvent: (event: AgentEvent) => void
  /** Optional fetch override (tests). */
  fetch?: typeof fetch
  /** Optional abort signal — passed through to fetch. */
  signal?: AbortSignal
  /** Extra headers (e.g., auth). */
  headers?: Record<string, string>
}

/**
 * Dispatch SSE events from a list of `\n\n`-separated chunk parts.
 * Extracted to keep the streaming loop under the max-depth ceiling.
 */
function dispatchSseParts(parts: string[], onEvent: (event: AgentEvent) => void): void {
  for (const part of parts) {
    // A chunk may contain multiple lines; keep only the data: line.
    for (const line of part.split('\n')) {
      const evt = parseSSEChunk(line)
      if (evt) onEvent(evt)
    }
  }
}

/**
 * Parse a single SSE line of the form `data: <json>`.
 * Returns null for non-data lines, comments, or malformed JSON.
 */
export function parseSSEChunk(line: string): AgentEvent | null {
  if (!line.startsWith('data:')) return null
  const raw = line.slice(5).trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as AgentEvent
  } catch {
    return null
  }
}

/**
 * POSTs to `path` with `body`, reads the SSE response, and invokes
 * `onEvent` for each parsed AgentEvent. Resolves when the server
 * closes the stream or the signal aborts.
 *
 * T1.1 — Attaches `X-Theo-Action: '1'` so 0.3.0 strict CSRF mode accepts
 * the request. The user can override (or suppress) by passing the header
 * in `options.headers` — spread order ensures their value wins.
 */
export async function consumeAgentStream<TBody = unknown>(
  path: string,
  options: ConsumeOptions<TBody>,
): Promise<void> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const response = await fetchImpl(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'X-Theo-Action': '1',
      ...options.headers,
    },
    body: JSON.stringify(options.body),
    signal: options.signal,
  })

  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  try {
    let done = false
    while (!done) {
      const chunk = await reader.read()
      done = chunk.done
      if (done) continue
      buf += decoder.decode(chunk.value, { stream: true })

      // SSE separates events with a blank line: `\n\n`.
      // Split, keep the trailing partial in buf.
      const parts = buf.split('\n\n')
      buf = parts.pop() ?? ''
      dispatchSseParts(parts, options.onEvent)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // ignore — reader may already be released if the stream errored
    }
  }
}
