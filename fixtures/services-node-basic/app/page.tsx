import { useState } from 'react'

export default function Page() {
  const [result, setResult] = useState('')
  const onClick = async () => {
    try {
      const res = await fetch('/api/worker/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      })
      const data = (await res.json()) as { echo: string }
      setResult(data.echo)
    } catch (err) {
      setResult(`error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return (
    <div>
      <h1>services-node-basic fixture</h1>
      <button data-test="echo-button" onClick={onClick}>
        Send /api/worker/echo
      </button>
      <pre data-test="echo-result">{result}</pre>
    </div>
  )
}
