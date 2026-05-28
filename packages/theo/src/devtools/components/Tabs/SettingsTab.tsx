/**
 * Settings tab — position + theme (Phase 4 T4.3).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useDevtoolsContext } from '../../hooks/useDevtoolsContext.js'
import type { DevtoolsPosition, DevtoolsTheme } from '../../shared.js'
import { tokens } from '../../styles/tokens.js'

const POSITIONS: DevtoolsPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const THEMES: DevtoolsTheme[] = ['light', 'dark', 'system']

export function SettingsTab() {
  const { state, dispatch, styles } = useDevtoolsContext()

  const sectionClass = styles.css`
    margin-bottom: ${tokens.spacing.md};
  `
  const headingClass = styles.css`
    margin: 0 0 ${tokens.spacing.xs};
    font-size: ${tokens.font.sizeMd};
    color: ${tokens.colors.text};
  `
  const radioRowClass = styles.css`
    display: flex;
    align-items: center;
    gap: ${tokens.spacing.sm};
    padding: ${tokens.spacing.xs} 0;
    color: ${tokens.colors.text};
    font-size: ${tokens.font.sizeSm};
  `

  return (
    <div data-testid="devtools-settings-tab" style={{ padding: tokens.spacing.md }}>
      <fieldset className={sectionClass} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={headingClass}>Position</legend>
        {POSITIONS.map((p) => (
          <label key={p} className={radioRowClass}>
            <input
              type="radio"
              name="theo-devtools-position"
              value={p}
              checked={state.position === p}
              onChange={() => {
                dispatch({ type: 'SET_POSITION', position: p })
              }}
            />
            <span>{p}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className={sectionClass} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={headingClass}>Theme</legend>
        {THEMES.map((t) => (
          <label key={t} className={radioRowClass}>
            <input
              type="radio"
              name="theo-devtools-theme"
              value={t}
              checked={state.theme === t}
              onChange={() => {
                dispatch({ type: 'SET_THEME', theme: t })
              }}
            />
            <span>{t}</span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}
