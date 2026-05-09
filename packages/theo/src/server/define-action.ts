import type { z } from 'zod'

export interface ActionConfig<TInput extends z.ZodType> {
  input: TInput
  handler: (ctx: { input: z.infer<TInput>; ctx: unknown }) => unknown | Promise<unknown>
}

/**
 * Define a typed server action.
 * Identity function — provides type inference for action handlers.
 */
export function defineAction<TInput extends z.ZodType>(
  config: ActionConfig<TInput>,
): ActionConfig<TInput> {
  return config
}
