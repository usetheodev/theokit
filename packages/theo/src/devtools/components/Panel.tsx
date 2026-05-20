/**
 * Devtools expandable panel.
 *
 * Renders header (tab buttons + close) + body (active tab content).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useDevtoolsContext } from '../hooks/useDevtoolsContext.js'
import type { DevtoolsTab } from '../shared.js'
import { tokens } from '../styles/tokens.js'

import { ErrorsTab } from './Tabs/ErrorsTab.js'
import { RequestsTab } from './Tabs/RequestsTab.js'
import { RoutesTab } from './Tabs/RoutesTab.js'
import { SettingsTab } from './Tabs/SettingsTab.js'
import { TheoLogo } from './TheoLogo.js'

const TABS: DevtoolsTab[] = ['requests', 'routes', 'errors', 'settings']

// Style builder extracted to keep Panel's body under the line ceiling.
function buildPanelStyles(
  styles: ReturnType<typeof useDevtoolsContext>['styles'],
  vertical: 'top' | 'bottom',
  horizontal: 'left' | 'right',
  verticalOffset: number,
) {
  return {
    panel: styles.css`
      position: fixed;
      ${vertical}: ${verticalOffset}px;
      ${horizontal}: ${tokens.panel.chipPadding}px;
      z-index: ${tokens.zIndex.panel};
      width: ${tokens.panel.defaultWidth}px;
      height: ${tokens.panel.defaultHeight}px;
      background: ${tokens.colors.bgPanel};
      color: ${tokens.colors.text};
      border: 1px solid ${tokens.colors.border};
      border-radius: ${tokens.radius.md};
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      font-family: ${tokens.font.family};
      font-size: ${tokens.font.sizeSm};
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `,
    header: styles.css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: ${tokens.spacing.sm} ${tokens.spacing.md};
      border-bottom: 1px solid ${tokens.colors.borderSubtle};
      flex-shrink: 0;
    `,
    tabs: styles.css`
      display: flex;
      gap: ${tokens.spacing.xs};
    `,
    tabBtn: styles.css`
      appearance: none;
      background: transparent;
      color: ${tokens.colors.textMuted};
      border: none;
      padding: ${tokens.spacing.xs} ${tokens.spacing.sm};
      border-radius: ${tokens.radius.sm};
      cursor: pointer;
      font-family: ${tokens.font.family};
      font-size: ${tokens.font.sizeSm};
      text-transform: capitalize;
      &:hover {
        background: ${tokens.colors.bgPanelHover};
        color: ${tokens.colors.text};
      }
      &[data-active='true'] {
        background: ${tokens.colors.bgPanelHover};
        color: ${tokens.colors.text};
      }
    `,
    closeBtn: styles.css`
      appearance: none;
      background: transparent;
      color: ${tokens.colors.textMuted};
      border: none;
      cursor: pointer;
      padding: ${tokens.spacing.xs} ${tokens.spacing.sm};
      border-radius: ${tokens.radius.sm};
      font-size: 16px;
      &:hover {
        background: ${tokens.colors.bgPanelHover};
        color: ${tokens.colors.text};
      }
    `,
    body: styles.css`
      flex: 1;
      overflow: auto;
    `,
  }
}

export function Panel() {
  const { state, dispatch, styles } = useDevtoolsContext()
  if (!state.open) return null

  const [vertical, horizontal] = state.position.split('-', 2) as [
    'top' | 'bottom',
    'left' | 'right',
  ]
  const verticalOffset = tokens.panel.chipPadding + 56
  const cls = buildPanelStyles(styles, vertical, horizontal, verticalOffset)
  const panelClass = cls.panel
  const headerClass = cls.header
  const tabsClass = cls.tabs
  const tabBtnClass = cls.tabBtn
  const closeBtnClass = cls.closeBtn
  const bodyClass = cls.body

  return (
    <div
      role="dialog"
      aria-label="Theo Devtools panel"
      data-theo-devtools-panel=""
      className={panelClass}
    >
      <div className={headerClass}>
        <div className={tabsClass} role="tablist">
          <span
            className={styles.css`
              display: inline-flex;
              align-items: center;
              padding: 0 ${tokens.spacing.xs};
              opacity: 0.9;
            `}
            aria-hidden="true"
          >
            <TheoLogo size={16} />
          </span>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              data-active={state.activeTab === t}
              aria-selected={state.activeTab === t}
              className={tabBtnClass}
              onClick={() => {
                dispatch({ type: 'SET_TAB', tab: t })
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close devtools panel"
          className={closeBtnClass}
          onClick={() => {
            dispatch({ type: 'TOGGLE_PANEL' })
          }}
        >
          ×
        </button>
      </div>
      <div className={bodyClass} data-testid="devtools-tab-body">
        {state.activeTab === 'requests' && <RequestsTab />}
        {state.activeTab === 'routes' && <RoutesTab />}
        {state.activeTab === 'errors' && <ErrorsTab />}
        {state.activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
