import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(__dirname, '../..')
const TEMPLATE = resolve(REPO, 'packages/create-theo/templates/default')

describe('default template — JobRegistry augmentation example (T2.2)', () => {
  it('types/jobs.d.ts exists in scaffold template', () => {
    expect(existsSync(resolve(TEMPLATE, 'types/jobs.d.ts'))).toBe(true)
  })

  it('jobs.d.ts contains declare module + JobRegistry augmentation', () => {
    const content = readFileSync(resolve(TEMPLATE, 'types/jobs.d.ts'), 'utf8')
    expect(content).toMatch(/declare module 'theokit\/server'/)
    expect(content).toMatch(/interface JobRegistry/)
  })

  it('jobs.d.ts has documentation comment explaining EC-110 + usage', () => {
    const content = readFileSync(resolve(TEMPLATE, 'types/jobs.d.ts'), 'utf8')
    expect(content).toMatch(/REQUIRED|never|EC-110/)
    expect(content).toMatch(/docs\/concepts\/jobs/)
  })

  it('jobs.d.ts has commented-out examples (not active by default)', () => {
    const content = readFileSync(resolve(TEMPLATE, 'types/jobs.d.ts'), 'utf8')
    // Examples should be commented out so user doesn't have to delete them
    expect(content).toMatch(/\/\/.*'process-document'.*documentId/)
  })

  it('jobs.d.ts is a valid TS declaration file (parseable)', () => {
    const content = readFileSync(resolve(TEMPLATE, 'types/jobs.d.ts'), 'utf8')
    // Trivial sanity: contains balanced braces
    const openBraces = (content.match(/\{/g) ?? []).length
    const closeBraces = (content.match(/\}/g) ?? []).length
    expect(openBraces).toBe(closeBraces)
  })
})
