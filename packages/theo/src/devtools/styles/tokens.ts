/**
 * Devtools design tokens.
 *
 * Colors are exposed as CSS custom properties at the shadow root so
 * theme changes (light/dark/system) are visually instant — no component
 * re-render needed. Each surface references `var(--theo-...)`.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */

interface Palette {
  bgPanel: string
  bgPanelHover: string
  bgChip: string
  bgChipHover: string
  border: string
  borderSubtle: string
  text: string
  textMuted: string
  textDim: string
  accent: string
  accentHover: string
}

const darkPalette: Palette = {
  bgPanel: '#13151a',
  bgPanelHover: '#1c1f26',
  bgChip: '#13151a',
  bgChipHover: '#2a2d35',
  border: '#343841',
  borderSubtle: '#23262d',
  text: '#e6e6e6',
  textMuted: '#9aa0a6',
  textDim: '#6b7280',
  accent: '#7c3aed',
  accentHover: '#9061f9',
}

const lightPalette: Palette = {
  bgPanel: '#ffffff',
  bgPanelHover: '#f5f5f7',
  bgChip: '#ffffff',
  bgChipHover: '#ececef',
  border: '#d4d4d8',
  borderSubtle: '#e4e4e7',
  text: '#1a1a1f',
  textMuted: '#52525b',
  textDim: '#9aa0a6',
  accent: '#6d28d9',
  accentHover: '#5b21b6',
}

/**
 * Build the CSS custom properties block for a resolved theme.
 * Inject into the shadow root so any `var(--theo-...)` reference
 * updates instantly when the host attribute flips.
 */
export function buildThemeCssVars(resolved: 'light' | 'dark'): string {
  const p = resolved === 'light' ? lightPalette : darkPalette
  return `
    --theo-bg-panel: ${p.bgPanel};
    --theo-bg-panel-hover: ${p.bgPanelHover};
    --theo-bg-chip: ${p.bgChip};
    --theo-bg-chip-hover: ${p.bgChipHover};
    --theo-border: ${p.border};
    --theo-border-subtle: ${p.borderSubtle};
    --theo-text: ${p.text};
    --theo-text-muted: ${p.textMuted};
    --theo-text-dim: ${p.textDim};
    --theo-accent: ${p.accent};
    --theo-accent-hover: ${p.accentHover};
  `
}

export const tokens = {
  // Backward-compat: hardcoded constants now point at CSS vars.
  // Existing styles using `${tokens.colors.bgPanel}` resolve to
  // `var(--theo-bg-panel)` at render time.
  colors: {
    bgPanel: 'var(--theo-bg-panel)',
    bgPanelHover: 'var(--theo-bg-panel-hover)',
    bgChip: 'var(--theo-bg-chip)',
    bgChipHover: 'var(--theo-bg-chip-hover)',
    border: 'var(--theo-border)',
    borderSubtle: 'var(--theo-border-subtle)',
    text: 'var(--theo-text)',
    textMuted: 'var(--theo-text-muted)',
    textDim: 'var(--theo-text-dim)',
    accent: 'var(--theo-accent)',
    accentHover: 'var(--theo-accent-hover)',

    method: {
      GET: '#10b981',
      POST: '#3b82f6',
      PUT: '#f59e0b',
      PATCH: '#f59e0b',
      DELETE: '#ef4444',
      HEAD: '#6b7280',
      OPTIONS: '#6b7280',
    },

    status: {
      success: '#10b981',
      redirect: '#3b82f6',
      clientError: '#f59e0b',
      serverError: '#ef4444',
      unknown: '#6b7280',
    },

    error: {
      csrf: '#ef4444',
      unhandled: '#ef4444',
      console: '#f59e0b',
    },
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  font: {
    family: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    mono: 'ui-monospace, Menlo, Monaco, Consolas, monospace',
    sizeXs: '11px',
    sizeSm: '12px',
    sizeMd: '14px',
    sizeLg: '16px',
  },
  zIndex: {
    chip: 2147483640,
    panel: 2147483641,
  },
  panel: {
    minWidth: 360,
    minHeight: 280,
    defaultWidth: 480,
    defaultHeight: 360,
    chipPadding: 20,
  },
} as const

export function statusColor(s: number): string {
  if (s >= 200 && s < 300) return tokens.colors.status.success
  if (s >= 300 && s < 400) return tokens.colors.status.redirect
  if (s >= 400 && s < 500) return tokens.colors.status.clientError
  if (s >= 500) return tokens.colors.status.serverError
  return tokens.colors.status.unknown
}

export function methodColor(method: string): string {
  const key = method.toUpperCase()
  const palette = tokens.colors.method as Record<string, string | undefined>
  return palette[key] ?? tokens.colors.status.unknown
}
