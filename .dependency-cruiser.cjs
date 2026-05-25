/**
 * dependency-cruiser config — TheoKit architecture rules v2.
 *
 * Encodes the 11-module DAG declared in `.claude/rules/architecture.md` v2
 * (ADR-0001, accepted 2026-05-23).
 *
 * Run: pnpm check:deps
 * CI:  .github/workflows/architecture-guards.yml
 *
 * Invariants (NEVER NEGOTIATED):
 *   1. ZERO cycles (Acyclic Dependencies Principle — Robert Martin 1995)
 *   2. `core/` depends on NOTHING outside itself
 *
 * Module map (16 deliberate edges):
 *   core           → (nothing)
 *   config         → core
 *   cache          → core
 *   router         → core
 *   client         → core
 *   react-query    → client
 *   adapters       → core, router
 *   devtools       → (leaf — dev-only)
 *   server         → core, cache, config, devtools
 *   vite-plugin    → core, router, server, config, devtools
 *   cli            → core, vite-plugin, server, config, router, adapters
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Cycles violate Acyclic Dependencies Principle (Martin 1995). Break by ' +
        'extracting shared types into core/_internal/types.ts or a leaf module.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-depends-on-nothing',
      severity: 'error',
      comment:
        '`core/` is the foundation. Importing FROM core into anything else is fine; ' +
        'importing INTO core from any other module is a layering violation.',
      from: { path: '^packages/theo/src/core/' },
      to: {
        path: '^packages/theo/src/(?!core/)',
        pathNot: '^packages/theo/src/core/',
      },
    },
    // NOTE: cross-module `_internal/` reach was considered as a rule but
    // dep-cruiser config can't express "module X internal reaching only if
    // caller is in same module" without functions (not serializable). Reviewed
    // in code review instead. Intra-module _internal/ imports (e.g., server/*
    // → server/_internal/*) are correct and the dominant pattern today.
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
