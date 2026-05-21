/**
 * T4.1 — Minimal deployable page. The smoke script asserts:
 *   1. GET / returns 200
 *   2. HTML contains the h1 below
 *   3. Response carries `x-theo-deployed-by` header (set by adapter)
 */
export default function Home() {
  return (
    <main>
      <h1>TheoKit deployed</h1>
      <p>This page is served by TheoKit through the Vercel adapter.</p>
    </main>
  )
}
