import type { IncomingMessage, ServerResponse } from 'node:http'
import { safeAudit, type AuditLogger } from './audit-log.js'

/**
 * T5.1 — Built-in CSP report endpoint.
 *
 * Browsers POST violation reports to `report-uri` (legacy `application/csp-report`)
 * or `Reporting API` (`application/reports+json`). Framework auto-registers this
 * endpoint so `cspMode: 'report-only'` is actually useful out of the box.
 *
 * Forwards normalized violations to:
 *   - audit logger (`csp.violation`)
 *   - devtools dispatcher (dev only, for Errors tab)
 *   - optional user hook (Sentry, etc.)
 *
 * EC-2: browser MAY send `{"csp-report": null}`, empty `{}`, or
 * reports+json entries lacking `body`. Handler MUST short-circuit to
 * 204 (valid format, no violation), NEVER crash via null deref.
 */

export const CSP_REPORT_PATH = '/__theo/csp-report'

/** Max body bytes accepted. Real CSP reports are < 2 KB; 16 KB is generous. */
const MAX_BODY = 16 * 1024

export interface CspViolation {
  blockedUrl: string
  documentUrl: string
  violatedDirective: string
  effectiveDirective?: string
  originalPolicy?: string
  disposition?: 'enforce' | 'report'
  statusCode?: number
  sourceFile?: string
  lineNumber?: number
  columnNumber?: number
}

export interface CspReportHandlerOptions {
  auditLogger?: AuditLogger
  devtoolsDispatcher?: {
    onCspViolation?: (v: CspViolation) => void
  }
  /** Optional user-provided sink (Sentry, custom log router). Errors here are swallowed. */
  onViolation?: (v: CspViolation) => void
}

/**
 * Map a legacy `application/csp-report` payload to the internal shape.
 * Caller must ensure `raw` is a non-null object.
 */
export function normalizeLegacy(raw: Record<string, unknown>): CspViolation {
  return {
    blockedUrl: String(raw['blocked-uri'] ?? '(missing)'),
    documentUrl: String(raw['document-uri'] ?? '(missing)'),
    violatedDirective: String(raw['violated-directive'] ?? '(missing)'),
    effectiveDirective: typeof raw['effective-directive'] === 'string' ? (raw['effective-directive'] as string) : undefined,
    originalPolicy: typeof raw['original-policy'] === 'string' ? (raw['original-policy'] as string) : undefined,
    disposition: raw.disposition === 'enforce' || raw.disposition === 'report' ? (raw.disposition as 'enforce' | 'report') : undefined,
    statusCode: typeof raw['status-code'] === 'number' ? (raw['status-code'] as number) : undefined,
    sourceFile: typeof raw['source-file'] === 'string' ? (raw['source-file'] as string) : undefined,
    lineNumber: typeof raw['line-number'] === 'number' ? (raw['line-number'] as number) : undefined,
    columnNumber: typeof raw['column-number'] === 'number' ? (raw['column-number'] as number) : undefined,
  }
}

/**
 * Map a `reports+json` entry to the internal shape. Returns `null` if
 * the entry lacks a usable `body` object (EC-2).
 */
export function normalizeNew(entry: unknown): CspViolation | null {
  if (!entry || typeof entry !== 'object') return null
  const body = (entry as { body?: unknown }).body
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  return {
    blockedUrl: String(b.blockedURL ?? '(missing)'),
    documentUrl: String(b.documentURL ?? '(missing)'),
    violatedDirective: String(b.violatedDirective ?? '(missing)'),
    effectiveDirective: typeof b.effectiveDirective === 'string' ? (b.effectiveDirective as string) : undefined,
    originalPolicy: typeof b.originalPolicy === 'string' ? (b.originalPolicy as string) : undefined,
    disposition: b.disposition === 'enforce' || b.disposition === 'report' ? (b.disposition as 'enforce' | 'report') : undefined,
    statusCode: typeof b.statusCode === 'number' ? (b.statusCode as number) : undefined,
    sourceFile: typeof b.sourceFile === 'string' ? (b.sourceFile as string) : undefined,
    lineNumber: typeof b.lineNumber === 'number' ? (b.lineNumber as number) : undefined,
    columnNumber: typeof b.columnNumber === 'number' ? (b.columnNumber as number) : undefined,
  }
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export async function handleCspReport(
  req: IncomingMessage,
  res: ServerResponse,
  opts: CspReportHandlerOptions,
): Promise<void> {
  const ct = (req.headers['content-type'] ?? '').toString()

  let raw: string
  try {
    raw = await readBody(req, MAX_BODY)
  } catch {
    res.statusCode = 413
    res.end()
    return
  }

  let violations: CspViolation[]
  try {
    if (ct.startsWith('application/csp-report')) {
      // EC-2: browsers MAY POST {"csp-report": null} or {} on
      // disposition='report' policies. Guard against null/undefined/non-object.
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const inner = parsed?.['csp-report']
      if (!inner || typeof inner !== 'object') {
        res.statusCode = 204
        res.end()
        return
      }
      violations = [normalizeLegacy(inner as Record<string, unknown>)]
    } else if (ct.startsWith('application/reports+json')) {
      // EC-2: filter out entries lacking `body` BEFORE normalizing.
      const parsed = JSON.parse(raw)
      const entries = Array.isArray(parsed) ? parsed : []
      violations = entries
        .map((e) => normalizeNew(e))
        .filter((v): v is CspViolation => v !== null)
    } else {
      res.statusCode = 415
      res.end()
      return
    }
  } catch {
    res.statusCode = 400
    res.end()
    return
  }

  for (const v of violations) {
    safeAudit(opts.auditLogger, { action: 'csp.violation', metadata: v as unknown as Record<string, unknown> })
    try {
      opts.devtoolsDispatcher?.onCspViolation?.(v)
    } catch {
      // dispatcher errors are isolated from the request
    }
    try {
      opts.onViolation?.(v)
    } catch {
      // user hook throws are swallowed — never crash the request
    }
  }

  res.statusCode = 204
  res.end()
}
