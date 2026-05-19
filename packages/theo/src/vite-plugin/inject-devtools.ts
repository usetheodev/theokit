/**
 * T1.2 — Auto-inject the devtools entry `<script>` into served HTML (dev only).
 *
 * Origin: matches the inject-entry-client.ts pattern but for the devtools
 * module. In dev, the Vite plugin's transformIndexHtml hook calls this for
 * every served HTML. In build, this is a no-op.
 *
 * - EC-30: naive `.replace('</head>', ...)` IS used; alternative HTML parser
 *   is too heavy for the bug class (user putting `</head>` literal in inline
 *   JS is near-zero). Documented in known limitations.
 * - User opt-out via `config.devtools = false` is respected at the plugin
 *   level (this function is simply not called).
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */

export const DEVTOOLS_VIRTUAL_ID = '/@theo/devtools/entry.js'
export const DEVTOOLS_RESOLVED_ID = '\0@theo/devtools/entry.js'

const SCRIPT_TAG = `<script type="module" src="${DEVTOOLS_VIRTUAL_ID}"></script>`

export interface InjectDevtoolsResult {
  html: string
  injected: boolean
  warning?: string
}

export function injectDevtoolsScript(
  html: string,
  opts: { isDev: boolean; enabled?: boolean },
): InjectDevtoolsResult {
  // Build mode → no inject
  if (!opts.isDev) return { html, injected: false }
  // User opt-out via config.devtools = false
  if (opts.enabled === false) return { html, injected: false }

  // Already present (HMR re-run, user added manually) → idempotent
  if (html.includes(DEVTOOLS_VIRTUAL_ID)) {
    return { html, injected: false }
  }

  // Inject before </head> (case-insensitive, first occurrence)
  const headClosePattern = /<\/head\s*>/i
  if (headClosePattern.test(html)) {
    return {
      html: html.replace(headClosePattern, (match) => `    ${SCRIPT_TAG}\n  ${match}`),
      injected: true,
    }
  }

  // No </head> tag — skip inject + warn (rather than corrupt the HTML)
  return {
    html,
    injected: false,
    warning:
      'theokit devtools: index.html has no </head> tag; devtools script was NOT injected. Add <head>…</head> to your template to enable devtools.',
  }
}
