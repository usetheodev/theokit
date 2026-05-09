import { defineWebSocket } from 'theo/server'

export default defineWebSocket({
  onOpen(ws) {
    ws.send('connected')
  },
  onMessage(ws, data) {
    ws.send(`echo: ${data}`)
  },
})
