import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T1.4 — Static check that the `_env.ts` shim is gone and the example
 * uses the framework's loadEnv. Plus EC-7 — Telegram bot uses explicit cwd.
 */

const EXAMPLE = resolve(process.cwd(), 'examples/full-stack-agent')

describe('T1.4 — example uses framework loadEnv (shim deleted)', () => {
  it('server/_env.ts does NOT exist', () => {
    expect(existsSync(resolve(EXAMPLE, 'server/_env.ts'))).toBe(false)
  })

  it('chat.ts does not import the deleted shim', () => {
    const src = readFileSync(resolve(EXAMPLE, 'server/routes/chat.ts'), 'utf-8')
    expect(src).not.toMatch(/import\s+['"]\.\.\/_env/)
  })

  it('telegram-bot.ts imports loadEnv from theokit/server', () => {
    const src = readFileSync(resolve(EXAMPLE, 'server/telegram-bot.ts'), 'utf-8')
    expect(src).toMatch(/import\s+\{[^}]*loadEnv[^}]*\}\s+from\s+['"]theokit\/server['"]/)
  })

  it('EC-7: telegram-bot.ts calls loadEnv with explicit cwd (not no-arg)', () => {
    const src = readFileSync(resolve(EXAMPLE, 'server/telegram-bot.ts'), 'utf-8')
    // The call site should have a cwd: option — not just `loadEnv()`
    expect(src).toMatch(/loadEnv\(\s*\{\s*cwd:/)
  })

  it('theokit/server re-exports loadEnv', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'packages/theo/src/server/index.ts'),
      'utf-8',
    )
    expect(src).toMatch(/export\s+\{[^}]*loadEnv[^}]*\}\s+from\s+['"]\.\.\/config\/load-env/)
  })
})
