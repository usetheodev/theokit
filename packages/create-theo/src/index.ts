import { existsSync, cpSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getTemplateDir(): string {
  return resolve(__dirname, '../templates/default')
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/.test(name)
}

export function scaffold(targetDir: string, projectName: string): void {
  const templateDir = getTemplateDir()

  if (!existsSync(templateDir)) {
    throw new Error(
      `Template not found at ${templateDir}. This is a bug in create-theo.`,
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
      throw new Error(
        `Directory "${targetDir}" is not empty. Please use an empty directory.`,
      )
    }
  }

  // Copy template
  cpSync(templateDir, targetDir, { recursive: true })

  // Rename _gitignore → .gitignore
  const gitignoreSrc = join(targetDir, '_gitignore')
  const gitignoreDest = join(targetDir, '.gitignore')
  if (existsSync(gitignoreSrc)) {
    renameSync(gitignoreSrc, gitignoreDest)
  }

  // Process package.json.tmpl → package.json
  const tmplPath = join(targetDir, 'package.json.tmpl')
  if (existsSync(tmplPath)) {
    const content = readFileSync(tmplPath, 'utf-8')
    const replaced = content.replace(/\{\{name\}\}/g, projectName)
    writeFileSync(join(targetDir, 'package.json'), replaced)
    unlinkSync(tmplPath)
  }
}
