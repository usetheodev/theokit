# Spike: `@usetheo/ui` Vite Plugin API Shape

**Date:** 2026-05-22 (proposed) / 2026-05-28 (accepted)
**Status:** **ACCEPTED** via [ADR 0018](../adr/0018-usetheo-ui-vite-plugin-contract-versionado.md) (theokit-side) + [ADR 0001 do theo-ui](../../../theo-ui/docs/adr/0001-vite-plugin-subpath-export-contract.md) (UI-side mirror).
**Blocks:** Phase 3 of `docs/plans/framework-zero-config-polish-plan.md` — UNBLOCKED.

## Goal

Resolve the API shape that TheoKit's vite-plugin auto-config (T3.2 `integrateUseTheoUI`) consumes. Without a stable target, T3.2 cannot be written without rework.

## Open Questions resolved here

- **Q3** (reference §10): What does `@usetheo/ui/vite-plugin` return?
- **Q4** (reference §10): Does `@usetheo/ui` ship pre-compiled CSS, Tailwind preset, or both?
- **Q-no-tailwind**: If `@usetheo/ui` is installed but `@tailwindcss/vite` is NOT, what does the framework do?

## API Shape

**Decision:** Default-export factory function.

```ts
// @usetheo/ui/vite-plugin
import type { Plugin } from 'vite'

export interface UseTheoUIPluginOptions {
  /** Disable Tailwind v4 plugin auto-chain. Use only if the consumer is wiring it themselves. Default: true */
  tailwind?: boolean
  /** Override content globs (e.g., to add consumer-side directories). Merged with library defaults. */
  contentExtra?: string[]
}

export default function useTheoUIVite(options?: UseTheoUIPluginOptions): Plugin
```

**Return value:** A SINGLE Vite Plugin object with `name: '@usetheo/ui/vite-plugin'`. The plugin internally:

1. Registers virtual `@usetheo/ui/preset` modules consumed via `import preset from '@usetheo/ui/preset'` in the consumer's `tailwind.config.ts` (if consumer has one) — present for the manual-override path (D3 in the main plan).
2. Adds Tailwind v4 `@source "node_modules/@usetheo/ui/dist/**/*.{js,mjs}"` directives via Vite plugin transform of CSS files.
3. Registers `@usetheo/ui/styles.css` as a virtual entry that imports the base reset + fonts.

**Why a single Plugin and not a Plugin[]:**
- Vite's plugin chain semantics are easier when a single integration owns its own ordering.
- Consumer-side: `plugins: [theokit(), useTheoUIVite()]` reads better than `plugins: [theokit(), ...useTheoUIVite()]`.
- TheoKit auto-config: returning `Plugin[]` from `config()` hook still works for a single plugin — `[tailwindcss(), useTheoUIVite()]` is the auto-chain output (NOT `[...useTheoUIVite()]`).

## Peer Dependencies

```jsonc
// @usetheo/ui package.json
{
  "peerDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0 || ^7.0.0"
  },
  "peerDependenciesMeta": {
    "@tailwindcss/vite": {
      "optional": true
    }
  }
}
```

`@tailwindcss/vite` is optional — if consumer disables Tailwind via `useTheoUIVite({ tailwind: false })`, OR if `@tailwindcss/vite` is not in the consumer's deps, the integration degrades gracefully:

- TheoKit's auto-config (`integrateUseTheoUI`) detects this combo and emits a clear warn pointing the user to `pnpm add -D @tailwindcss/vite`.
- The UI plugin itself runs in "css-only" mode — no Tailwind preprocessing, just the static `styles.css` virtual module.

## Preset Content Globs

The `@usetheo/ui/preset` (Tailwind v4 preset) ships with:

```ts
// @usetheo/ui/preset (when imported in consumer's tailwind.config.ts)
export default {
  content: [
    './node_modules/@usetheo/ui/dist/**/*.{js,mjs,cjs}',
    // Consumer adds their own app dirs on top
  ],
  theme: {
    extend: { /* TheoUI theme tokens (colors, fonts, spacing scale) */ }
  },
  plugins: [
    // Tailwind plugins for animations, container queries, etc.
  ]
}
```

**Resolution of Q4:** `@usetheo/ui` ships BOTH:
- (a) A Tailwind v4 preset (`@usetheo/ui/preset`) for consumers who want full Tailwind control.
- (b) A Vite plugin (`@usetheo/ui/vite-plugin`) that wires content globs + virtual modules WITHOUT consumer-side `tailwind.config.ts` — zero-config path.

The framework's auto-config (TheoKit T3.2) uses path (b). Consumers who add their own `tailwind.config.ts` get D3 deferral + can `import preset from '@usetheo/ui/preset'` themselves.

## No-Tailwind Behavior

When `@usetheo/ui` is detected but `@tailwindcss/vite` is NOT:

- TheoKit's `integrateUseTheoUI` returns `[]` (no plugins).
- Console warn (single line): `[theokit] @usetheo/ui detected but @tailwindcss/vite is not installed. Run \`pnpm add -D @tailwindcss/vite\` to enable styling.`
- The UI plugin itself (if consumer manually adds it) detects the same and falls back to css-only mode (ships static reset + fonts but no Tailwind utility classes).

## Acceptance Criteria for cross-repo UI release

Before Phase 3 of `framework-zero-config-polish-plan.md` can ship, `@usetheo/ui` must:

- [ ] Publish `./vite-plugin` subpath export with default-export factory returning `Plugin`.
- [ ] Publish `./preset` subpath export with Tailwind v4 preset object.
- [ ] Declare `@tailwindcss/vite ^4` as optional peer dep.
- [ ] Include `@source` directives via the Vite plugin for content discovery.
- [ ] Ship a static `@usetheo/ui/styles.css` for the no-Tailwind degraded path.

## Sign-off required

- [ ] paulo (UI repo maintainer) acknowledges this contract.
- [ ] UI repo opens its own implementation issue tracking the items above.

Until both checkboxes are checked, Phase 3 (T3.2–T3.5) remains BLOCKED. Phases 1, 2, 4 can ship independently.
