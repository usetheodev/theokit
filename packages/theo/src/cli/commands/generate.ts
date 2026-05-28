/* eslint-disable security/detect-non-literal-fs-filename --
 * CLI `theo generate`. Writes scaffolded files under `cwd` + a generator
 * name from CLI args. Build-time tool. No HTTP input.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

export const VALID_TYPES = ['route', 'action', 'page', 'ws'] as const
export type GeneratorType = (typeof VALID_TYPES)[number]

export interface GenerateOptions {
  cwd: string
  type: string
  name: string
}

export type GenerateStatus =
  | 'created'
  | 'already_exists'
  | 'invalid_kind'
  | 'invalid_name'
  | 'not_a_project'

export interface GenerateResult {
  status: GenerateStatus
  filePath?: string
  kind?: GeneratorType
  name?: string
  message?: string
}

function toKebabCase(name: string): boolean {
  return /^[a-z][a-z0-9/-]*$/.test(name)
}

function toPascalCase(name: string): string {
  return name
    .split(/[-/]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

function toCamelCase(name: string): string {
  const pascal = toPascalCase(name)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

function generateRouteTemplate(name: string): string {
  return [
    `import { defineRoute } from 'theokit/server'`,
    `import { z } from 'zod'`,
    ``,
    `export const GET = defineRoute({`,
    `  handler: ({ ctx }) => {`,
    `    return { message: 'TODO: implement ${name} GET' }`,
    `  },`,
    `})`,
    ``,
  ].join('\n')
}

function generateActionTemplate(name: string): string {
  const camel = toCamelCase(name)
  return [
    `import { defineAction } from 'theokit/server'`,
    `import { z } from 'zod'`,
    ``,
    `export const ${camel} = defineAction({`,
    `  input: z.object({}),`,
    `  handler: ({ input, ctx }) => {`,
    `    return { message: 'TODO: implement ${name}' }`,
    `  },`,
    `})`,
    ``,
  ].join('\n')
}

function generatePageTemplate(name: string): string {
  const pascal = toPascalCase(name)
  return [`export default function ${pascal}Page() {`, `  return <h1>${pascal}</h1>`, `}`, ``].join(
    '\n',
  )
}

function generateWsTemplate(_name: string): string {
  return [
    `import { defineWebSocket } from 'theokit/server'`,
    ``,
    `export default defineWebSocket({`,
    `  onMessage(ws, data) {`,
    `    ws.send(\`echo: \${data}\`)`,
    `  },`,
    `})`,
    ``,
  ].join('\n')
}

/**
 * Programmatic generate. Returns a structured result instead of throwing —
 * Studio (`theokit_generate` tool) consumes this directly. The CLI wrapper
 * below maps the structured result to console output + exit code semantics.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const { cwd, type, name } = opts

  if (!existsSync(resolve(cwd, 'theo.config.ts')) && !existsSync(resolve(cwd, 'theo.config.js'))) {
    return {
      status: 'not_a_project',
      message: 'Not a Theo project. cwd has no theo.config.ts or theo.config.js',
    }
  }

  if (!VALID_TYPES.includes(type as GeneratorType)) {
    return {
      status: 'invalid_kind',
      message: `Invalid generator type "${type}". Available: ${VALID_TYPES.join(', ')}`,
    }
  }

  if (!name || !toKebabCase(name)) {
    return {
      status: 'invalid_name',
      message: `Invalid name "${name}". Use kebab-case: lowercase letters, numbers, hyphens.`,
    }
  }

  let filePath: string
  let content: string

  switch (type as GeneratorType) {
    case 'route':
      filePath = resolve(cwd, 'server/routes', `${name}.ts`)
      content = generateRouteTemplate(name)
      break
    case 'action':
      filePath = resolve(cwd, 'server/actions', `${name}.ts`)
      content = generateActionTemplate(name)
      break
    case 'page':
      filePath = resolve(cwd, `app/${name}/page.tsx`)
      content = generatePageTemplate(name)
      break
    case 'ws':
      filePath = resolve(cwd, 'server/ws', `${name}.ts`)
      content = generateWsTemplate(name)
      break
    default:
      return { status: 'invalid_kind', message: `Unknown type: ${type}` }
  }

  if (existsSync(filePath)) {
    return { status: 'already_exists', filePath, kind: type as GeneratorType, name }
  }

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)

  return { status: 'created', filePath, kind: type as GeneratorType, name }
}

/**
 * CLI entry point — preserves the original surface (throws + console.log).
 * Wraps the programmatic `generate` function.
 */
export async function generateCommand(type: string, name: string): Promise<void> {
  const result = await generate({ cwd: process.cwd(), type, name })
  switch (result.status) {
    case 'not_a_project':
      throw new Error('Not a Theo project. Run this from a project root with theo.config.ts')
    case 'invalid_kind':
      throw new Error(result.message ?? 'Invalid kind')
    case 'invalid_name':
      throw new Error(
        `Invalid name "${name}". Use kebab-case: lowercase letters, numbers, hyphens. Example: my-route`,
      )
    case 'already_exists':
      console.log(`\n  ⚠ ${result.filePath} already exists. Skipping.\n`)
      return
    case 'created':
      console.log(`\n  ✓ Created ${type}: ${result.filePath}\n`)
      return
  }
}
