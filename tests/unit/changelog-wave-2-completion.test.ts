import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CHANGELOG = resolve(__dirname, '../../CHANGELOG.md')

describe('CHANGELOG — wave-2-polyglot-services-completion entry (plan v1.1 Global DoD)', () => {
  it('contains a wave-2-polyglot-services-completion section in [Unreleased]', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/##\s*\[Unreleased\]/)
    expect(src).toMatch(/wave-2-polyglot-services-completion/i)
  })

  it('documents the dev wire-up (T1.1)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/theokit dev[\s\S]+orchestrateDev/i)
  })

  it('documents the build manifest emit (T1.2)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/theokit build[\s\S]+\.theo\/services\.json/i)
  })

  it('documents the node adapter compose + Caddyfile (T2.1)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/docker-compose\.yml/)
    expect(src).toMatch(/Caddyfile/)
  })

  it('documents the 7-adapter rejection (T2.2)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/assertServicesUnsupported/)
    expect(src).toMatch(/vercel.*cloudflare.*aws-lambda|7 non-TheoCloud adapters/i)
  })

  it('documents the theo-cloud adapter stub (T2.3)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/theo-cloud.*adapter|Wave 3 stub/i)
  })

  it('documents the services-typed-client Vite plugin (T3.1)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/services-typed-client|Hey API/i)
  })

  it('documents the 3 fixtures + EC-3 drift check (T4.1/T4.2/T4.3)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/services-python-basic/)
    expect(src).toMatch(/services-node-basic/)
    expect(src).toMatch(/services-both/)
    expect(src).toMatch(/EC-3|byte-equal/i)
  })

  it('documents the Playwright spec (T5.1)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/Playwright[\s\S]+services-fullstack/i)
  })

  it('documents the gates passed (cross-validation + dogfood)', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toMatch(/Cross-validation:?\s*APROVADO/)
    expect(src).toMatch(/Dogfood QA:?\s*Health\s*9\d\/100|Health\s*[89]\d\/100/)
  })

  it('references the plan + edge-case review', () => {
    const src = readFileSync(CHANGELOG, 'utf-8')
    expect(src).toContain('docs/plans/wave-2-completion-plan.md')
    expect(src).toContain('docs/reviews/edge-case-plan/wave-2-completion-edge-cases-2026-05-27.md')
  })
})
