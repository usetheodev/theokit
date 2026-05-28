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
import type { RequestRecord } from '../shared.js'
import { methodColor, statusColor, tokens } from '../styles/tokens.js'

import { JSONExplorer } from './JSONExplorer.js'

interface RequestRowProps {
  request: RequestRecord
}

function buildRequestRowStyles(
  styles: ReturnType<typeof useDevtoolsContext>['styles'],
  request: RequestRecord,
) {
  return {
    container: styles.css`
      display: block;
      width: 100%;
      border-bottom: 1px solid ${tokens.colors.borderSubtle};
    `,
    summary: styles.css`
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
    `,
    methodBadge: styles.css`
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
    `,
    path: styles.css`
      flex: 1;
      font-family: ${tokens.font.mono};
      font-size: ${tokens.font.sizeXs};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    status: styles.css`
      color: ${statusColor(request.status)};
      font-family: ${tokens.font.mono};
      font-size: ${tokens.font.sizeXs};
      font-weight: 600;
      min-width: 36px;
      text-align: right;
    `,
    dur: styles.css`
      color: ${tokens.colors.textMuted};
      font-family: ${tokens.font.mono};
      font-size: ${tokens.font.sizeXs};
      min-width: 56px;
      text-align: right;
    `,
    trace: styles.css`
      color: ${tokens.colors.textDim};
      font-family: ${tokens.font.mono};
      font-size: ${tokens.font.sizeXs};
    `,
    details: styles.css`
      padding: ${tokens.spacing.sm} ${tokens.spacing.md};
      background: ${tokens.colors.bgPanelHover};
      border-top: 1px solid ${tokens.colors.borderSubtle};
    `,
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1) return '<1ms'
  return `${Math.round(ms)}ms`
}

export function RequestRow({ request }: Readonly<RequestRowProps>) {
  const [expanded, setExpanded] = useState(false)
  const { styles } = useDevtoolsContext()
  const cls = buildRequestRowStyles(styles, request)
  const containerClass = cls.container
  const summaryClass = cls.summary
  const methodBadge = cls.methodBadge
  const pathClass = cls.path
  const statusClass = cls.status
  const durClass = cls.dur
  const traceClass = cls.trace
  const detailsClass = cls.details
  const displayDuration = formatDuration(request.durationMs)
  const displayStatus = request.status === 0 ? 'failed' : String(request.status)

  return (
    <div className={containerClass} data-testid="devtools-request-row">
      <button
        type="button"
        className={summaryClass}
        onClick={() => {
          setExpanded((e) => !e)
        }}
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
              CSRF warn:{' '}
              <a
                href={request.csrfWarn.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: tokens.colors.accent }}
              >
                {request.csrfWarn.code}
              </a>
            </div>
          )}
          {request.headers && (
            <JSONExplorer label="headers" value={request.headers} defaultExpanded={false} />
          )}
          {request.bodyPreview !== undefined && request.bodyPreview !== '' && (
            <div
              style={{
                color: tokens.colors.textMuted,
                marginTop: tokens.spacing.sm,
                fontFamily: tokens.font.mono,
                fontSize: tokens.font.sizeXs,
              }}
            >
              body{request.bodyTruncated ? ` (truncated, ${request.bodyLength} bytes)` : ''}:
              <pre style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {request.bodyPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
