# `@usetheo/ui` — ThemeSwitcher hydration mismatch on SSR

**Filed by:** TheoKit framework integration team
**Affected version:** `@usetheo/ui@0.6.2-next.0` (latest as of 2026-05-23) — likely all prior `0.x` versions with the same `useState(() => localStorage.getItem(...))` pattern
**Affected consumers:** any SSR'd app using `<ThemeSwitcher>` or `<TheoUIProvider>` from `@usetheo/ui` (verified in `theokit` template-default + full-stack-agent example)
**Severity:** HIGH — React hydration error in every SSR app the moment the user changes themes, full client re-render, console error in every page load

---

## Repro (60 seconds)

1. `npx create-theokit my-app` (any template using `<ThemeSwitcher>`)
2. `cd my-app && pnpm install && pnpm dev`
3. Open `http://localhost:3000/`
4. Click `ThemeSwitcher` → select any non-default theme (e.g., "Aurora Terminal")
5. Reload the page
6. **Observe in DevTools console:**

```
react-dom_client.js:3920 Uncaught Error: Hydration failed because the server rendered text didn't match the client.
[...]
+   Aurora Terminal       ← client (from localStorage)
-   Violet Forge          ← server (default)
```

7. React then says `this tree will be regenerated on the client` — visually the app recovers, but every reload re-throws + re-renders the entire React tree, defeating SSR.

---

## Root cause (from your built source, `dist/index.js`)

The `ThemeProvider` initializes state via `useState(() => fn())` where `fn()` reads `window.localStorage` synchronously. On SSR there's no `window`, so it falls back to `defaultTheme`. On client, the same `useState` initializer runs at hydration time with `window` available, so it reads the stored value. The two diverge → React hydration mismatch.

**Exact code (you wrote):**

```js
// node_modules/@usetheo/ui/dist/index.js
const [themeName, setThemeName] = useState(() => {
  if (typeof window === "undefined" || !storageKey) return defaultTheme;
  try {
    return window.localStorage.getItem(`${storageKey}:name`) ?? defaultTheme;
  } catch (err) {
    warnStorageFailure("read theme name", err);
    return defaultTheme;
  }
});
```

(Same pattern on lines 200 for `mode` and 210 for `density`.)

This is the canonical "client-only state initialized in `useState`" anti-pattern under SSR. React's [hydration mismatch docs](https://react.dev/link/hydration-mismatch) call this out explicitly.

The visible mismatch surfaces in 3 places:

1. The `aria-label` on the switcher button: `aria-label="Theme: Violet Forge"` (server) vs `aria-label="Theme: Aurora Terminal"` (client)
2. The visible label text: `<span>Violet Forge</span>` vs `<span>Aurora Terminal</span>`
3. The `sr-only` announcement: `<span aria-live="polite" class="sr-only">Theme: Violet Forge, mode: dark</span>` vs `Theme: Aurora Terminal, mode: dark`

All three are React text nodes that React compares byte-by-byte during hydration.

---

## Why "regenerated on the client" is NOT a fix

When React detects the mismatch, it discards the SSR'd DOM and re-mounts the entire client tree. Consequences:

- **First-paint flicker** — user sees the default theme for ~16ms then the stored theme.
- **CLS regression** — the discarded subtree may have a different size than the rebuilt one.
- **Defeats SSR's purpose** — the whole point of SSR'ing the `ThemeProvider` is to ship pre-styled HTML; if the entire tree re-renders client-side, we shipped HTML the browser threw away.
- **Noise in every console** — every TheoKit consumer ships an error log on every page load. We've had multiple developers ask "is this caching broken?" because the error mentions hydration — it masks real bugs.

---

## The fix — three options, ranked

### Option A (recommended): defer localStorage read to `useEffect`

Initialize state with the SSR-safe default. After hydration, read storage in `useEffect` and `setState`. This is the React-canonical pattern for client-only data in SSR'd components.

```ts
// ThemeProvider (rewrite of lines ~189–215 of dist/index.js)
const [themeName, setThemeName] = useState(defaultTheme)
const [mode, setModeState] = useState(defaultMode)
const [density, setDensityState] = useState(defaultDensity)
const [hydrated, setHydrated] = useState(false)

useEffect(() => {
  if (typeof window === 'undefined' || !storageKey) {
    setHydrated(true)
    return
  }
  try {
    const storedTheme = window.localStorage.getItem(`${storageKey}:name`)
    const storedMode = window.localStorage.getItem(`${storageKey}:mode`)
    const storedDensity = window.localStorage.getItem(`${storageKey}:density`)
    if (storedTheme) setThemeName(storedTheme)
    if (storedMode === 'dark' || storedMode === 'light') setModeState(storedMode)
    if (storedDensity === 'compact' || storedDensity === 'comfortable' || storedDensity === 'spacious') {
      setDensityState(storedDensity)
    }
  } catch (err) {
    warnStorageFailure('read theme + mode + density', err)
  }
  setHydrated(true)
}, [storageKey])
```

**Trade-off:** brief FOUC (flash of unstyled content) on the first paint after a stored-theme load. Mitigations:

- (a) Document a blocking inline script for consumers who care (Tailwind/Next.js pattern):
  ```html
  <!-- in <head>, before React mounts -->
  <script>
    try {
      const t = localStorage.getItem('theo-ui:name');
      if (t) document.documentElement.dataset.theoTheme = t;
    } catch {}
  </script>
  ```
- (b) Provide a `<ThemeScript />` component that renders this inline script via React — same as Next.js's `<Script>` strategy. Suppress that script's own hydration warning with `suppressHydrationWarning` on its parent.

**This is the right fix.** The FOUC trade-off is what every SSR'd theme provider in the ecosystem accepts (Vercel's `next-themes`, Mantine, Chakra v3 all do this).

### Option B: `suppressHydrationWarning` on the inner text nodes

Wrap the 3 mismatch surfaces with `<span suppressHydrationWarning>`:

```tsx
<button aria-label={`Theme: ${themeName}`}>
  <span suppressHydrationWarning>{themeName}</span>
</button>
<span aria-live="polite" className="sr-only" suppressHydrationWarning>
  Theme: {themeName}, mode: {mode}
</span>
```

**Trade-off:** `suppressHydrationWarning` only silences the warning — React still discards + re-renders the subtree. Visual flicker remains. The `aria-label` on the button can't easily be suppressed (it's an attribute, not a child text node).

**Not recommended** — papers over the issue without fixing the root cause.

### Option C: render `null` / placeholder until hydrated

```tsx
if (!hydrated) return <SkeletonSwitcher />
return <ActualSwitcher ... />
```

**Trade-off:** users see skeleton on first paint, then real switcher. Worse UX than Option A.

**Not recommended** — Option A delivers the same correctness with less visible churn.

---

## Acceptance criteria

- [ ] Zero hydration errors in console after `<ThemeProvider>` SSR with a non-default theme in localStorage (verifiable: `npm create theokit my-app && pnpm dev`, switch theme, reload, open DevTools console)
- [ ] `aria-label` on the switcher button is consistent between server-rendered HTML and client (no React replacement after hydration)
- [ ] `sr-only` announcement text matches between server + client on first paint
- [ ] If localStorage has no value, the SSR'd theme + the client-hydrated theme are identical (both `defaultTheme`)
- [ ] If localStorage has a value, the post-hydration `useEffect` applies it within one tick + no console error
- [ ] Add a `<ThemeScript>` helper component OR document the inline-script pattern for consumers who want zero-flicker theme load
- [ ] Add a Playwright (or unit) test that boots an SSR'd page with stored theme, reloads, asserts no `console.error` during hydration

## Test plan

```bash
# 1. Smoke test (manual)
npx create-theokit themetest && cd themetest
echo 'localStorage.setItem("theo-ui:name", "aurora-terminal")' > /tmp/seed.js
pnpm dev
# Open browser → run seed.js in console → reload → expect zero hydration error

# 2. Automated (your test harness)
# Add a Playwright spec:
#   - page.goto('/'); evaluate('localStorage.setItem("theo-ui:name", "aurora-terminal")');
#   - page.reload();
#   - expect(consoleErrors.filter(e => e.includes('Hydration'))).toHaveLength(0);

# 3. Type-tested ThemeProvider
#   - unit test: ThemeProvider with storageKey but no window → useState initial = defaultTheme (no localStorage call)
#   - unit test: ThemeProvider with stored value → useEffect fires + state updates
```

## Why this is a 0.6.x patch (not minor/major)

- Behavior change is INVISIBLE to users (still loads stored theme, just defers by 1 render tick)
- No public API surface changes
- No prop additions or removals
- Optional new export `<ThemeScript>` is purely additive
- Fixes a clear regression / SSR bug — semver patch is appropriate

## Related upstream patterns to mirror

- **`next-themes`** (Vercel): uses the inline-script + `useEffect` deferral pattern. ~5k LOC of polish on this exact problem; a good reference. https://github.com/pacocoursey/next-themes
- **Mantine `MantineProvider`** with `defaultColorScheme="auto"` + `<ColorSchemeScript />`: explicit dual-component pattern.
- **shadcn/ui** templates: copy `next-themes` directly + ship `<ThemeScript>` boilerplate in the scaffold.

## Repro environment

- `@usetheo/ui@0.6.2-next.0`
- `theokit@workspace:*` (current HEAD)
- React 19.0.0
- Node 22.x, pnpm 9.15
- Chromium (Edge + Firefox reproduce the same warning)
- Tested in: `examples/full-stack-agent/` (page `/cache`)

---

**Contact:** TheoKit framework team — paulo (via theokit repo issues).
**Cross-references:**
- TheoKit `examples/full-stack-agent/app/layout.tsx:48` uses `<ThemeSwitcher />` plainly.
- TheoKit `packages/create-theo/templates/default/` ships `<ThemeSwitcher>` by default.
- The same anti-pattern exists for `mode` (line 200) and `density` (line 210) — fixing all three together is one PR.
