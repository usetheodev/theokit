import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T3.3 — vite-plugin/index.ts auto-wires UI plugins via integrateUseTheoUI.
 *
 * Static check: index.ts imports integrateUseTheoUI, calls it in config()
 * with consumer-config detection, returns the plugins array via config()
 * hook return value.
 *
 * Functional coverage of integrateUseTheoUI is in tests/unit/integrate-ui.test.ts.
 */

const VP = resolve(process.cwd(), 'packages/theo/src/vite-plugin/index.ts')

describe('T3.3 — vite-plugin wires integrateUseTheoUI', () => {
  it('imports integrateUseTheoUI', () => {
    const src = readFileSync(VP, 'utf-8')
    expect(src).toMatch(/import\s+\{\s*integrateUseTheoUI\s*\}\s+from\s+['"]\.\/integrate-ui/)
  })

  it('config() hook is async', () => {
    const src = readFileSync(VP, 'utf-8')
    expect(src).toMatch(/async\s+config\(\)/)
  })

  it('config() calls integrateUseTheoUI with projectRoot + consumer-config detection', () => {
    const src = readFileSync(VP, 'utf-8')
    expect(src).toMatch(/integrateUseTheoUI\(projectRoot/)
    expect(src).toMatch(/consumerTailwindConfig/)
    expect(src).toMatch(/consumerPostcssConfig/)
  })

  it('exports theoPluginAsync that returns Plugin[] (Vite-canonical auto-chain)', () => {
    const src = readFileSync(VP, 'utf-8')
    // The auto-chain moved out of config()'s `plugins:` return (Vite drops
    // plugins returned that way) into a top-level `theoPluginAsync` factory
    // that returns `[theoPlugin, ...uiPlugins]`. Consumers spread its
    // result into the plugins array.
    expect(src).toMatch(/export\s+async\s+function\s+theoPluginAsync/)
    expect(src).toMatch(/return\s*\[\s*theoPlugin\(rootOrOptions\)\s*,\s*\.\.\.uiPlugins\s*\]/)
  })

  it('findConsumerConfig helper walks for tailwind.config + postcss.config', () => {
    const src = readFileSync(VP, 'utf-8')
    expect(src).toMatch(/findConsumerConfig\(projectRoot,\s+['"]tailwind\.config['"]\)/)
    expect(src).toMatch(/findConsumerConfig\(projectRoot,\s+['"]postcss\.config['"]\)/)
  })
})
