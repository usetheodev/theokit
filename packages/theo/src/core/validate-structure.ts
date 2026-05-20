/* eslint-disable security/detect-non-literal-fs-filename --
 * Project-structure validator. Reads paths joined onto `projectRoot`,
 * with names from a fixed `ValidationRule[]` table. No HTTP input.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { TheoProjectError } from './errors.js'

interface ValidationRule {
  path: string
  errorMessage: string
}

const REQUIRED_DIRS: ValidationRule[] = [
  {
    path: 'app',
    errorMessage: 'Missing required directory: app/',
  },
]

const REQUIRED_FILES: ValidationRule[] = [
  {
    path: 'theo.config.ts',
    errorMessage: 'Missing required file: theo.config.ts',
  },
  {
    path: 'package.json',
    errorMessage: 'Missing required file: package.json',
  },
]

export function validateProjectStructure(rootDir: string): void {
  if (!existsSync(rootDir)) {
    throw new TheoProjectError([`Project directory does not exist: ${rootDir}`], rootDir)
  }

  const errors: string[] = []

  for (const rule of REQUIRED_DIRS) {
    if (!existsSync(join(rootDir, rule.path))) {
      errors.push(rule.errorMessage)
    }
  }

  for (const rule of REQUIRED_FILES) {
    if (!existsSync(join(rootDir, rule.path))) {
      errors.push(rule.errorMessage)
    }
  }

  if (errors.length > 0) {
    throw new TheoProjectError(errors, rootDir)
  }
}
