export default function ErrorBoundary({ error }: { error: Error }) {
  return (
    <div style={{ padding: 24, color: '#c00' }}>
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
    </div>
  )
}
