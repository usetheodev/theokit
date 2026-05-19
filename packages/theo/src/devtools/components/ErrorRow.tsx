/**
 * ErrorRow — single error entry in the Errors tab.
 *
 * EC-27: stack truncated to 4KB display (1MB+ stacks would freeze main thread).
 * EC-20: NO dangerouslySetInnerHTML — React auto-escapes.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useState } from 'react'
import { useDevtoolsContext } from '../hooks/useDevtoolsContext.js'
import { tokens } from '../styles/tokens.js'
import type { ErrorRecord } from '../shared.js'

export const STACK_DISPLAY_LIMIT = 4096

/**
 * EC-27 — pure helper: cap stack trace display at 4KB.
 * Exported for unit testing — 1MB+ stacks would freeze main thread on render.
 */
export function truncateStackForDisplay(stack: string | undefined, limit = STACK_DISPLAY_LIMIT): string | null {
  if (!stack) return null
  if (stack.length <= limit) return stack
  return `${stack.slice(0, limit)}\n…[truncated ${stack.length - limit} chars]`
}

function typeColor(type: ErrorRecord['type']): string {
  switch (type) {
    case 'csrf.warn':
      return tokens.colors.error.csrf
    case 'unhandled':
      return tokens.colors.error.unhandled
    case 'console':
    default:
      return tokens.colors.error.console
  }
}

function typeIcon(type: ErrorRecord['type']): string {
  switch (type) {
    case 'csrf.warn':
      return '⛨'
    case 'unhandled':
      return '⚠'
    case 'console':
    default:
      return '!'
  }
}

interface ErrorRowProps {
  error: ErrorRecord
}

export function ErrorRow({ error }: ErrorRowProps) {
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
  const iconClass = styles.css`
    color: ${typeColor(error.type)};
    font-weight: 700;
    min-width: 16px;
    text-align: center;
  `
  const msgClass = styles.css`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `
  const docLinkClass = styles.css`
    color: ${tokens.colors.accent};
    font-size: ${tokens.font.sizeXs};
    text-decoration: underline;
    &:hover { color: ${tokens.colors.accentHover}; }
  `
  const detailsClass = styles.css`
    padding: ${tokens.spacing.sm} ${tokens.spacing.md};
    background: ${tokens.colors.bgPanelHover};
    border-top: 1px solid ${tokens.colors.borderSubtle};
  `

  // EC-27: cap stack display length (delegated to pure helper for testability)
  const displayedStack = truncateStackForDisplay(error.stack)

  // EC-20: render docsUrl only when present AND non-empty (don't show broken link)
  const showDocsLink = typeof error.docsUrl === 'string' && error.docsUrl.length > 0

  return (
    <div className={containerClass} data-testid="devtools-error-row">
      <button
        type="button"
        className={summaryClass}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        title={error.message}
      >
        <span className={iconClass} aria-hidden="true">{typeIcon(error.type)}</span>
        <span className={msgClass}>{error.message}</span>
        {error.code && (
          <span style={{ color: tokens.colors.textMuted, fontFamily: tokens.font.mono, fontSize: tokens.font.sizeXs }}>{error.code}</span>
        )}
      </button>
      {expanded && (
        <div className={detailsClass}>
          {showDocsLink && (
            <div style={{ marginBottom: tokens.spacing.sm }}>
              <a
                href={error.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={docLinkClass}
              >
                Open migration guide
              </a>
            </div>
          )}
          {displayedStack && (
            <pre style={{
              margin: 0,
              padding: tokens.spacing.sm,
              background: tokens.colors.bgPanel,
              color: tokens.colors.textMuted,
              fontFamily: tokens.font.mono,
              fontSize: tokens.font.sizeXs,
              borderRadius: tokens.radius.sm,
              overflow: 'auto',
              maxHeight: '200px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {displayedStack}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
