import type { ToolUsageRecord, UsageStorageAdapter } from './cost-types.js'

/**
 * Phase 5 — Production-Readiness #4: tool lifecycle hooks for cost tracking.
 *
 * The SDK calls `onToolStart` → handler runs → `onToolEnd` (success) or
 * `onToolError` (throw). This factory returns the three callbacks ready to
 * attach to `Agent.create({ tools, onToolStart, onToolEnd, onToolError })`.
 *
 * Each successful tool call writes a `ToolUsageRecord{success:true}`; each
 * failure writes `ToolUsageRecord{success:false}` with `errorMessage` from
 * the thrown Error.
 *
 * Invariants:
 *   - `onToolStart` records nothing yet (no duration available). Only stashes
 *     a `startedAt` timestamp by `callId` in a per-factory Map.
 *   - `onToolEnd` reads the stashed timestamp, computes `durationMs`, writes
 *     a successful record. Removes the Map entry.
 *   - `onToolError` analog with `success:false`.
 *   - Hook throws are SWALLOWED to stderr — observation hooks must not crash
 *     the run (per the v1.1.0 release contract).
 *   - EC-8 (SHOULD TEST) — orphan starts (no matching End/Error) are pruned
 *     on every onToolStart if older than 5 minutes. Bounded memory.
 *   - EC-16 (DOCUMENT) — callId uniqueness is SDK contract; duplicate Start
 *     for the same callId uses last-write-wins.
 */

const ORPHAN_TTL_MS = 5 * 60 * 1000

interface PendingStart {
  startedAt: number
  userId: string
  conversationId: string
}

export interface TrackAgentToolsOptions {
  storage: UsageStorageAdapter
  /** Defaults to () => new Date() — overridable for deterministic testing. */
  now?: () => Date
  /** Identifier for the user — passed through to ToolUsageRecord.userId. */
  userId?: string
  /** Identifier for the conversation — passed through to ToolUsageRecord.conversationId. */
  conversationId?: string
}

export interface ToolHookEvent {
  callId: string
  name: string
  // SDK shape — we only read these structurally
  [key: string]: unknown
}

export interface TrackAgentToolsHooks {
  onToolStart: (event: ToolHookEvent) => void
  onToolEnd: (event: ToolHookEvent) => void
  onToolError: (event: ToolHookEvent) => void
}

/**
 * Create the three tool-lifecycle callbacks. Hand the returned object's
 * methods to `Agent.create({ tools, onToolStart, onToolEnd, onToolError })`.
 */
export function trackAgentTools(opts: TrackAgentToolsOptions): TrackAgentToolsHooks {
  const pending = new Map<string, PendingStart>()
  const now = opts.now ?? ((): Date => new Date())
  const userId = opts.userId ?? 'anonymous'
  const conversationId = opts.conversationId ?? 'unknown'

  function pruneOrphans(): void {
    const cutoff = now().getTime() - ORPHAN_TTL_MS
    for (const [id, p] of pending) {
      if (p.startedAt < cutoff) pending.delete(id)
    }
  }

  function safeRecord(record: ToolUsageRecord): void {
    Promise.resolve(opts.storage.record(record)).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[theokit:trackAgentTools] storage.record failed: ${msg}`)
    })
  }

  return {
    onToolStart(event: ToolHookEvent): void {
      try {
        pruneOrphans()
        pending.set(event.callId, {
          startedAt: now().getTime(),
          userId,
          conversationId,
        })
      } catch (err) {
        console.warn(
          `[theokit:trackAgentTools] onToolStart hook crashed (swallowed): ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    },
    onToolEnd(event: ToolHookEvent): void {
      try {
        const start = pending.get(event.callId)
        const startedAt = start?.startedAt ?? now().getTime()
        const durationMs = start ? now().getTime() - startedAt : 0
        pending.delete(event.callId)
        if (!start) {
          console.warn(
            `[theokit:trackAgentTools] orphan onToolEnd for callId=${event.callId}; durationMs:0 recorded`,
          )
        }
        safeRecord({
          kind: 'tool',
          userId: start?.userId ?? userId,
          conversationId: start?.conversationId ?? conversationId,
          toolName: event.name,
          callId: event.callId,
          success: true,
          durationMs,
          timestamp: now(),
        })
      } catch (err) {
        console.warn(
          `[theokit:trackAgentTools] onToolEnd hook crashed (swallowed): ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    },
    onToolError(event: ToolHookEvent): void {
      try {
        const start = pending.get(event.callId)
        const startedAt = start?.startedAt ?? now().getTime()
        const durationMs = start ? now().getTime() - startedAt : 0
        pending.delete(event.callId)
        const error = event.error
        let errorMessage = 'unknown error'
        if (error instanceof Error) errorMessage = error.message
        else if (typeof error === 'string') errorMessage = error
        safeRecord({
          kind: 'tool',
          userId: start?.userId ?? userId,
          conversationId: start?.conversationId ?? conversationId,
          toolName: event.name,
          callId: event.callId,
          success: false,
          durationMs,
          errorMessage,
          timestamp: now(),
        })
      } catch (err) {
        console.warn(
          `[theokit:trackAgentTools] onToolError hook crashed (swallowed): ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    },
  }
}

/**
 * @internal — testing helper. Inspects the size of the pending-starts Map of
 * a factory instance. Not in the public API.
 */
export const __internalsForTesting = {
  ORPHAN_TTL_MS,
}
