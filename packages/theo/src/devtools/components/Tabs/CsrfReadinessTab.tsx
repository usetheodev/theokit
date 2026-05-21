/**
 * CSRF Readiness tab (T2.2) — surfaces csrf.warn events captured by the
 * in-memory `CsrfReadinessStore`. Helps devs see which routes would
 * fail under 0.3.0 strict CSRF WITHOUT grepping stdout.
 *
 * Fetches GET /__theo/csrf-readiness on mount + every 5s while the tab
 * is open. Reset button POSTs /__theo/csrf-readiness/reset with the
 * required X-Theo-Action header.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useEffect, useState, useCallback, type ReactElement } from 'react'

import { useDevtoolsContext } from '../../hooks/useDevtoolsContext.js'
import { tokens } from '../../styles/tokens.js'

interface ReadinessRoute {
  method: string
  path: string
  reason: string
  count: number
  firstSeen: string
  lastSeen: string
}

interface ReadinessSummary {
  generatedAt: string
  totalEvents: number
  routes: ReadinessRoute[]
}

function buildTabStyles(styles: ReturnType<typeof useDevtoolsContext>['styles']) {
  return {
    container: styles.css`
      padding: ${tokens.spacing.md};
      color: ${tokens.colors.text};
      font-family: ${tokens.font.family};
      font-size: ${tokens.font.sizeSm};
    `,
    headerRow: styles.css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: ${tokens.spacing.md};
    `,
    button: styles.css`
      padding: ${tokens.spacing.xs} ${tokens.spacing.md};
      background: ${tokens.colors.bgPanelHover};
      border: 1px solid ${tokens.colors.borderSubtle};
      color: ${tokens.colors.text};
      font-family: ${tokens.font.family};
      font-size: ${tokens.font.sizeXs};
      cursor: pointer;
      border-radius: ${tokens.radius.sm};
      &:hover { background: ${tokens.colors.bgPanel}; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    `,
    row: styles.css`
      display: grid;
      grid-template-columns: 60px 1fr auto;
      gap: ${tokens.spacing.sm};
      padding: ${tokens.spacing.xs} ${tokens.spacing.sm};
      border-bottom: 1px solid ${tokens.colors.borderSubtle};
      font-family: ${tokens.font.mono};
      font-size: ${tokens.font.sizeXs};
    `,
  }
}

function ReadinessRow({
  rowClass,
  route,
}: Readonly<{
  rowClass: string
  route: ReadinessRoute
}>): ReactElement {
  return (
    <div className={rowClass}>
      <span style={{ color: tokens.colors.accent }}>{route.method}</span>
      <span>
        {route.path}
        <span style={{ color: tokens.colors.textMuted, marginLeft: tokens.spacing.sm }}>
          {route.reason}
        </span>
      </span>
      <span style={{ color: tokens.colors.textMuted }}>×{String(route.count)}</span>
    </div>
  )
}

export function CsrfReadinessTab(): ReactElement {
  const { styles } = useDevtoolsContext()
  const cls = buildTabStyles(styles)
  const [data, setData] = useState<ReadinessSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/__theo/csrf-readiness')
      if (!res.ok) {
        setError(`Endpoint returned ${String(res.status)} — is csrfReadinessStore wired?`)
        return
      }
      const json = (await res.json()) as ReadinessSummary
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed')
    }
  }, [])

  useEffect(() => {
    void fetchData()
    const t = setInterval(() => void fetchData(), 5000)
    return () => {
      clearInterval(t)
    }
  }, [fetchData])

  const handleReset = useCallback(async () => {
    setBusy(true)
    try {
      await fetch('/__theo/csrf-readiness/reset', {
        method: 'POST',
        headers: { 'X-Theo-Action': '1', Origin: window.location.origin },
      })
      await fetchData()
    } finally {
      setBusy(false)
    }
  }, [fetchData])

  if (error) {
    return (
      <div className={cls.container} data-testid="devtools-csrf-readiness-error">
        <div style={{ color: tokens.colors.error.csrf }}>{error}</div>
        <p style={{ color: tokens.colors.textMuted, marginTop: tokens.spacing.sm }}>
          Wire <code>csrfReadinessStore</code> in the api-middleware options to enable this tab.
        </p>
      </div>
    )
  }
  if (data === null) {
    return (
      <div className={cls.container} data-testid="devtools-csrf-readiness-loading">
        Loading…
      </div>
    )
  }

  const isEmpty = data.totalEvents === 0
  const testid = isEmpty ? 'devtools-csrf-readiness-empty' : 'devtools-csrf-readiness'

  return (
    <div className={cls.container} data-testid={testid}>
      <div className={cls.headerRow}>
        <strong>
          {isEmpty
            ? 'CSRF Readiness'
            : `CSRF Readiness — ${String(data.totalEvents)} event(s) across ${String(data.routes.length)} route(s)`}
        </strong>
        <button
          type="button"
          className={cls.button}
          disabled={busy}
          onClick={() => {
            void handleReset()
          }}
        >
          Reset
        </button>
      </div>
      {isEmpty ? (
        <div style={{ color: tokens.colors.textMuted }}>
          No csrf.warn events recorded. Endpoints are ready for 0.3.0 strict CSRF.
        </div>
      ) : (
        data.routes.map((r) => (
          <ReadinessRow key={`${r.method} ${r.path} ${r.reason}`} rowClass={cls.row} route={r} />
        ))
      )}
    </div>
  )
}
