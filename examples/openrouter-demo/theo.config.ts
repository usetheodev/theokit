import { defineConfig } from 'theokit'

/**
 * Dev → CSP off (Vite React-Refresh inline preamble lacks a nonce).
 * Production → enforce strict CSP (matches 0.3.0 default).
 */
const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  ssr: true,
  security: {
    headers: {
      cspMode: isProduction ? 'enforce' : 'off',
    },
  },
})
