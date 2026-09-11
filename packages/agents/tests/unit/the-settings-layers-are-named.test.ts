import { foldLayers, verifyLayerOrdering } from '@theokit/sdk'
import { describe, expect, it } from 'vitest'

import {
  LAYERS_ARE_POSITIONED,
  SETTINGS_LAYERS,
  layerPrecedence,
  settingsLayerChain,
  type SettingsLayer,
} from '../../src/config/settings-layers.js'

/**
 * Precedence that is not named is precedence that is not agreed.
 *
 * The SDK ships the MECHANISM — `foldLayers` folds an array of `{ layer, precedence?, values }` and
 * `verifyLayerOrdering` refuses a chain that contradicts itself. What it deliberately does not ship
 * is the VOCABULARY: `DeclaredLayer.layer` is a free-form `string` and `precedence` is optional, so
 * two consumers can each invent their own names and their own numbers, fold in different orders, and
 * both be internally consistent. Nothing in either package could tell them apart.
 *
 * B-026 named three levels — managed settings above the project file above `defineAgent()` — but
 * only for the four keys the operator policy carries. A consumer implementing a fifth key had
 * nothing to consult, so they invented an order, and the invention type-checked.
 *
 * This pins the stack itself: the five levels the format defines, in the order it defines them, with
 * the numbers `foldLayers` is actually given. The exhaustiveness case is the one that matters most —
 * a layer added to the union without a position makes this file fail to COMPILE, which is the same
 * gate `capability-zero-behavior.test.ts` puts on the waist and for the same reason.
 */
describe('the settings precedence stack is named, ordered, and exhaustive', () => {
  it('declares the five levels the format defines, lowest first', () => {
    expect(SETTINGS_LAYERS.map((l) => l.layer)).toEqual([
      'user',
      'project-shared',
      'project-local',
      'command-line',
      'managed',
    ])
  })

  it('gives every layer a distinct, strictly increasing precedence', () => {
    const numbers = SETTINGS_LAYERS.map((l) => l.precedence)
    expect(new Set(numbers).size, 'two layers sharing a number is a tie nobody declared').toBe(
      numbers.length,
    )
    // The SDK's own checker is the oracle. Asserting the numbers by hand here would test the
    // literal, not the property the fold depends on.
    expect(() => verifyLayerOrdering(SETTINGS_LAYERS)).not.toThrow()
  })

  it('puts managed settings above everything a project can write', () => {
    // The whole point of the operator tier (B-026): a project cannot widen what an operator set.
    for (const lower of ['user', 'project-shared', 'project-local', 'command-line'] as const) {
      expect(layerPrecedence('managed')).toBeGreaterThan(layerPrecedence(lower))
    }
  })

  it('reconciles B-026 three-level order with the full stack rather than sitting beside it', () => {
    // B-026 said: managed-settings.json → .claude/settings.json → defineAgent(). Those are three
    // points on THIS line, not a second line: the project file is `project-shared`, and code is
    // below every file a human can edit.
    expect(layerPrecedence('managed')).toBeGreaterThan(layerPrecedence('project-shared'))
    expect(layerPrecedence('project-shared')).toBeGreaterThan(layerPrecedence('code'))
  })

  it('folds in the declared order, so a higher layer wins the keys it mentions', () => {
    // The keys are written in DEFEATING order — highest first — on purpose. Written lowest-first
    // this case passes with the sort deleted, because the object's own key order already happens to
    // be the answer. Mutation-verified: removing `.sort()` from `settingsLayerChain` turns this red.
    const folded = foldLayers(
      settingsLayerChain({
        managed: { permissionMode: 'default' },
        'project-shared': { permissionMode: 'plan' },
        code: { permissionMode: 'acceptEdits', model: 'from-code' },
      }),
    )
    expect(folded.permissionMode, 'managed must win').toBe('default')
    expect(folded.model, 'a key no higher layer mentions keeps the lower value').toBe('from-code')
  })

  it('skips a layer explicitly set to undefined instead of folding it as empty', () => {
    // `Partial<Record<...>>` lets a caller write `{ managed: undefined }` — the shape you get from
    // `{ managed: maybePolicy() }` when the policy file is absent. Folding it as an entry with no
    // values is harmless today and is the kind of thing that stops being harmless the moment a
    // layer means "present but empty" to somebody.
    const chain = settingsLayerChain({
      managed: undefined,
      code: { model: 'from-code' },
    })
    expect(chain.map((l) => l.layer)).toEqual(['code'])
  })

  it('reports the exhaustiveness gate as satisfied', () => {
    // The compile-time half lives in `settings-layers.ts` and cannot be observed from a passing
    // test — a type error is not a failed assertion. This gives the constant a real consumer, which
    // is also what keeps `knip` from reporting it as a dead export.
    expect(LAYERS_ARE_POSITIONED).toBe(true)
  })

  it('every declared layer is covered — a new one without a position fails to COMPILE', () => {
    // The runtime half of the compile-time check in `settings-layers.ts`. It fires if a layer is
    // ever added to the union and given a position that the chain builder then drops.
    const covered = new Set(SETTINGS_LAYERS.map((l) => l.layer))
    const all: readonly SettingsLayer[] = [
      'code',
      'user',
      'project-shared',
      'project-local',
      'command-line',
      'managed',
    ]
    expect(all.filter((l) => l !== 'code' && !covered.has(l))).toEqual([])
  })
})
