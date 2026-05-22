import { defineRoute } from 'theokit/server'

/**
 * Test endpoint for T1.2 — exposes whether process.env.OPENROUTER_API_KEY
 * was populated by the framework's auto-load. Used in
 * tests/unit/cli-env-wiring.test.ts.
 */
export const GET = defineRoute({
  handler: () => {
    return {
      openRouterKey: process.env.OPENROUTER_API_KEY ?? null,
      fixtureVar: process.env.ZERO_CONFIG_FIXTURE_VAR ?? null,
    }
  },
})
