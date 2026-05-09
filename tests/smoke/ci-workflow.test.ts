import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'

const rootDir = resolve(__dirname, '../..')

function loadWorkflow(name: string) {
  const path = resolve(rootDir, `.github/workflows/${name}`)
  const content = readFileSync(path, 'utf-8')
  return parse(content)
}

describe('CI Workflow', () => {
  const ciPath = resolve(rootDir, '.github/workflows/ci.yml')

  it('should exist', () => {
    expect(existsSync(ciPath)).toBe(true)
  })

  it('should be valid YAML', () => {
    const workflow = loadWorkflow('ci.yml')
    expect(workflow).toBeDefined()
    expect(workflow.name).toBe('CI')
  })

  it('should trigger on push and PR to main', () => {
    const workflow = loadWorkflow('ci.yml')
    expect(workflow.on.push.branches).toContain('main')
    expect(workflow.on.pull_request.branches).toContain('main')
  })

  it('should have test job with Node matrix [20, 22]', () => {
    const workflow = loadWorkflow('ci.yml')
    const matrix = workflow.jobs.test.strategy.matrix['node-version']
    expect(matrix).toContain(20)
    expect(matrix).toContain(22)
  })

  it('should use pnpm/action-setup', () => {
    const workflow = loadWorkflow('ci.yml')
    const steps = workflow.jobs['lint-and-typecheck'].steps
    const hasPnpmSetup = steps.some((s: Record<string, string>) => s.uses?.includes('pnpm/action-setup'))
    expect(hasPnpmSetup).toBe(true)
  })

  it('should use --frozen-lockfile for install', () => {
    const workflow = loadWorkflow('ci.yml')
    const steps = workflow.jobs.test.steps
    const installStep = steps.find((s: Record<string, string>) => s.run?.includes('pnpm install'))
    expect(installStep?.run).toContain('--frozen-lockfile')
  })

  it('should have build step', () => {
    const workflow = loadWorkflow('ci.yml')
    const steps = workflow.jobs['lint-and-typecheck'].steps
    const hasBuild = steps.some((s: Record<string, string>) => s.run?.includes('pnpm build'))
    expect(hasBuild).toBe(true)
  })

  it('should have package-validation job with publint', () => {
    const workflow = loadWorkflow('ci.yml')
    const steps = workflow.jobs['package-validation'].steps
    const hasPublint = steps.some((s: Record<string, string>) => s.run?.includes('publint'))
    expect(hasPublint).toBe(true)
  })

  it('should have e2e job with playwright install', () => {
    const workflow = loadWorkflow('ci.yml')
    const steps = workflow.jobs.e2e.steps
    const hasPlaywright = steps.some((s: Record<string, string>) => s.run?.includes('playwright install'))
    expect(hasPlaywright).toBe(true)
  })
})

describe('Release Workflow', () => {
  const releasePath = resolve(rootDir, '.github/workflows/release.yml')

  it('should exist', () => {
    expect(existsSync(releasePath)).toBe(true)
  })

  it('should be valid YAML', () => {
    const workflow = loadWorkflow('release.yml')
    expect(workflow).toBeDefined()
    expect(workflow.name).toBe('Release')
  })

  it('should use changesets/action@v1', () => {
    const workflow = loadWorkflow('release.yml')
    const steps = workflow.jobs.release.steps
    const hasChangesets = steps.some((s: Record<string, string>) => s.uses?.includes('changesets/action'))
    expect(hasChangesets).toBe(true)
  })

  it('should reference NPM_TOKEN', () => {
    const content = readFileSync(releasePath, 'utf-8')
    expect(content).toContain('NPM_TOKEN')
  })

  it('should run build before publish', () => {
    const workflow = loadWorkflow('release.yml')
    const steps = workflow.jobs.release.steps
    const buildIdx = steps.findIndex((s: Record<string, string>) => s.run?.includes('pnpm build'))
    const changesetsIdx = steps.findIndex((s: Record<string, string>) => s.uses?.includes('changesets/action'))
    expect(buildIdx).toBeLessThan(changesetsIdx)
  })
})
