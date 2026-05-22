import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T2.3 — `theokit dev` startup runs gcAgentRegistry against `.theokit/agents/`.
 *
 * Static check: dev.ts imports gcAgentRegistry, computes agentsDir, calls
 * it with config.agents?.maxRegistries override, logs result when deleted > 0.
 *
 * Functional coverage of the GC algorithm is in tests/unit/cleanup.test.ts.
 */

const DEV = resolve(process.cwd(), 'packages/theo/src/cli/commands/dev.ts')

describe('T2.3 — dev wires gcAgentRegistry', () => {
  it('imports gcAgentRegistry from cleanup lib', () => {
    const src = readFileSync(DEV, 'utf-8')
    expect(src).toMatch(/import\s+\{\s*gcAgentRegistry\s*\}\s+from\s+['"]\.\.\/lib\/cleanup/)
  })

  it('calls gcAgentRegistry with agentsDir + config.agents?.maxRegistries', () => {
    const src = readFileSync(DEV, 'utf-8')
    expect(src).toMatch(/\.theokit\/agents/)
    expect(src).toMatch(/gcAgentRegistry\(\s*\{/)
    expect(src).toMatch(/config\.agents\?\.maxRegistries/)
  })

  it('logs "Cleaned ... stale agent registries" when deleted > 0', () => {
    const src = readFileSync(DEV, 'utf-8')
    expect(src).toMatch(/Cleaned\s+.*stale agent registries/)
  })

  it('gc call happens AFTER loadConfig (needs config.agents)', () => {
    const src = readFileSync(DEV, 'utf-8')
    const loadConfigIdx = src.search(/await\s+loadConfig\(/)
    const gcCallIdx = src.search(/await\s+gcAgentRegistry\(/)
    expect(loadConfigIdx).toBeGreaterThan(0)
    expect(gcCallIdx).toBeGreaterThan(0)
    expect(loadConfigIdx).toBeLessThan(gcCallIdx)
  })
})
