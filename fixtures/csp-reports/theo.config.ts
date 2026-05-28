import { defineConfig } from 'theokit'
import { JsonStdoutSink } from 'theokit/server'

/**
 * T5.1 fixture — CSP report endpoint end-to-end.
 *
 * Default CSP already includes `report-uri /__theo/csp-report`. The
 * built-in endpoint forwards violations to:
 *   - the audit logger configured here (stdout JSON)
 *   - devtools dispatcher (dev only)
 *   - optional user hook (not wired in this fixture)
 *
 * Run with `pnpm dev`, then POST a mock report to /__theo/csp-report
 * and observe the audit line in stdout.
 */
export default defineConfig({
  audit: {
    logger: new JsonStdoutSink(),
  },
  security: {
    headers: {
      // Stay in report-only mode for this fixture so violations are
      // observed without breaking the page.
      cspMode: 'report-only',
    },
  },
})
