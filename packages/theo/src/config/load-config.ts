import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { theoConfigSchema } from './schema.js'
import { TheoConfigError } from './errors.js'
import type { TheoConfig } from './schema.js'

const CONFIG_FILE = 'theo.config.ts'

export async function loadConfig(dir: string): Promise<TheoConfig> {
  const configPath = resolve(dir, CONFIG_FILE)

  if (!existsSync(configPath)) {
    return theoConfigSchema.parse({})
  }

  let mod: Record<string, unknown>
  try {
    mod = await import(pathToFileURL(configPath).href)
  } catch (err) {
    throw new TheoConfigError(
      [{ field: '_file', message: (err as Error).message }],
      configPath,
    )
  }

  const userConfig = mod.default

  if (userConfig == null || typeof userConfig !== 'object') {
    throw new TheoConfigError(
      [
        {
          field: '_export',
          message:
            'theo.config.ts must use export default defineConfig({...})',
        },
      ],
      configPath,
    )
  }

  const result = theoConfigSchema.safeParse(userConfig)

  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }))
    throw new TheoConfigError(issues, configPath)
  }

  return result.data
}
