/**
 * Auto-inject the entry-client `<script>` into served HTML.
 *
 * Origin: a real user (live session) wrote `index.html` without the
 * `<script type="module" src="/@theo/entry-client"></script>` tag. The
 * page rendered SSR perfectly but NO JS ran — every onClick was dead.
 * No error, no warning. An hour of debugging.
 *
 * Fix: the Vite plugin's `transformIndexHtml` hook runs this for every
 * served HTML. If the script is already present (by URL substring match
 * — handles every quoting/ordering variant) the HTML is returned
 * unchanged. Otherwise the script is inserted before `</body>`. If
 * there's no `</body>` at all (malformed HTML), the script is appended
 * at the end and we emit a console.warn in dev.
 */

const ENTRY_CLIENT_URL = '/@theo/entry-client'
const SCRIPT_TAG = `<script type="module" src="${ENTRY_CLIENT_URL}"></script>`

export interface InjectResult {
  html: string
  injected: boolean
  warning?: string
}

export function injectEntryClient(html: string): InjectResult {
  // Detect via URL substring — robust against:
  //   <script src='/@theo/entry-client'>
  //   <script type="module" src="/@theo/entry-client" />
  //   <link rel="modulepreload" href="/@theo/entry-client">
  if (html.includes(ENTRY_CLIENT_URL)) {
    return { html, injected: false }
  }

  // Inject before </body> (case-insensitive, first occurrence)
  const bodyClosePattern = /<\/body\s*>/i
  if (bodyClosePattern.test(html)) {
    return {
      html: html.replace(bodyClosePattern, (match) => `    ${SCRIPT_TAG}\n  ${match}`),
      injected: true,
    }
  }

  // Malformed HTML — append at end and warn
  return {
    html: `${html}\n${SCRIPT_TAG}`,
    injected: true,
    warning:
      'theokit: index.html has no </body> tag; entry-client script was appended at end. Add <body>…</body> to your template.',
  }
}
