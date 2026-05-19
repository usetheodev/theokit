/**
 * T2.2 EC-20 — defensive grep guard.
 *
 * NO file under packages/theo/src/devtools/ may use `dangerouslySetInnerHTML`.
 * Devtools renders user-controlled paths, headers, JSON keys, and error
 * messages — XSS in devtools (even in dev) could phish dev-env credentials
 * (which usually include `.env` secrets used for prod). React's auto-escape
 * is the contract; any direct innerHTML escape hatch is forbidden.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DEVTOOLS_DIR = resolve(__dirname, '../../packages/theo/src/devtools')
const FORBIDDEN_TOKEN = 'dangerouslySetInnerHTML'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...walk(full))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('EC-20 — devtools has zero dangerouslySetInnerHTML', () => {
  it('grep over packages/theo/src/devtools finds NO dangerouslySetInnerHTML', () => {
    const offenders: string[] = []
    for (const file of walk(DEVTOOLS_DIR)) {
      const content = readFileSync(file, 'utf-8')
      if (content.includes(FORBIDDEN_TOKEN)) {
        // The forbidden token appears either as code or as a guard comment.
        // Reject only when it appears OUTSIDE a guard comment line.
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!
          if (!line.includes(FORBIDDEN_TOKEN)) continue
          const trimmed = line.trim()
          // Allow comments mentioning the rule (NEVER use dangerouslySetInnerHTML…)
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
          offenders.push(`${file}:${i + 1}: ${trimmed}`)
        }
      }
    }
    expect(offenders, offenders.length ? `EC-20 violations:\n${offenders.join('\n')}` : 'OK').toEqual([])
  })

  it('every devtools file carries the EC-20 guard comment', () => {
    const missing: string[] = []
    for (const file of walk(DEVTOOLS_DIR)) {
      const content = readFileSync(file, 'utf-8')
      if (!content.includes('NEVER use dangerouslySetInnerHTML')) {
        missing.push(file)
      }
    }
    expect(missing, missing.length ? `missing EC-20 guard comment:\n${missing.join('\n')}` : 'OK').toEqual([])
  })
})
