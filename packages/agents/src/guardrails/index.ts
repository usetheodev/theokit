/**
 * M9 (theokit-ai-first) — guardrails barrel.
 *
 * Pluggable input/output guards at the agent boundary (ADR-0040 § D2). Reuse the SDK runtime,
 * never reimplement it. Wire via `defineAgent({ guardrails: [...] })`.
 */
export {
  type Guardrail,
  type GuardrailAction,
  type GuardrailResult,
  type GuardrailPhase,
  GuardrailViolationError,
  MalformedGuardrailResultError,
  CostBudgetExceededError,
} from './types.js'
export {
  estimateTokens,
  promptInjectionDetector,
  type PromptInjectionOptions,
  piiDetector,
  type PiiOptions,
  unicodeNormalizer,
  costGuard,
  type CostGuardOptions,
  outputModeration,
  type OutputModerationOptions,
} from './detectors.js'
export { runInputGuards, runOutputGuards } from './pipeline.js'
export { moderateOutputStream } from './stream.js'
