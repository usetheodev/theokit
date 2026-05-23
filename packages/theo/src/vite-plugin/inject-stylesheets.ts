/**
 * Inject `<link rel="stylesheet">` tags into served HTML during DEV.
 *
 * Why this exists (real bug, 2026-05-22): the example chat app had an
 * LCP of 9-16s because the HTML response landed WITHOUT any `<link>` tag
 * for `@usetheo/ui/styles.css`. CSS only loaded after entry-client.js
 * ran the layout import. Browser paint waited for the JS → CSS chain:
 *
 *   HTML arrives → browser paints nothing
 *   JS bundle arrives → React hydrates → encounters `import 'styles.css'`
 *   CSS arrives → browser RE-paints with styles
 *
 * Fix: emit the `<link>` in the HTML head so the browser fetches CSS in
 * PARALLEL with JS. LCP becomes time-to-CSS instead of time-to-JS-exec.
 *
 * DEV-only: in production builds, Vite's SSR pipeline emits the
 * appropriate `<link>` via its own asset manifest (with content hashes).
 * We must not double-inject there.
 */

interface StylesheetTarget {
  /** Vite dev URL — what the browser hits */
  href: string
  /** node_modules path checked before injection */
  packageRoot: string
}

const TARGETS: StylesheetTarget[] = [
  {
    href: '/@id/@usetheo/ui/styles.css',
    packageRoot: '@usetheo/ui',
  },
]

/**
 * Font preloads — cuts the "Flash of Unstyled Text" (FOUT) that
 * `font-display: swap` causes. Without preloading, the browser paints
 * with system-ui first, swaps to Geist when the woff2 lands, and the
 * text reflows (Geist has different glyph metrics than system fonts).
 * That reflow shows up as CLS in DevTools (measured 0.39 in the example
 * before this fix). With preload, the browser fetches the woff2 IN
 * PARALLEL with the HTML — Geist is cached before paint, swap happens
 * before user perception, CLS → ~0.
 *
 * Only the 3 body weights are preloaded — display variants and Mono are
 * lazy (rarely on the critical path).
 */
interface FontPreloadTarget {
  /** URL Vite serves the woff2 at */
  href: string
  /** Filesystem path checked before injection (existsSync inside hasPackage's cwd) */
  filePath: string
}

const FONT_TARGETS: FontPreloadTarget[] = [
  {
    href: '/@fs/REPLACE/node_modules/@usetheo/ui/dist/fonts/geist-400.woff2',
    filePath: 'node_modules/@usetheo/ui/dist/fonts/geist-400.woff2',
  },
  {
    href: '/@fs/REPLACE/node_modules/@usetheo/ui/dist/fonts/geist-500.woff2',
    filePath: 'node_modules/@usetheo/ui/dist/fonts/geist-500.woff2',
  },
  {
    href: '/@fs/REPLACE/node_modules/@usetheo/ui/dist/fonts/geist-600.woff2',
    filePath: 'node_modules/@usetheo/ui/dist/fonts/geist-600.woff2',
  },
]

export interface InjectStylesheetsResult {
  html: string
  injected: string[]
}

export interface InjectStylesheetsOptions {
  /** Only inject in dev (default). Skip when building for production. */
  isDev: boolean
  /** Function that checks whether a package is installed at projectRoot. */
  hasPackage(name: string): boolean
  /** Absolute project root — used to materialize font preload URLs. */
  projectRoot?: string
  /** Function that checks whether a file exists inside projectRoot. */
  hasFile?(relPath: string): boolean
}

export function injectStylesheets(
  html: string,
  opts: InjectStylesheetsOptions,
): InjectStylesheetsResult {
  if (!opts.isDev) return { html, injected: [] }

  const tagsToInject: string[] = []
  for (const target of TARGETS) {
    if (!opts.hasPackage(target.packageRoot)) continue
    // Idempotency: skip if href already present
    if (html.includes(target.href)) continue
    tagsToInject.push(`<link rel="stylesheet" href="${target.href}" />`)
  }

  // Font preloads — only when @usetheo/ui present + the woff2 files
  // exist on disk + projectRoot is known. /@fs/ URL needs the absolute
  // path; we serialize the realpath so Vite serves the file directly.
  if (opts.projectRoot && opts.hasFile && opts.hasPackage('@usetheo/ui')) {
    for (const font of FONT_TARGETS) {
      if (!opts.hasFile(font.filePath)) continue
      const absUrl = `/@fs/${opts.projectRoot}/${font.filePath}`
      if (html.includes(absUrl)) continue
      tagsToInject.push(
        `<link rel="preload" as="font" type="font/woff2" crossorigin href="${absUrl}" />`,
      )
    }
  }

  if (tagsToInject.length === 0) return { html, injected: [] }

  const joined = tagsToInject.join('\n    ')
  // Inject before </head>; fall back to start of <body> if no head close.
  const headClosePattern = /<\/head\s*>/i
  if (headClosePattern.test(html)) {
    return {
      html: html.replace(headClosePattern, (match) => `    ${joined}\n  ${match}`),
      injected: tagsToInject,
    }
  }

  const bodyOpenPattern = /<body[^>]*>/i
  if (bodyOpenPattern.test(html)) {
    return {
      html: html.replace(bodyOpenPattern, (match) => `${match}\n    ${joined}`),
      injected: tagsToInject,
    }
  }

  // Malformed HTML — prepend and trust the browser
  return { html: `${joined}\n${html}`, injected: tagsToInject }
}
