import type { z } from 'zod'

export interface ActionConfig<TInput extends z.ZodType, TCtx = unknown> {
  input: TInput
  handler: (ctx: { input: z.infer<TInput>; ctx: TCtx }) => unknown | Promise<unknown>
}

/**
 * Define a typed server action.
 * Identity function — provides type inference for action handlers.
 */
export function defineAction<TInput extends z.ZodType, TCtx = unknown>(
  config: ActionConfig<TInput, TCtx>,
): ActionConfig<TInput, TCtx> {
  return config
}
