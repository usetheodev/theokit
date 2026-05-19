export default function Page() {
  async function onSubmit() {
    // VIOLATION: raw fetch POST without X-Theo-Action header.
    await fetch('/api/legacy-form', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    })
  }

  return (
    <>
      <button onClick={onSubmit}>Send</button>
      {/* VIOLATION: dangerouslySetInnerHTML containing inline <script>. */}
      <div
        dangerouslySetInnerHTML={{
          __html: '<script>window.foo = 1</script>',
        }}
      />
    </>
  )
}
