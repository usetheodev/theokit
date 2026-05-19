/**
 * T4.1 — Draggable state machine + velocity-aware corner snap.
 *
 * State machine: idle → press → drag → drag-end → idle
 *
 * - EC-8: click-after-drag swallow. The 'drag-end' state intercepts the
 *   click that follows pointerup and prevents the default (else dragging
 *   the chip would also toggle the panel).
 * - EC-9: right-click ignored (e.button !== 0 returns early).
 * - EC-10: transitionend listener removes ITSELF inside its own handler
 *   to prevent leaks across many drags.
 * - EC-28: corner positions recomputed on every pointermove (NOT cached
 *   at drag start). Window resize during drag would otherwise use stale
 *   corners.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { DevtoolsPosition } from '../shared.js'

type DragState =
  | { kind: 'idle' }
  | { kind: 'press'; startX: number; startY: number }
  | { kind: 'drag'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'drag-end' }

interface Point {
  x: number
  y: number
}

interface VelocitySample {
  position: Point
  timestamp: number
}

const DRAG_THRESHOLD_PX = 5
const VELOCITY_SAMPLE_MIN_MS = 10
const VELOCITY_SAMPLE_LIMIT = 5
const SPRING_TRANSITION = 'translate 491ms cubic-bezier(0.485, -0.050, 0.285, 1.505)'

function calcVelocity(history: VelocitySample[]): Point {
  if (history.length < 2) return { x: 0, y: 0 }
  const first = history[0]!
  const last = history[history.length - 1]!
  const dt = last.timestamp - first.timestamp
  if (dt === 0) return { x: 0, y: 0 }
  return {
    x: ((last.position.x - first.position.x) / dt) * 1000,
    y: ((last.position.y - first.position.y) / dt) * 1000,
  }
}

function projectVelocity(v: number, deceleration = 0.999): number {
  return ((v / 1000) * deceleration) / (1 - deceleration)
}

/**
 * Compute the 4 corner positions relative to viewport, accounting for
 * scrollbar width and current element size. EC-14: scrollbar offset.
 * EC-28: invoked on every move so window resize during drag is reflected.
 */
export function computeCorners(
  elementWidth: number,
  elementHeight: number,
  padding: number,
): Record<DevtoolsPosition, Point> {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1024
  const h = typeof window !== 'undefined' ? window.innerHeight : 768
  const scrollbarW =
    typeof document !== 'undefined' && document.documentElement
      ? w - document.documentElement.clientWidth
      : 0

  return {
    'top-left': { x: padding, y: padding },
    'top-right': { x: w - elementWidth - padding - scrollbarW, y: padding },
    'bottom-left': { x: padding, y: h - elementHeight - padding },
    'bottom-right': {
      x: w - elementWidth - padding - scrollbarW,
      y: h - elementHeight - padding,
    },
  }
}

/**
 * Pick the nearest corner to a given point (Euclidean).
 * Exported for unit testing.
 */
export function nearestCorner(
  point: Point,
  corners: Record<DevtoolsPosition, Point>,
): DevtoolsPosition {
  let best: DevtoolsPosition = 'bottom-right'
  let bestDist = Infinity
  for (const [k, p] of Object.entries(corners) as [DevtoolsPosition, Point][]) {
    const dx = point.x - p.x
    const dy = point.y - p.y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < bestDist) {
      bestDist = d
      best = k
    }
  }
  return best
}

export interface UseDragOptions {
  disabled?: boolean
  position: DevtoolsPosition
  padding: number
  onChange: (position: DevtoolsPosition) => void
}

export interface UseDragApi {
  ref: React.RefObject<HTMLElement | null>
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
}

/**
 * useDrag hook. Returns a ref + pointerDown handler. State managed internally.
 *
 * Exported state machine — _machine and _setMachine are internal helpers.
 * Tests exercise via computeCorners + nearestCorner (pure helpers above);
 * full E2E coverage via Playwright (T4.4).
 */
export function useDrag(options: UseDragOptions): UseDragApi {
  const ref = useRef<HTMLElement | null>(null)
  const machine = useRef<DragState>({ kind: 'idle' })
  const velocityHistory = useRef<VelocitySample[]>([])
  const lastSampleTime = useRef(0)

  // EC-10: cleanup tracker — any move/up listeners attached during press/drag
  // get torn down here. Listener self-removal pattern means a one-off
  // transitionend handler removes itself; this cleanup handles the
  // pointer event pair.
  const cleanup = useRef<(() => void) | null>(null)

  // EC-10 transitionend self-removal helper
  function animateToCorner(corner: DevtoolsPosition): void {
    const el = ref.current
    if (!el) {
      options.onChange(corner)
      return
    }
    const corners = computeCorners(el.offsetWidth, el.offsetHeight, options.padding)
    const target = corners[corner]
    const onTransitionEnd = (ev: TransitionEvent) => {
      if (ev.propertyName !== 'translate') return
      el.removeEventListener('transitionend', onTransitionEnd)
      el.style.transition = ''
      el.style.translate = ''
      options.onChange(corner)
    }
    el.style.transition = SPRING_TRANSITION
    el.addEventListener('transitionend', onTransitionEnd)
    el.style.translate = `${target.x}px ${target.y}px`
  }

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (options.disabled) return
      // EC-9: right-click and middle-click never start drag
      if (e.button !== 0) return
      if (machine.current.kind !== 'idle') return

      const startX = e.clientX
      const startY = e.clientY
      machine.current = { kind: 'press', startX, startY }
      velocityHistory.current = [{ position: { x: startX, y: startY }, timestamp: Date.now() }]
      lastSampleTime.current = Date.now()

      const onMove = (ev: PointerEvent) => {
        const m = machine.current
        if (m.kind === 'idle') return

        // press → drag transition when threshold exceeded
        if (m.kind === 'press') {
          const dx = ev.clientX - m.startX
          const dy = ev.clientY - m.startY
          if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD_PX) {
            machine.current = { kind: 'drag', pointerId: ev.pointerId, lastX: ev.clientX, lastY: ev.clientY }
            try {
              ref.current?.setPointerCapture(ev.pointerId)
            } catch {
              /* setPointerCapture may throw if pointer already captured elsewhere */
            }
          } else {
            return
          }
        }

        const drag = machine.current
        if (drag.kind !== 'drag') return

        // EC-28: recompute corners every move (window resize safe).
        // Drag follow uses CSS translate.
        if (ref.current) {
          const el = ref.current
          const corners = computeCorners(el.offsetWidth, el.offsetHeight, options.padding)
          const base = corners[options.position]
          const tx = ev.clientX - drag.lastX
          const ty = ev.clientY - drag.lastY
          // Cumulative delta from current corner anchor
          const currentTranslate = el.style.translate
          let curX = 0
          let curY = 0
          if (currentTranslate) {
            const parts = currentTranslate.match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px/)
            if (parts) {
              curX = Number(parts[1])
              curY = Number(parts[2])
            }
          }
          el.style.translate = `${curX + tx}px ${curY + ty}px`
          drag.lastX = ev.clientX
          drag.lastY = ev.clientY
          // base unused here — corners computed for snap on release
          void base
        }

        // velocity sampling (10ms apart, last 5 samples)
        const now = Date.now()
        if (now - lastSampleTime.current >= VELOCITY_SAMPLE_MIN_MS) {
          velocityHistory.current.push({ position: { x: ev.clientX, y: ev.clientY }, timestamp: now })
          if (velocityHistory.current.length > VELOCITY_SAMPLE_LIMIT) {
            velocityHistory.current.shift()
          }
          lastSampleTime.current = now
        }
      }

      const onUp = (_ev: PointerEvent) => {
        const m = machine.current
        if (m.kind === 'drag') {
          // Project + snap
          const v = calcVelocity(velocityHistory.current)
          const el = ref.current
          if (el) {
            const corners = computeCorners(el.offsetWidth, el.offsetHeight, options.padding)
            const currentTranslate = el.style.translate
            let curX = 0
            let curY = 0
            if (currentTranslate) {
              const parts = currentTranslate.match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px/)
              if (parts) {
                curX = Number(parts[1])
                curY = Number(parts[2])
              }
            }
            const base = corners[options.position]
            const projectedPoint: Point = {
              x: base.x + curX + projectVelocity(v.x),
              y: base.y + curY + projectVelocity(v.y),
            }
            const snapTarget = nearestCorner(projectedPoint, corners)
            // EC-8: enter drag-end so the synthetic click that follows is swallowed
            machine.current = { kind: 'drag-end' }
            animateToCorner(snapTarget)
            // Reset drag-end → idle on next tick so future drags work
            setTimeout(() => {
              if (machine.current.kind === 'drag-end') {
                machine.current = { kind: 'idle' }
              }
            }, 0)
          }
        } else {
          // Was just a press (no drag) — that's a click; let it through
          machine.current = { kind: 'idle' }
        }
        velocityHistory.current = []
        cleanup.current?.()
        cleanup.current = null
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      cleanup.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
    },
    [options.disabled, options.padding, options.position, options],
  )

  // EC-8: click handler on the element — swallow click that fires right
  // after a drag (browser's synthetic click after pointerup).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClickCapture = (ev: MouseEvent) => {
      if (machine.current.kind === 'drag-end') {
        ev.preventDefault()
        ev.stopPropagation()
      }
    }
    el.addEventListener('click', onClickCapture, true)
    return () => {
      el.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup.current?.()
      cleanup.current = null
    }
  }, [])

  return { ref, onPointerDown }
}
