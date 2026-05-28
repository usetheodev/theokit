/**
 * dependency-cruiser config — TheoKit architecture rules v3.
 *
 * Encodes the 12-module DAG declared in `.claude/rules/architecture.md` v3
 * (ADR-0001 v3, accepted 2026-05-27).
 *
 * Run: pnpm check:deps
 * CI:  .github/workflows/architecture-guards.yml
 *
 * Invariants (NEVER NEGOTIATED):
 *   1. ZERO cycles (Acyclic Dependencies Principle — Robert Martin 1995, consensus)
 *   2. `core/` depends on NOTHING intra-monorepo (external npm packages allowed)
 *   3. Public API only flows through `<module>/index.ts` barrels.
 *      Exception: `core/contracts/<file>.ts` is the canonical home for shared
 *      client↔server types and may be imported directly by any module.
 *   4. Every declared edge MUST be enforced here (this file is the gate).
 *
 * Module map (12 modules; 19 directed module-pair edges):
 *   core           → (nothing intra-monorepo)
 *   config         → core
 *   cache          → core
 *   router         → core
 *   client         → core
 *   react-query    → client
 *   adapters       → core, router, services
 *   devtools       → core
 *   services       → (nothing intra-monorepo)
 *   server         → core, cache, config, devtools, services
 *   vite-plugin    → core, router, server, config, devtools, services
 *   cli            → core, vite-plugin, server, config, router, adapters, services
 */

/**
 * Helper: build a "<from> may only depend on these sinks" rule.
 * Forbidden = importing FROM `<from>` INTO any intra-src path NOT in `sinks`.
 */
function mayOnlyDependOn(name, fromPath, sinks) {
  // Build a regex that matches any intra-src path NOT in the allowed sinks.
  const allowed = [fromPath, ...sinks]
  // Allow imports into the module itself (intra-module) + any sink + node_modules (external).
  const allowedAlt = allowed.map((p) => p.replace(/^\^/, '').replace(/\/$/, '')).join('|')
  return {
    name,
    severity: 'error',
    comment:
      `ADR-0001 v3: ${name.replace('-may-only-depend-on-', ' may only depend on ').replace(/-/g, ', ')}. ` +
      'Update ADR-0001 v3 + this rule if the graph needs to change.',
    from: { path: fromPath },
    to: {
      path: '^packages/theo/src/',
      pathNot: `^(?:${allowedAlt})`,
    },
  }
}

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Cycles violate Acyclic Dependencies Principle (Martin 1995, consensus). ' +
        'Break by extracting shared types into core/contracts/ (the canonical home).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-depends-on-nothing',
      severity: 'error',
      comment:
        '`core/` is the foundation. Importing FROM core into any other intra-monorepo ' +
        'module is a layering violation. External npm packages are OK.',
      from: { path: '^packages/theo/src/core/' },
      to: {
        path: '^packages/theo/src/(?!core/)',
        pathNot: '^packages/theo/src/core/',
      },
    },

    // Per-module direction rules (one per module, 11 entries total — core/services
    // covered by their dedicated leaf rules above).
    mayOnlyDependOn('config-may-only-depend-on-core-services', '^packages/theo/src/config/', [
      'packages/theo/src/core/',
      'packages/theo/src/services/', // config/schema.ts composes services schema
    ]),
    mayOnlyDependOn('cache-may-only-depend-on-core', '^packages/theo/src/cache/', [
      'packages/theo/src/core/',
    ]),
    mayOnlyDependOn('router-may-only-depend-on-core', '^packages/theo/src/router/', [
      'packages/theo/src/core/',
    ]),
    mayOnlyDependOn('client-may-only-depend-on-core', '^packages/theo/src/client/', [
      'packages/theo/src/core/',
    ]),
    mayOnlyDependOn('react-query-may-only-depend-on-client', '^packages/theo/src/react-query/', [
      'packages/theo/src/client/',
      'packages/theo/src/core/',
    ]),
    mayOnlyDependOn(
      'adapters-may-only-depend-on-core-router-services',
      '^packages/theo/src/adapters/',
      [
        'packages/theo/src/core/',
        'packages/theo/src/router/',
        'packages/theo/src/services/',
        'packages/theo/src/config/', // adapters import TheoConfig type
      ],
    ),
    mayOnlyDependOn('devtools-may-only-depend-on-core', '^packages/theo/src/devtools/', [
      'packages/theo/src/core/',
    ]),
    // services/ is intentionally Ca=N Ce=0 — declared as leaf in ADR-0001 v3.
    mayOnlyDependOn('services-depends-on-nothing-intra', '^packages/theo/src/services/', []),
    mayOnlyDependOn(
      'server-may-only-depend-on-core-cache-config-devtools-services',
      '^packages/theo/src/server/',
      [
        'packages/theo/src/core/',
        'packages/theo/src/cache/',
        'packages/theo/src/config/',
        'packages/theo/src/devtools/',
        'packages/theo/src/services/',
      ],
    ),
    mayOnlyDependOn(
      'vite-plugin-may-only-depend-on-core-router-server-config-devtools-services',
      '^packages/theo/src/vite-plugin/',
      [
        'packages/theo/src/core/',
        'packages/theo/src/router/',
        'packages/theo/src/server/',
        'packages/theo/src/config/',
        'packages/theo/src/devtools/',
        'packages/theo/src/services/',
      ],
    ),
    mayOnlyDependOn(
      'cli-may-only-depend-on-core-vite-plugin-server-config-router-adapters-services',
      '^packages/theo/src/cli/',
      [
        'packages/theo/src/core/',
        'packages/theo/src/vite-plugin/',
        'packages/theo/src/server/',
        'packages/theo/src/config/',
        'packages/theo/src/router/',
        'packages/theo/src/adapters/',
        'packages/theo/src/services/',
      ],
    ),

    {
      name: 'no-orphans',
      severity: 'info',
      comment: 'Orphaned modules (no consumer) may be dead code.',
      from: {
        orphan: true,
        pathNot: [
          // Standard exceptions (dotfiles, configs, type-only, tests)
          '(^|/)(\\.[^/]+\\.(js|ts|json)$|tsconfig\\.json|index\\.ts|.*\\.d\\.ts$|.*\\.test\\.tsx?$|.*\\.test-d\\.tsx?$)',
          // Adapter entrypoints — consumed by deploy targets at build time, not by framework src
          '^packages/theo/src/adapters/(web|ws)-shim\\.ts$',
          '^packages/theo/src/server/body-parser-web\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: ['\\.test\\.tsx?$', '\\.test-d\\.tsx?$', '/dist/', '/__tests__/'],
    },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    progress: { type: 'none' },
    reporterOptions: {
      text: { highlightFocused: true },
      dot: { theme: { graph: { rankdir: 'LR' } } },
    },
  },
}
