import { describe, expect, it } from 'vitest'

import { assertCodePlugins } from '../../src/bridge/code-plugins.js'

/**
 * `.plugins([{ type: 'local', path: './p' }])` typechecked against `readonly unknown[]` and did
 * nothing.
 *
 * This layer's `plugins` are CODE objects — `{ name, register }` — registered with the SDK's
 * lifecycle-hook seam. The Claude Code format's are filesystem BUNDLES, declared by path or by a
 * marketplace entry. The word is the same in both vocabularies and the shapes are not, so a consumer
 * who read the other product's documentation passed the path form, the compiler accepted it because
 * the parameter was `unknown[]`, and the agent ran with the plugin absent.
 *
 * ## What is actually implemented, measured rather than assumed
 *
 * The item said the plugin format is "not implemented on either side". A bundle DIRECTORY is
 * discovered — `pluginBundleDirs` reads `.claude/plugins/*` and `.theokit/plugins/*` — and its
 * `skills/` and `agents/` subdirectories ARE loaded. What is missing is the MANIFEST
 * (`.claude-plugin/plugin.json`), marketplaces, and every other contribution the format defines:
 * hooks, MCP servers, output styles, LSP servers.
 *
 * So a path-shaped entry is not refused because bundles are unsupported. It is refused because
 * THIS parameter is not how a bundle is declared — dropping one in a directory is — and silently
 * accepting the wrong shape is what made the gap invisible.
 */
describe('a path-shaped plugin entry is refused rather than ignored', () => {
  it('refuses the documented local form', () => {
    expect(
      () => assertCodePlugins([{ type: 'local', path: './p' }]),
      'the entry typechecked, did nothing, and the agent ran with the plugin absent',
    ).toThrow(/plugins\(\)/)
  })

  it('names the directory that does load a bundle', () => {
    // A refusal that does not say where the capability lives sends the reader to the changelog. The
    // bundle path is discovered; the parameter is simply not the door.
    expect(() => assertCodePlugins([{ type: 'local', path: './p' }])).toThrow(/plugins\//)
  })

  it('accepts a code plugin', () => {
    // The control. A guard that refused everything would satisfy both tests above and remove the
    // feature this parameter exists for.
    expect(() => assertCodePlugins([{ name: 'p', register: () => {} }])).not.toThrow()
  })

  it('accepts an empty list', () => {
    // The second control: declaring no plugins is not an error, and a guard that treated it as one
    // would fire on every agent that passes a computed array.
    expect(() => assertCodePlugins([])).not.toThrow()
  })

  it('recognises a marketplace entry AS a bundle, not merely as wrong', () => {
    // Both refusals contain "plugins()", so asserting that alone passes whether or not the entry was
    // recognised — measured, the mutation that dropped `marketplace` from the bundle keys survived
    // until this assertion changed. What must hold is that the reader is told where bundles LIVE,
    // rather than only that this object is not a code plugin.
    expect(() => assertCodePlugins([{ type: 'marketplace', name: 'x@y' }])).toThrow(/plugins\//)
  })

  it('tells a plain wrong value from a bundle reference', () => {
    // The control on the other side. A string is not a bundle, and pointing its author at a
    // `plugins/` directory would send them somewhere that cannot help.
    expect(() => assertCodePlugins(['nope'])).toThrow(/received string/)
  })
})
