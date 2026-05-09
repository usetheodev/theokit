import { defineWebSocket } from 'theo/server'

export default defineWebSocket({
  onMessage(ws, data) {
    ws.send(`notification: ${data}`)
  },
})
