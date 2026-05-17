import { defineConfig } from 'theokit'
import { requestIdEchoPlugin } from './plugins/request-id-echo.js'

export default defineConfig({
  appDir: 'app',
  serverDir: 'server',
  port: 3000,
  // Plugin entries are typed as TheoPlugin; the schema accepts unknown[]
  // and validates structure at runtime via createPluginRunnerFromConfig.
  plugins: [requestIdEchoPlugin],
})
