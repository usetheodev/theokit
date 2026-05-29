/**
 * T2.1 — Unit tests for scripts/sync-template-versions.mjs (BDD).
 *
 * Covers edge cases EC-2 (walk recursivo 2 níveis para services/), EC-3
 * (workspace:* ignorado), EC-4 (dep ausente ignorada), e idempotência.
 *
 * Strategy: importa a função exportada `syncTemplates` em sandbox tmp
 * com truth injetada (não depende de lockfile real).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, it, expect, afterEach } from 'vitest'

import { syncTemplates } from '../../scripts/sync-template-versions.mjs'

let SANDBOXES: string[] = []

function makeSandbox(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `theokit-sync-${name}-`))
  SANDBOXES.push(dir)
  return dir
}

function writeTpl(dir: string, name: string, body: object) {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(
    join(dir, name, 'package.json.tmpl'),
    JSON.stringify(body, null, 2) + '\n',
  )
}

afterEach(() => {
  for (const dir of SANDBOXES) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
  SANDBOXES = []
})

const TRUTH = {
  theokit: '^0.1.0-alpha.5',
  '@usetheo/sdk': '^1.1.0',
  '@usetheo/ui': '^0.12.0-next.0',
}

describe('syncTemplates — drift detection + write', () => {
  it('should report drift in check mode and not modify files', () => {
    // Given a template with stale theokit pin
    const sandbox = makeSandbox('drift-check')
    writeTpl(sandbox, 'foo', {
      name: 'foo-tpl',
      dependencies: { theokit: '^0.1.0-alpha.1' },
    })

    // When we run check mode
    const result = syncTemplates({ mode: 'check', templatesDir: sandbox, truth: TRUTH })

    // Then drift is reported and file is untouched
    expect(result.drifted.length).toBe(1)
    expect(result.drifted[0].dep).toBe('theokit')
    expect(result.drifted[0].current).toBe('^0.1.0-alpha.1')
    expect(result.drifted[0].expected).toBe('^0.1.0-alpha.5')
    expect(result.written).toBe(0)
    const after = JSON.parse(readFileSync(join(sandbox, 'foo', 'package.json.tmpl'), 'utf-8'))
    expect(after.dependencies.theokit).toBe('^0.1.0-alpha.1')
  })

  it('should correct drift in write mode', () => {
    // Given a template with stale theokit pin
    const sandbox = makeSandbox('drift-write')
    writeTpl(sandbox, 'foo', {
      name: 'foo-tpl',
      dependencies: { theokit: '^0.1.0-alpha.1' },
    })

    // When we run write mode
    const result = syncTemplates({ mode: 'write', templatesDir: sandbox, truth: TRUTH })

    // Then file is updated with truth and result reflects write
    expect(result.drifted.length).toBe(1)
    expect(result.written).toBe(1)
    const after = JSON.parse(readFileSync(join(sandbox, 'foo', 'package.json.tmpl'), 'utf-8'))
    expect(after.dependencies.theokit).toBe('^0.1.0-alpha.5')
  })

  it('should be idempotent — running write twice produces same result as once', () => {
    // Given a template already in sync
    const sandbox = makeSandbox('idempotent')
    writeTpl(sandbox, 'foo', {
      name: 'foo-tpl',
      dependencies: { theokit: '^0.1.0-alpha.5' },
    })

    // When we run write twice
    const first = syncTemplates({ mode: 'write', templatesDir: sandbox, truth: TRUTH })
    const second = syncTemplates({ mode: 'write', templatesDir: sandbox, truth: TRUTH })

    // Then both report no drift and no writes
    expect(first.drifted.length).toBe(0)
    expect(first.written).toBe(0)
    expect(second.drifted.length).toBe(0)
    expect(second.written).toBe(0)
  })
})

describe('syncTemplates — edge cases (EC-2, EC-3, EC-4)', () => {
  it('EC-2: should sync templates nested 2 levels deep (e.g., services/agent-node)', () => {
    // Given a template nested under services/agent-node — like the real
    // packages/create-theo/templates/services/agent-{node,python} layout
    const sandbox = makeSandbox('ec2-nested')
    writeTpl(sandbox, 'services', {
      // ⚠️ NOTE: only services/ dir, no package.json.tmpl directly here.
      // The walker should NOT find it here, only nested.
      name: 'placeholder',
      dependencies: {},
    })
    // Remove the placeholder we just created — we need empty services/ then nested
    rmSync(join(sandbox, 'services', 'package.json.tmpl'))
    writeTpl(sandbox, 'services/agent-node', {
      name: 'agent-node-tpl',
      dependencies: { theokit: '^0.1.0-alpha.1' },
    })
    writeTpl(sandbox, 'services/agent-python', {
      name: 'agent-python-tpl',
      dependencies: { theokit: '^0.1.0-alpha.2' },
    })

    // When we run write mode
    const result = syncTemplates({ mode: 'write', templatesDir: sandbox, truth: TRUTH })

    // Then BOTH nested templates are detected and synced
    expect(result.total).toBe(2)
    expect(result.drifted.length).toBe(2)
    expect(result.written).toBe(2)
    const nodeAfter = JSON.parse(
      readFileSync(join(sandbox, 'services', 'agent-node', 'package.json.tmpl'), 'utf-8'),
    )
    const pyAfter = JSON.parse(
      readFileSync(join(sandbox, 'services', 'agent-python', 'package.json.tmpl'), 'utf-8'),
    )
    expect(nodeAfter.dependencies.theokit).toBe('^0.1.0-alpha.5')
    expect(pyAfter.dependencies.theokit).toBe('^0.1.0-alpha.5')
  })

  it('EC-2: should NOT descend past maxDepth (sanity bound)', () => {
    // Given a template at depth 3 (a/b/c/d/package.json.tmpl):
    // depth 0 → sandbox/a; depth 1 → a/b; depth 2 → b/c; depth 3 → c/d (over bound).
    const sandbox = makeSandbox('ec2-depth3')
    writeTpl(sandbox, 'a/b/c/d', {
      name: 'too-deep',
      dependencies: { theokit: '^0.1.0-alpha.1' },
    })

    // When we run with default maxDepth=2
    const result = syncTemplates({ mode: 'check', templatesDir: sandbox, truth: TRUTH })

    // Then the deeply nested template is ignored
    expect(result.total).toBe(0)
    expect(result.drifted.length).toBe(0)
  })

  it('EC-3: should ignore workspace:* deps (intentional inside monorepo)', () => {
    // Given a template using workspace:* (e.g., fixture inside the workspace)
    const sandbox = makeSandbox('ec3-workspace')
    writeTpl(sandbox, 'foo', {
      name: 'foo-tpl',
      dependencies: { theokit: 'workspace:*' },
    })

    // When we run check mode
    const result = syncTemplates({ mode: 'check', templatesDir: sandbox, truth: TRUTH })

    // Then workspace:* is left alone — zero drift reported
    expect(result.drifted.length).toBe(0)
  })

  it('EC-4: should NOT force-add deps that are absent from the template', () => {
    // Given a template that declares only theokit (no @usetheo/ui, no @usetheo/sdk)
    // e.g., the api-only template in the real workspace
    const sandbox = makeSandbox('ec4-absent')
    writeTpl(sandbox, 'api-only', {
      name: 'api-only-tpl',
      dependencies: { theokit: '^0.1.0-alpha.5' },
    })

    // When we run write mode
    const result = syncTemplates({ mode: 'write', templatesDir: sandbox, truth: TRUTH })

    // Then no entries are added — @usetheo/sdk/ui remain absent
    expect(result.drifted.length).toBe(0)
    const after = JSON.parse(
      readFileSync(join(sandbox, 'api-only', 'package.json.tmpl'), 'utf-8'),
    )
    expect(after.dependencies['@usetheo/sdk']).toBeUndefined()
    expect(after.dependencies['@usetheo/ui']).toBeUndefined()
  })

  it('should cover both dependencies and devDependencies buckets', () => {
    // Given a template with managed deps split across both buckets
    const sandbox = makeSandbox('both-buckets')
    writeTpl(sandbox, 'foo', {
      name: 'foo-tpl',
      dependencies: { theokit: '^0.1.0-alpha.1' },
      devDependencies: { '@usetheo/sdk': '^1.0.0' },
    })

    // When we run write mode
    const result = syncTemplates({ mode: 'write', templatesDir: sandbox, truth: TRUTH })

    // Then both are synced
    expect(result.drifted.length).toBe(2)
    expect(result.written).toBe(1) // one file
    const after = JSON.parse(readFileSync(join(sandbox, 'foo', 'package.json.tmpl'), 'utf-8'))
    expect(after.dependencies.theokit).toBe('^0.1.0-alpha.5')
    expect(after.devDependencies['@usetheo/sdk']).toBe('^1.1.0')
  })
})
