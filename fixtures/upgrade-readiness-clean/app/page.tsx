import { theoFetch } from '@theokit/client'

export default function Page() {
  async function onSubmit() {
    // Clean usage — theoFetch attaches X-Theo-Action: '1' automatically.
    await theoFetch('/api/example', { method: 'POST', body: { hello: 'world' } })
  }

  return <button onClick={onSubmit}>Send</button>
}
