export default function Home() {
  return (
    <main>
      <h1>Per-route rate limit fixture</h1>
      <p>POST /api/login is strict (5/min); GET /api/health is loose.</p>
    </main>
  )
}
