/**
 * Recursive JSON walker — collapsible object/array tree.
 *
 * Adapted from TanStack router-devtools Explorer.tsx (pattern §7.2 of
 * .claude/knowledge-base/reference/devtools.md). Pagination at 100 entries.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useState } from 'react'
import { useDevtoolsContext } from '../hooks/useDevtoolsContext.js'
import { tokens } from '../styles/tokens.js'

const PAGE_SIZE = 100
const MAX_STRING_DISPLAY = 256

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') {
    const display = value.length > MAX_STRING_DISPLAY ? `${value.slice(0, MAX_STRING_DISPLAY)}…` : value
    return JSON.stringify(display)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (typeof value === 'function') return 'fn()'
  if (Array.isArray(value)) return `Array(${value.length})`
  return 'Object'
}

interface ExplorerProps {
  label: string
  value: unknown
  defaultExpanded?: boolean
  depth?: number
}

export function JSONExplorer({ label, value, defaultExpanded = false, depth = 0 }: ExplorerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [pageIndex, setPageIndex] = useState(0)
  const { styles } = useDevtoolsContext()

  const rowClass = styles.css`
    font-family: ${tokens.font.mono};
    font-size: ${tokens.font.sizeXs};
    line-height: 1.5;
    color: ${tokens.colors.text};
    padding-left: ${depth * 12}px;
  `
  const labelBtnClass = styles.css`
    background: transparent;
    border: none;
    color: ${tokens.colors.text};
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    &:hover { color: ${tokens.colors.accentHover}; }
  `
  const keyClass = styles.css`color: ${tokens.colors.accent};`
  const valClass = styles.css`color: ${tokens.colors.textMuted};`

  if (value === null || value === undefined || typeof value !== 'object') {
    return (
      <div className={rowClass}>
        <span className={keyClass}>{label}</span>: <span className={valClass}>{describe(value)}</span>
      </div>
    )
  }

  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)

  if (entries.length === 0) {
    return (
      <div className={rowClass}>
        <span className={keyClass}>{label}</span>: <span className={valClass}>{Array.isArray(value) ? '[]' : '{}'}</span>
      </div>
    )
  }

  const totalPages = Math.ceil(entries.length / PAGE_SIZE)
  const slice = entries.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)

  return (
    <div className={rowClass}>
      <button
        type="button"
        className={labelBtnClass}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span className={keyClass}>{label}</span>
        <span className={valClass}>{describe(value)}</span>
      </button>
      {expanded && (
        <div>
          {slice.map(([k, v]) => (
            <JSONExplorer key={k} label={k} value={v} depth={depth + 1} />
          ))}
          {totalPages > 1 && (
            <div className={styles.css`padding-left: ${(depth + 1) * 12}px; color: ${tokens.colors.textMuted}; font-size: ${tokens.font.sizeXs};`}>
              page {pageIndex + 1}/{totalPages}
              {pageIndex > 0 && (
                <button
                  type="button"
                  className={labelBtnClass}
                  onClick={() => setPageIndex(pageIndex - 1)}
                >
                  prev
                </button>
              )}
              {pageIndex < totalPages - 1 && (
                <button
                  type="button"
                  className={labelBtnClass}
                  onClick={() => setPageIndex(pageIndex + 1)}
                >
                  next
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
