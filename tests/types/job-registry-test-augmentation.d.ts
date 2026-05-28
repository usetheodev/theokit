/**
 * Module augmentation for test-only JobRegistry entries.
 *
 * EC-110 (jobs primitive): without this augmentation, `ctx.queue.enqueue('foo', ...)`
 * fails with "Type 'foo' is not assignable to type 'never'". Tests that
 * exercise the queue client with hardcoded job names need to declare those
 * names in JobRegistry.
 *
 * This file is included automatically by tsconfig tests glob patterns.
 */
declare module 'theokit/server' {
  interface JobRegistry {
    // Generic test job names used across queue-client.test.ts and
    // job-trace-propagation.test.ts. Inputs are `unknown` because tests pass
    // arbitrary shapes to verify the wiring (not the validation).
    'test-job': unknown
    cap: unknown
    a: unknown
    b: unknown
    echo: unknown
  }
}

declare module '../../packages/theo/src/server/jobs/job-types.js' {
  interface JobRegistry {
    'test-job': unknown
    cap: unknown
    a: unknown
    b: unknown
    echo: unknown
  }
}

export {}
