/* eslint-disable security/detect-non-literal-fs-filename --
 * `create-theokit` scaffold tool. All write paths are derived from the
 * user-supplied target directory (CLI argument, resolved to absolute).
 * Read paths are the bundled `templates/` shipped with this package.
 * Build-time tool — no HTTP input.
 */
import {
  existsSync,
  cpSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyBareTransform } from './bare-transform.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getTemplateDir(templateName = 'default'): string {
  return resolve(__dirname, '../templates', templateName)
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/.test(name)
}

export interface ScaffoldOptions {
  bare?: boolean
  /** Test-only — force the bare transform to throw to validate EC-4 rollback. */
  _testForceTransformError?: string
}

export function scaffold(
  targetDir: string,
  projectName: string,
  templateName = 'default',
  options: ScaffoldOptions = {},
): void {
  // EC-4 + ADR D5: --bare only applies to default template
  if (options.bare && templateName !== 'default') {
    throw new Error(
      `--bare flag only applies to the default template; got "${templateName}". ` +
        `Use \`npx create-theokit <name> --template=default --bare\` or pick a different template.`,
    )
  }

  const templateDir = getTemplateDir(templateName)

  if (!existsSync(templateDir)) {
    throw new Error(
      `Template "${templateName}" not found. Available templates: default, dashboard, api-only, postgres, saas`,
    )
  }

  if (!isValidProjectName(projectName)) {
    throw new Error(
      `Invalid project name "${projectName}". ` +
        `Use lowercase letters, numbers, hyphens, and dots. Must start with a letter or number.`,
    )
  }

  if (existsSync(targetDir)) {
    const contents = readdirSync(targetDir)
    if (contents.length > 0) {
      throw new Error(`Directory "${targetDir}" is not empty. Please use an empty directory.`)
    }
  }

  cpSync(templateDir, targetDir, { recursive: true })

  const gitignoreSrc = join(targetDir, '_gitignore')
  const gitignoreDest = join(targetDir, '.gitignore')
  if (existsSync(gitignoreSrc)) {
    renameSync(gitignoreSrc, gitignoreDest)
  }

  const tmplPath = join(targetDir, 'package.json.tmpl')
  if (existsSync(tmplPath)) {
    const content = readFileSync(tmplPath, 'utf-8')
    const replaced = content.replace(/\{\{name\}\}/g, projectName)
    writeFileSync(join(targetDir, 'package.json'), replaced)
    unlinkSync(tmplPath)
  }

  // T4.1 — Apply --bare transform with EC-4 atomic rollback
  if (options.bare) {
    try {
      applyBareTransform(targetDir, {
        _testForceError: options._testForceTransformError,
      })
    } catch (err) {
      // EC-4: roll back partial state
      rmSync(targetDir, { recursive: true, force: true })
      const original = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Scaffold rolled back: bare transform failed. Check filesystem perms.\nOriginal error: ${original}`,
      )
    }
  }
}
