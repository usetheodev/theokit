import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T3.1 — Migration guide shape linter.
 *
 * The migration guide is editorial content but its STRUCTURE is enforced:
 * it must carry the section headings users navigate against, and it must
 * carry the `#csrf-strict-cutover` anchor that T2.2's `docsUrl` points at.
 *
 * Content (the actual prose, code snippets, gotchas) is reviewed by humans;
 * this linter pins the shape so a future reorganization doesn't break the
 * URL contract or leave migration users without a recognizable index.
 */

const GUIDE_PATH = resolve(__dirname, '../../docs/migrating/0.2-to-0.3.md')
const README_PATH = resolve(__dirname, '../../docs/migrating/README.md')

function readGuide(): string {
  if (!existsSync(GUIDE_PATH)) throw new Error(`Missing ${GUIDE_PATH}`)
  return readFileSync(GUIDE_PATH, 'utf-8')
}

function readReadme(): string {
  if (!existsSync(README_PATH)) throw new Error(`Missing ${README_PATH}`)
  return readFileSync(README_PATH, 'utf-8')
}

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

describe('T3.1 — migration guide file presence', () => {
  it('Given path, Then docs/migrating/0.2-to-0.3.md exists', () => {
    expect(existsSync(GUIDE_PATH)).toBe(true)
  })

  it('Given path, Then docs/migrating/README.md exists', () => {
    expect(existsSync(README_PATH)).toBe(true)
  })
})

describe('T3.1 — migration guide required sections', () => {
  const REQUIRED_HEADINGS = [
    /^##\s+TL;?DR/im,
    /^##\s+Prerequisites/im,
    /^##\s+Step[- ]by[- ]step/im,
    /^##\s+Escape hatches/im,
    /^##\s+Per-route gating/im,
    /^##\s+Gotchas/im,
    /^##\s+FAQ/im,
    /^##\s+Rollback/im,
    /^##\s+Known limitations/im,
  ]

  it.each(REQUIRED_HEADINGS.map((re) => [re.source, re]))(
    'Given guide, Then heading matching %s is present',
    (_label, re) => {
      const content = readGuide()
      expect(content).toMatch(re as RegExp)
    },
  )
})

describe('T3.1 — migration guide CSRF strict cutover anchor', () => {
  it('Given content, Then a section labelled "CSRF Strict Cutover" (or similar) exists matching the docsUrl', () => {
    const content = readGuide()
    // The T2.2 docsUrl ends in /upgrade/csrf-strict-cutover. Until the
    // docs site ships (0.4.0), the same slug must resolve as a section
    // anchor in this file.
    const headings = (content.match(/^#{1,3}\s+.+$/gm) ?? []).map((h) =>
      slugify(h.replace(/^#+\s+/, '')),
    )
    expect(headings).toContain('csrf-strict-cutover')
  })
})

describe('T3.1 — migration guide internal links resolve', () => {
  it('Given each ](#anchor) link, Then a matching heading slug exists in the same file', () => {
    const content = readGuide()
    const headings = new Set(
      (content.match(/^#{1,6}\s+.+$/gm) ?? []).map((h) =>
        slugify(h.replace(/^#+\s+/, '')),
      ),
    )
    const links = Array.from(content.matchAll(/\]\(#([a-z0-9-]+)\)/gi)).map(
      (m) => m[1].toLowerCase(),
    )
    const missing = links.filter((href) => !headings.has(href))
    expect(missing, `missing anchors: ${missing.join(', ')}`).toEqual([])
  })
})

describe('T3.1 — migration guide README index', () => {
  it('Given migrating/README.md, Then it lists the 0.2-to-0.3.md guide', () => {
    const content = readReadme()
    expect(content).toMatch(/0\.2-to-0\.3\.md/)
  })

  it('Given migrating/README.md, Then it advertises the docsUrl convention', () => {
    const content = readReadme()
    expect(content).toMatch(/csrf-strict-cutover/)
  })
})
