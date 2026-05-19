/**
 * Errors tab — list of recent errors (console, unhandled, csrf.warn).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useDevtoolsContext } from '../../hooks/useDevtoolsContext.js'
import { tokens } from '../../styles/tokens.js'
import { ErrorRow } from '../ErrorRow.js'

export function ErrorsTab() {
  const { state, dispatch, styles } = useDevtoolsContext()

  if (state.errors.length === 0) {
    return (
      <div style={{ color: tokens.colors.textMuted, padding: tokens.spacing.md }}>
        No errors yet. csrf.warn, console.error and unhandled rejections will surface here.
      </div>
    )
  }

  const headerClass = styles.css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${tokens.spacing.xs} ${tokens.spacing.sm};
    color: ${tokens.colors.textMuted};
    font-size: ${tokens.font.sizeXs};
    border-bottom: 1px solid ${tokens.colors.borderSubtle};
  `
  const clearBtn = styles.css`
    appearance: none;
    background: transparent;
    color: ${tokens.colors.textMuted};
    border: 1px solid ${tokens.colors.borderSubtle};
    padding: 2px 6px;
    border-radius: ${tokens.radius.sm};
    cursor: pointer;
    font-size: ${tokens.font.sizeXs};
    &:hover { color: ${tokens.colors.text}; }
  `

  return (
    <div data-testid="devtools-errors-tab">
      <div className={headerClass}>
        <span>{state.errors.length} error{state.errors.length === 1 ? '' : 's'}</span>
        <button
          type="button"
          className={clearBtn}
          onClick={() => dispatch({ type: 'RESET_ERRORS' })}
        >
          clear
        </button>
      </div>
      {state.errors.map((err) => (
        <ErrorRow key={err.id} error={err} />
      ))}
    </div>
  )
}
