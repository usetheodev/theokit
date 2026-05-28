import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

/**
 * Item #4 — `defineAgentTool`
 *
 * Sugar over the `@usetheo/sdk` `CustomTool` contract. Takes a Zod 3 schema +
 * handler and produces a structurally-compatible `CustomTool` that
 * `Agent.create({ tools: [...] })` accepts.
 *
 * Why not delegate to SDK's `defineTool`?
 *   SDK's `defineTool` calls `z.toJSONSchema(...)` which only exists on Zod 4
 *   (at root) or `zod/v4` (Zod 3.25+ subpath). TheoKit pins Zod 3 framework-
 *   wide. Bumping to Zod 4 is a major breaking change touching every primitive
 *   — out of scope for this item. Instead, we convert the Zod schema to JSON
 *   Schema 7 with `zod-to-json-schema` (Zod 3 native, MIT, zero transitive
 *   deps, 3M weekly DLs) and build the `CustomTool` object directly. See ADR
 *   D1 in `docs/plans/item-4-define-agent-tool-plan.md`.
 *
 * Handler error propagation:
 *   `defineAgentTool` parses the input via the Zod schema BEFORE calling the
 *   user handler. Invalid input throws a `ZodError`, which the SDK's tool-
 *   dispatcher (or the `streamAgentRun` adapter) sees as a tool failure and
 *   surfaces as an `error` AgentEvent on the SSE wire (ADR D3).
 */

/**
 * Local mirror of the SDK's `CustomTool` interface. We don't `import type`
 * from `@usetheo/sdk` because the SDK is an optional peer (consumers who
 * never call `defineAgentTool` shouldn't need it installed). The shape is
 * the wire contract; any structurally-matching object is accepted by
 * `Agent.create({ tools })`.
 *
 * @public
 */
export interface CustomTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (input: Record<string, unknown>) => string | Promise<string>
}

/**
 * Spec accepted by {@link defineAgentTool}. `inputSchema` is a Zod 3 schema
 * rooted in `z.object(...)`. The `handler` argument type is inferred via
 * `z.infer<T>`.
 *
 * @public
 */
export interface DefineAgentToolSpec<T extends z.ZodType> {
  /** Tool name surfaced to the LLM. Must match `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`. */
  name: string
  /** Description surfaced to the LLM. Required — drives tool-selection accuracy. */
  description: string
  /** Zod schema describing the input. Must be `z.object(...)` at the root. */
  inputSchema: T
  /** Handler invoked with the parsed input. */
  handler: (input: z.infer<T>) => string | Promise<string>
}

const TOOL_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

function isZodObject(schema: z.ZodType): boolean {
  // Zod 3 stores the typeName at `_def.typeName`. ZodObject has 'ZodObject'.
  // Refinements (`.refine`), transforms (`.transform`), and defaults wrap the
  // underlying schema in ZodEffects / ZodDefault / etc. — walk the chain via
  // `_def.schema` / `_def.innerType` until we hit ZodObject (or give up).
  // Avoids importing the ZodObject class to keep the runtime import surface
  // minimal.
  let current: unknown = schema
  for (let depth = 0; depth < 10; depth++) {
    const def = (current as { _def?: { typeName?: string; schema?: unknown; innerType?: unknown } })
      ._def
    if (def?.typeName === 'ZodObject') return true
    if (def?.schema !== undefined) {
      current = def.schema
      continue
    }
    if (def?.innerType !== undefined) {
      current = def.innerType
      continue
    }
    return false
  }
  return false
}

/**
 * Build a {@link CustomTool} from a Zod 3 schema + handler.
 *
 * Behavior:
 * - Validates `name` matches the LLM tool-name regex.
 * - Requires `inputSchema` to be a `ZodObject` (Anthropic + SDK contract).
 * - Warns (not throws) if `description` is empty — empty descriptions
 *   degrade LLM tool selection.
 * - Converts the Zod schema to JSON Schema 7 inline (no `$ref`s — LLMs handle
 *   inline schemas more reliably).
 * - Strips the top-level `$schema` field (Anthropic rejects schemas with
 *   `$schema` at root in some provider modes).
 * - Wraps the handler to parse the input via the Zod schema BEFORE invoking
 *   the user code — bad LLM-supplied input throws `ZodError`, which the SDK
 *   converts to `tool_result(isError)`.
 *
 * @public
 */
export function defineAgentTool<T extends z.ZodType>(spec: DefineAgentToolSpec<T>): CustomTool {
  if (!TOOL_NAME_REGEX.test(spec.name)) {
    throw new Error(
      `defineAgentTool: name must match ${TOOL_NAME_REGEX.source}. Got: ${JSON.stringify(spec.name)}`,
    )
  }
  if (!isZodObject(spec.inputSchema)) {
    throw new Error('defineAgentTool: inputSchema must be a ZodObject (z.object({...}))')
  }
  if (spec.description.length === 0) {
    console.warn(
      `defineAgentTool(${JSON.stringify(spec.name)}): empty description degrades LLM tool selection — provide a one-sentence summary.`,
    )
  }

  // `$refStrategy: 'none'` inlines all subschemas. LLMs handle inline schemas
  // more reliably than $ref-resolved ones. Recursive schemas (z.lazy) are
  // typically guarded by the consumer with maxDepth / typeName checks.
  const rawSchema = zodToJsonSchema(spec.inputSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>
  // Strip $schema if present at root — Anthropic + some providers reject it.
  const { $schema: _$schema, ...inputSchema } = rawSchema as Record<string, unknown> & {
    $schema?: unknown
  }

  return {
    name: spec.name,
    description: spec.description,
    inputSchema,
    handler: async (input: Record<string, unknown>): Promise<string> => {
      const parsed = spec.inputSchema.parse(input) as z.infer<T>
      return await spec.handler(parsed)
    },
  }
}
