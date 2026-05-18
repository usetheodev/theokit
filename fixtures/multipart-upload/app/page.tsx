'use client'

import { useState } from 'react'

export default function Page() {
  const [result, setResult] = useState<unknown>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    setResult(await res.json())
  }

  return (
    <main>
      <h1>Multipart upload demo</h1>
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <input name="file" type="file" required />
        <input name="description" type="text" placeholder="Optional description" />
        <button type="submit">Upload</button>
      </form>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </main>
  )
}
