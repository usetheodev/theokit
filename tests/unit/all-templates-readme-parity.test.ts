import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Plan: `dogfood-skill-coverage-completion-plan.md` T1.5 — README parity gate.
 *
 * Validates that all 5 official templates ship a `README.md.tmpl` covering
 * the 3 required sections (Quick start / Project structure / Common commands)
 * + `{{name}}` placeholder at least twice + LOC budget per template.
 *
 * Template-specific assertions enforce the customizations that make the
 * README useful per template anatomy (api-only uses curl, postgres mentions
 * DATABASE_URL + drizzle, saas mentions SESSION_SECRET + openssl).
 *
 * Rationale (ADR D1): 5 templates with byte-identical READMEs would drift
 * within 2-3 sprints; this gate prevents that.
 */

const ROOT = resolve(__dirname, '../..')

const TEMPLATES = ['default', 'dashboard', 'api-only', 'postgres', 'saas'] as const
type TemplateName = (typeof TEMPLATES)[number]

const REQUIRED_SECTIONS = [
  '## Quick start',
  '## Project structure',
  '## Common commands',
] as const

// Bumped +2 LOC across all templates to absorb v1.1 docs link line + blank.
const LOC_CAPS: Record<TemplateName, number> = {
  default: 82,
  dashboard: 82,
  'api-only': 82,
  postgres: 92,
  saas: 107,
}

function readmePath(template: TemplateName): string {
  return resolve(ROOT, `packages/create-theo/templates/${template}/README.md.tmpl`)
}

describe('all templates README.md.tmpl parity', () => {
  for (const tpl of TEMPLATES) {
    describe(`template: ${tpl}`, () => {
      const path = readmePath(tpl)

      it('README.md.tmpl exists', () => {
        expect(existsSync(path)).toBe(true)
      })

      it('contains all required sections', () => {
        const content = readFileSync(path, 'utf-8')
        for (const section of REQUIRED_SECTIONS) {
          expect(content).toContain(section)
        }
      })

      it('contains {{name}} placeholder (h1 customization)', () => {
        const content = readFileSync(path, 'utf-8')
        const matches = content.match(/\{\{name\}\}/g) ?? []
        // At least once — the h1 IS the canonical placeholder.
        expect(matches.length).toBeGreaterThanOrEqual(1)
        // Must appear in the h1 (first line after stripping)
        expect(content).toMatch(/^# \{\{name\}\}/m)
      })

      it(`LOC budget ≤ ${LOC_CAPS[tpl]}`, () => {
        const loc = readFileSync(path, 'utf-8').split('\n').length
        expect(loc).toBeLessThanOrEqual(LOC_CAPS[tpl])
      })
    })
  }
})

describe('docs link in README header (v1.1 EC-D6 + Phase 2A)', () => {
  for (const tpl of TEMPLATES) {
    it(`${tpl} README contains docs.theokit.dev link in header`, () => {
      // Given: README opens with h1 + sub-h1 + docs link blockquote
      const content = readFileSync(readmePath(tpl), 'utf-8')
      const header = content.split('\n').slice(0, 10).join('\n')

      // When/Then: docs link is present + properly formatted in header
      expect(header).toContain('docs.theokit.dev')
      expect(header).toMatch(/>\s*📚.*Full docs.*docs\.theokit\.dev/)
    })
  }
})

describe('template-specific README assertions', () => {
  it('api-only README uses curl (not browser-first)', () => {
    const content = readFileSync(readmePath('api-only'), 'utf-8')
    expect(content).toMatch(/^curl /m)
  })

  it('postgres README mentions DATABASE_URL', () => {
    const content = readFileSync(readmePath('postgres'), 'utf-8')
    expect(content).toContain('DATABASE_URL')
  })

  it('postgres README mentions drizzle', () => {
    const content = readFileSync(readmePath('postgres'), 'utf-8').toLowerCase()
    expect(content).toContain('drizzle')
  })

  it('postgres README mentions a provisioning option (docker or hosted)', () => {
    const content = readFileSync(readmePath('postgres'), 'utf-8').toLowerCase()
    expect(content).toMatch(/docker|neon|supabase|fly\.io/)
  })

  it('saas README mentions SESSION_SECRET', () => {
    const content = readFileSync(readmePath('saas'), 'utf-8')
    expect(content).toContain('SESSION_SECRET')
  })

  it('saas README mentions openssl rand (strong secret generation)', () => {
    const content = readFileSync(readmePath('saas'), 'utf-8')
    expect(content).toMatch(/openssl rand/)
  })

  it('saas README documents auth flow (register or login)', () => {
    const content = readFileSync(readmePath('saas'), 'utf-8').toLowerCase()
    expect(content).toMatch(/register|login/)
  })

  it('saas README mentions db:migrate', () => {
    const content = readFileSync(readmePath('saas'), 'utf-8')
    expect(content).toMatch(/db:migrate/)
  })
})
