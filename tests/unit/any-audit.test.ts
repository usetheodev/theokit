import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import path from 'node:path'

const srcDir = path.resolve(import.meta.dirname, '../../packages/theo/src')

function grepCount(pattern: string): number {
  try {
    const result = execSync(
      `grep -rn '${pattern}' ${srcDir} --include="*.ts" | wc -l`,
      { encoding: 'utf-8' },
    )
    return parseInt(result.trim(), 10)
  } catch {
    return 0
  }
}

describe('Any Audit — Zero any in production code', () => {
  it('should have zero ": any" type annotations', () => {
    const count = grepCount(': any[^a-zA-Z]')
    expect(count).toBe(0)
  })

  it('should have zero "as any" type assertions', () => {
    const count = grepCount('as any')
    expect(count).toBe(0)
  })

  it('should have zero @ts-ignore directives', () => {
    const count = grepCount('@ts-ignore')
    expect(count).toBe(0)
  })

  it('should have zero @ts-expect-error in production code', () => {
    const count = grepCount('@ts-expect-error')
    expect(count).toBe(0)
  })
})
