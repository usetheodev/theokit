/* eslint-disable security/detect-non-literal-fs-filename --
 * CLI `theo generate`. Writes scaffolded files under `cwd` + a generator
 * name from CLI args. Build-time tool. No HTTP input.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const VALID_TYPES = ['route', 'action', 'page', 'ws'] as const
type GeneratorType = (typeof VALID_TYPES)[number]

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

// eslint-disable-next-line @typescript-eslint/require-await -- CLI surface contract; sync today is implementation detail
export async function generateCommand(type: string, name: string): Promise<void> {
  const cwd = process.cwd()

  // Check if in a Theo project (EC-1)
  if (!existsSync(resolve(cwd, 'theo.config.ts')) && !existsSync(resolve(cwd, 'theo.config.js'))) {
    throw new Error('Not a Theo project. Run this from a project root with theo.config.ts')
  }

  // Validate type
  if (!VALID_TYPES.includes(type as GeneratorType)) {
    throw new Error(`Invalid generator type "${type}". Available types: ${VALID_TYPES.join(', ')}`)
  }

  // Validate name
  if (!name || !toKebabCase(name)) {
    throw new Error(
      `Invalid name "${name}". Use kebab-case: lowercase letters, numbers, hyphens. Example: my-route`,
    )
  }

  // Determine file path and content
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
      throw new Error(`Unknown type: ${type}`)
  }

  // Check if file exists
  if (existsSync(filePath)) {
    console.log(`\n  ⚠ ${filePath} already exists. Skipping.\n`)
    return
  }

  // Create directories
  mkdirSync(dirname(filePath), { recursive: true })

  // Write file
  writeFileSync(filePath, content)

  console.log(`\n  ✓ Created ${type}: ${filePath}\n`)
}
