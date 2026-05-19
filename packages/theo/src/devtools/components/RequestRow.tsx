/**
 * RequestRow — single request entry in the Requests tab.
 *
 * Renders method badge, path, status code, duration, traceId.
 * Click toggles expanded view (headers + body via JSONExplorer).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useState } from 'react'
import { useDevtoolsContext } from '../hooks/useDevtoolsContext.js'
import { methodColor, statusColor, tokens } from '../styles/tokens.js'
import { JSONExplorer } from './JSONExplorer.js'
import type { RequestRecord } from '../shared.js'

interface RequestRowProps {
  request: RequestRecord
}

export function RequestRow({ request }: RequestRowProps) {
  const [expanded, setExpanded] = useState(false)
  const { styles } = useDevtoolsContext()

  const containerClass = styles.css`
    display: block;
    width: 100%;
    border-bottom: 1px solid ${tokens.colors.borderSubtle};
  `

  const summaryClass = styles.css`
    display: flex;
    align-items: center;
    gap: ${tokens.spacing.sm};
    padding: ${tokens.spacing.xs} ${tokens.spacing.sm};
    background: transparent;
    border: none;
    width: 100%;
    cursor: pointer;
    color: ${tokens.colors.text};
    font-family: ${tokens.font.family};
    font-size: ${tokens.font.sizeSm};
    text-align: left;
    &:hover { background: ${tokens.colors.bgPanelHover}; }
  `

  const methodBadge = styles.css`
    display: inline-block;
    min-width: 44px;
    padding: 1px 6px;
    border-radius: ${tokens.radius.sm};
    background: ${methodColor(request.method)}33;
    color: ${methodColor(request.method)};
    font-family: ${tokens.font.mono};
    font-size: ${tokens.font.sizeXs};
    font-weight: 600;
    text-align: center;
  `

  const pathClass = styles.css`
    flex: 1;
    font-family: ${tokens.font.mono};
    font-size: ${tokens.font.sizeXs};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `

  const statusClass = styles.css`
    color: ${statusColor(request.status)};
    font-family: ${tokens.font.mono};
    font-size: ${tokens.font.sizeXs};
    font-weight: 600;
    min-width: 36px;
    text-align: right;
  `

  const durClass = styles.css`
    color: ${tokens.colors.textMuted};
    font-family: ${tokens.font.mono};
    font-size: ${tokens.font.sizeXs};
    min-width: 56px;
    text-align: right;
  `

  const traceClass = styles.css`
    color: ${tokens.colors.textDim};
    font-family: ${tokens.font.mono};
    font-size: ${tokens.font.sizeXs};
  `

  const detailsClass = styles.css`
    padding: ${tokens.spacing.sm} ${tokens.spacing.md};
    background: ${tokens.colors.bgPanelHover};
    border-top: 1px solid ${tokens.colors.borderSubtle};
  `

  const displayDuration =
    request.durationMs == null || !Number.isFinite(request.durationMs)
      ? '—'
      : request.durationMs < 1
        ? '<1ms'
        : `${Math.round(request.durationMs)}ms`

  const displayStatus = request.status === 0 ? 'failed' : String(request.status)

  return (
    <div className={containerClass} data-testid="devtools-request-row">
      <button
        type="button"
        className={summaryClass}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        title={request.path}
      >
        <span className={methodBadge}>{request.method}</span>
        <span className={pathClass}>{request.path}</span>
        <span className={statusClass}>{displayStatus}</span>
        <span className={durClass}>{displayDuration}</span>
        <span className={traceClass}>{request.traceId.slice(0, 8)}</span>
      </button>
      {expanded && (
        <div className={detailsClass}>
          {request.csrfWarn && (
            <div style={{ color: tokens.colors.error.csrf, marginBottom: tokens.spacing.sm }}>
              CSRF warn: <a href={request.csrfWarn.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: tokens.colors.accent }}>{request.csrfWarn.code}</a>
            </div>
          )}
          {request.headers && (
            <JSONExplorer label="headers" value={request.headers} defaultExpanded={false} />
          )}
          {request.bodyPreview !== undefined && request.bodyPreview !== '' && (
            <div style={{ color: tokens.colors.textMuted, marginTop: tokens.spacing.sm, fontFamily: tokens.font.mono, fontSize: tokens.font.sizeXs }}>
              body{request.bodyTruncated ? ` (truncated, ${request.bodyLength} bytes)` : ''}:
              <pre style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{request.bodyPreview}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
