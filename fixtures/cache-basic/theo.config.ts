export default {
  appDir: 'app',
  serverDir: 'server',
  port: 3000,
  cache: {
    enabled: true,
    storage: 'memory',
    maxEntries: 100,
    defaults: {
      maxAge: 1,
      cacheErrors: false,
    },
    routeRules: {
      '/api/static/**': { maxAge: 300, swr: 600 },
    },
  },
}
