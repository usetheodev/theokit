/**
 * T2.4 — Custom error pages loader.
 *
 * Loads optional `.theo/client/404.html` and `500.html` from disk so adapters
 * (Node, CF, Vercel, Bun, Netlify, AWS Lambda, Deno) can pass them to the
 * shared `sendError` pipeline.
 *
 * EC-9: caps file size at 1MB. Files beyond the limit are skipped with a
 * console.warn and the default JSON error path is used.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

export const MAX_ERROR_HTML_BYTES = 1_048_576 // 1MB

export interface CustomErrorPages {
  custom404Html?: string
  custom500Html?: string
}

function loadIfSafe(dir: string, name: string): string | undefined {
  const path = resolve(dir, name)
  if (!existsSync(path)) return undefined
  try {
    const stat = statSync(path)
    if (stat.size > MAX_ERROR_HTML_BYTES) {
      console.warn(
        `[theokit] Custom error page ${name} is ${stat.size} bytes (max ${MAX_ERROR_HTML_BYTES}); skipping.`,
      )
      return undefined
    }
    return readFileSync(path, 'utf-8')
  } catch (err) {
    console.warn(`[theokit] Failed to read ${name}: ${(err as Error).message}`)
    return undefined
  }
}

/**
 * Load `.theo/client/{404,500}.html` from the given client directory.
 * Returns object with both fields when present; missing pages remain undefined.
 */
export function loadCustomErrorPages(clientDir: string): CustomErrorPages {
  return {
    custom404Html: loadIfSafe(clientDir, '404.html'),
    custom500Html: loadIfSafe(clientDir, '500.html'),
  }
}
