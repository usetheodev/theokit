/**
 * JobRegistry augmentation — REQUIRED for typed `ctx.queue.enqueue` calls.
 *
 * Without this augmentation, `ctx.queue.enqueue('foo', ...)` errors with:
 *   "Type 'foo' is not assignable to type 'never'"
 *
 * This is the canonical TheoKit jobs onboarding bug (EC-110). To add a
 * job:
 *
 * 1. Create `server/jobs/<name>.ts` exporting `defineJob('<name>', ...)`
 * 2. Add `'<name>': { ...inputShape }` below
 * 3. Use `ctx.queue.enqueue('<name>', { ...input })` from any route handler
 *
 * See: docs/concepts/jobs.md
 */
declare module 'theokit/server' {
  interface JobRegistry {
    // Add your jobs here. Examples (uncomment and customize):
    //
    // 'process-document': { documentId: string }
    // 'send-email': { to: string; subject: string; body: string }
  }
}

export {}
