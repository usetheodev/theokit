/**
 * Agents tab — per-agent-run telemetry (timestamp, model, tokens, cost, duration).
 *
 * theokit-evolution-ci-and-dx Phase 3 (T3.2). Consumes `state.agentRuns`
 * populated by `dispatcher.onAgentRun()` which is called from
 * `server/cost/track-agent-run.ts` in dev mode (tree-shaken in prod).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { useDevtoolsContext } from '../../hooks/useDevtoolsContext.js'
import { tokens } from '../../styles/tokens.js'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.0000'
  if (usd < 0.0001) return `<$0.0001`
  return `$${usd.toFixed(4)}`
}

export function AgentsTab() {
  const { state, dispatch, styles } = useDevtoolsContext()

  if (state.agentRuns.length === 0) {
    return (
      <div style={{ color: tokens.colors.textMuted, padding: tokens.spacing.md }}>
        No agent runs yet. Trigger a request to an endpoint using <code>trackAgentRun</code> to
        see it here. (Wired in the saas template; opt-in elsewhere.)
      </div>
    )
  }

  const totalCost = state.agentRuns.reduce((sum, r) => sum + r.costUsd, 0)
  const totalIn = state.agentRuns.reduce((sum, r) => sum + r.tokensInput, 0)
  const totalOut = state.agentRuns.reduce((sum, r) => sum + r.tokensOutput, 0)

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
  const tableClass = styles.css`
    width: 100%;
    border-collapse: collapse;
    font-size: ${tokens.font.sizeXs};
    th, td {
      text-align: left;
      padding: 4px 8px;
      border-bottom: 1px solid ${tokens.colors.borderSubtle};
    }
    th {
      color: ${tokens.colors.textMuted};
      font-weight: 500;
      font-size: ${tokens.font.sizeXs};
    }
    tr.status-error td { color: #c92a2a; }
    tr.status-aborted td { color: ${tokens.colors.textMuted}; }
  `

  return (
    <div data-testid="devtools-agents-tab">
      <div className={headerClass}>
        <span>
          {state.agentRuns.length} run{state.agentRuns.length === 1 ? '' : 's'}
          {' · '}
          tokens {totalIn}/{totalOut}
          {' · '}
          {formatCost(totalCost)} total
        </span>
        <button
          type="button"
          className={clearBtn}
          onClick={() => {
            dispatch({ type: 'RESET_AGENT_RUNS' })
          }}
        >
          clear
        </button>
      </div>
      <table className={tableClass}>
        <thead>
          <tr>
            <th>Time</th>
            <th>User</th>
            <th>Model</th>
            <th>Tokens (in/out)</th>
            <th>Cost</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {state.agentRuns.map((run) => (
            <tr key={run.id} className={`status-${run.status}`}>
              <td>{formatTime(run.timestamp)}</td>
              <td>{run.userId}</td>
              <td>{run.model}</td>
              <td>
                {run.tokensInput}/{run.tokensOutput}
              </td>
              <td>{formatCost(run.costUsd)}</td>
              <td>{run.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
