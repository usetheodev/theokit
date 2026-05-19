/**
 * Goober-based CSS factory scoped to a Shadow DOM target.
 *
 * Devtools UI lives inside an open shadow root. Global stylesheets
 * (Tailwind, user app CSS) do not reach into shadow roots; goober's
 * `css.bind({ target })` injects styles INSIDE the shadow root so
 * our UI renders correctly while the user's app stays untouched.
 *
 * NEVER use dangerouslySetInnerHTML in any devtools component — see plan EC-20.
 */
import { css as gooberCss, setup as gooberSetup } from 'goober'

let _initialized: WeakSet<ShadowRoot> | null = null

function getInitialized(): WeakSet<ShadowRoot> {
  if (!_initialized) _initialized = new WeakSet()
  return _initialized
}

export interface StyleFactory {
  css: typeof gooberCss
}

/**
 * Create a goober css tag bound to a specific Shadow DOM target.
 *
 * Subsequent calls with the same shadowRoot return cached factory.
 * EC-23 / EC-25 unrelated; this just ensures we don't re-bind goober per render.
 */
export function createStyles(shadowRoot: ShadowRoot): StyleFactory {
  const initialized = getInitialized()
  if (!initialized.has(shadowRoot)) {
    // goober's setup() registers the global `css` tag's target.
    // We pass a no-op pragma since we use bind() per shadow root.
    gooberSetup(null as never)
    initialized.add(shadowRoot)
  }

  // goober.css.bind({ target }) returns a new tagged template fn whose
  // emitted styles land inside shadowRoot, not document.head.
  const bound = (gooberCss as unknown as { bind: (ctx: { target: ShadowRoot }) => typeof gooberCss }).bind({
    target: shadowRoot,
  })

  return { css: bound }
}
