import { defineTheoIntegration } from 'theokit/vite-plugin'

/**
 * Banner integration — adds a virtual module that exports a build-time
 * computed string.
 *
 * The `addVirtualModule` callback MUST use the prefix
 * `virtual:integration:<name>/...` — EC-6 from the cross-domain-uplift plan.
 * Anything else throws `IntegrationVirtualModulePrefixError` at config:setup.
 */
export default defineTheoIntegration({
  name: 'banner',
  hooks: {
    'theo:config:setup': (ctx) => {
      ctx.addVirtualModule?.(
        'virtual:integration:banner/text',
        `export default ${JSON.stringify('hello from the banner integration (built at ' + new Date().toISOString() + ')')}`,
      )
    },
  },
})
