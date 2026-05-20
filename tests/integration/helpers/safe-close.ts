/**
 * Helper: close a ViteDevServer with a bounded timeout.
 *
 * `server.close()` can hang past 30s on some hosts because Vite's file
 * watcher + esbuild workers race the teardown. The integration tests
 * don't care if every resource finished cleaning up — they care that
 * teardown doesn't blow past the afterAll budget.
 *
 * `safeClose` races `server.close()` against a bounded timeout and
 * resolves either way. The timer is `unref`-ed so it never holds the
 * process alive on its own. Settled state is shared via a flag so a
 * trailing `close()` resolution after the timeout doesn't surface as
 * an unhandled rejection.
 */
export async function safeClose(
  server: { close: () => Promise<unknown> } | undefined,
  timeoutMs = 5000,
): Promise<void> {
  if (!server) return
  let settled = false
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve()
    }, timeoutMs)
    // `unref` so the timer alone doesn't keep the test process alive.
    if (typeof timer.unref === 'function') timer.unref()
    void server
      .close()
      .catch(() => {
        // Vite teardown errors are noise here — the timeout will resolve.
      })
      .then(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      })
  })
}
