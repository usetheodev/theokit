/**
 * Devtools floating chip indicator.
 *
 * Phase 1: fixed corner.
 * Phase 4 (T4.1): draggable via useDrag.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useDevtoolsContext } from '../hooks/useDevtoolsContext.js'
import { useDrag } from '../hooks/useDrag.js'
import { tokens } from '../styles/tokens.js'
import { TheoLogo } from './TheoLogo.js'

export function Indicator() {
  const { state, dispatch, styles } = useDevtoolsContext()

  const drag = useDrag({
    disabled: state.open, // chip not draggable while panel is open
    position: state.position,
    padding: tokens.panel.chipPadding,
    onChange: (position) => dispatch({ type: 'SET_POSITION', position }),
  })

  if (!state.visible) return null

  const [vertical, horizontal] = state.position.split('-', 2) as ['top' | 'bottom', 'left' | 'right']

  // Logo-only chip — compact circular button. Logo at 35px.
  const buttonClass = styles.css`
    position: fixed;
    ${vertical}: ${tokens.panel.chipPadding}px;
    ${horizontal}: ${tokens.panel.chipPadding}px;
    z-index: ${tokens.zIndex.chip};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: ${tokens.spacing.sm};
    background: ${tokens.colors.bgChip};
    color: ${tokens.colors.text};
    border: 1px solid ${tokens.colors.border};
    border-radius: ${tokens.radius.full};
    cursor: pointer;
    user-select: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    transition: background 150ms ease;
    &:hover { background: ${tokens.colors.bgChipHover}; }
    &:focus-visible {
      outline: 2px solid ${tokens.colors.accent};
      outline-offset: 2px;
    }
  `

  return (
    <button
      ref={drag.ref as React.RefObject<HTMLButtonElement>}
      type="button"
      aria-label="Open devtools"
      aria-expanded={state.open}
      title="Theo Devtools"
      className={buttonClass}
      onPointerDown={drag.onPointerDown}
      onClick={() => dispatch({ type: 'TOGGLE_PANEL' })}
    >
      <TheoLogo size={35} />
    </button>
  )
}
