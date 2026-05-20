/* eslint-disable security/detect-non-literal-fs-filename --
 * Config loader. Reads `theo.config.{ts,js,mjs}` under the user's `cwd`.
 * Names are a fixed set of literals; `cwd` is a CLI arg resolved to
 * absolute. Build-time tool — no HTTP input.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { TheoConfigError } from './errors.js'
import { theoConfigSchema } from './schema.js'
import type { TheoConfig } from './schema.js'

const CONFIG_FILE = 'theo.config.ts'

/**
 * Deep merges two plain objects. Override values take precedence.
 * Arrays are replaced (not concatenated).
 * Protects against prototype pollution (EC-4).
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base }
  for (const key of Object.keys(override)) {
    // EC-4: Prevent prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue

    const baseVal = base[key]
    const overVal = override[key]

    if (
      overVal !== null &&
      typeof overVal === 'object' &&
      !Array.isArray(overVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      )
    } else {
      result[key] = overVal
    }
  }
  return result
}

export async function loadConfig(dir: string): Promise<TheoConfig> {
  const configPath = resolve(dir, CONFIG_FILE)

  if (!existsSync(configPath)) {
    return theoConfigSchema.parse({})
  }

  let mod: Record<string, unknown>
  try {
    mod = (await import(pathToFileURL(configPath).href)) as Record<string, unknown>
  } catch (err) {
    throw new TheoConfigError([{ field: '_file', message: (err as Error).message }], configPath)
  }

  const userConfig = mod.default

  if (userConfig == null || typeof userConfig !== 'object') {
    throw new TheoConfigError(
      [
        {
          field: '_export',
          message: 'theo.config.ts must use export default defineConfig({...})',
        },
      ],
      configPath,
    )
  }

  // Merge with per-environment config if NODE_ENV is set
  let rawConfig = userConfig as Record<string, unknown>
  const nodeEnv = process.env.NODE_ENV

  if (nodeEnv) {
    const envFile = `theo.config.${nodeEnv}.ts`
    const envPath = resolve(dir, envFile)

    if (existsSync(envPath)) {
      try {
        const envMod = (await import(pathToFileURL(envPath).href)) as Record<string, unknown>
        const envConfig = envMod.default

        if (envConfig != null && typeof envConfig === 'object') {
          rawConfig = deepMerge(rawConfig, envConfig as Record<string, unknown>)
        }
      } catch (err) {
        throw new TheoConfigError([{ field: '_file', message: (err as Error).message }], envPath)
      }
    }
  }

  const result = theoConfigSchema.safeParse(rawConfig)

  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }))
    throw new TheoConfigError(issues, configPath)
  }

  return result.data
}
