import { defineConfig } from 'theokit'

export default defineConfig({
  // Devtools auto-injects in dev. Uncomment any of these to customize:
  // devtools: false,                                // disable entirely
  // devtools: { position: 'bottom-left' },          // start in a specific corner
  // devtools: { theme: 'dark' },                    // force theme
  // devtools: { position: 'top-right', theme: 'dark' },
  // 0.3.0 cutover defaults: CSRF strict + CSP enforce.
  // Demo intentionally keeps strict so you can SEE a csrf.warn fire
  // when the "raw fetch (no CSRF header)" button is clicked.
})
