import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Every type named in an exported signature must itself be exportable. Six times it was not.
 *
 * `bridge/index.ts` enumerates the shape four times by issue number — #663, #668, #675, #686 — and
 * B-004 was the fifth. Each was found by INSTALLING the published package, because the source is
 * correct every time: the type IS exported from its own module, and only the barrel omits it. The
 * guard that followed reads the emitted barrel, which was the right move, and it is a hand-written
 * LIST — so it catches the entries somebody remembered to add. B-004 was added to it after a review
 * found the miss, which is precisely what the list existed to prevent.
 *
 * This one derives the requirement instead of listing it. Measured when written: `PreToolCallContext`,
 * `PreToolCallDecision`, `PostToolCallContext`, `SessionLifecycleContext`, `SystemPromptResolver`,
 * `SystemPromptContext`, `MemorySettings`, `InlineSkill`, `SkillsSettings`, `PluginsSettings` and
 * `BudgetTracker` each appeared in an exported signature and crossed zero barrels.
 *
 * ## What it checks, and what it cannot
 *
 * The emitted `.d.ts` is a rollup: a type referenced by an exported declaration is INLINED into the
 * file as a local declaration. So "declared here and not exported" is exactly the failure — a
 * consumer can see the shape in the file and cannot import the name.
 *
 * Two ways a name reaches the barrel and stays unreachable: DECLARED locally without `export`, and
 * IMPORTED from `@theokit/sdk` or a sibling chunk without being re-exported. The second is the form
 * the real defect takes — the rollup writes
 * `import { PluginsSettings, BudgetTracker, InlineSkill } from '@theokit/sdk'` and uses them in
 * signatures, so a consumer reads the shape and can only name it by importing `@theokit/sdk`
 * directly.
 *
 * It cannot see a type that never reaches this file at all — one carried inside another chunk's
 * interface never appears here — and it does not judge whether a type SHOULD be public. It answers
 * one question: of the names this barrel already mentions, which can a consumer not import?
 */
const DIST_DIR = join(import.meta.dirname, '..', '..', 'dist')
const BARREL = join(DIST_DIR, 'index.d.ts')

/** Names that are structural to a `.d.ts` and are never a consumer-facing type. */
const NOT_A_TYPE = new Set(['default', 'export', 'import'])

interface BarrelSurface {
  /** Declared in the rollup itself. */
  readonly declared: Map<string, ts.Node>
  /** Pulled in from another module — `@theokit/sdk`, or a sibling chunk. */
  readonly imported: Set<string>
  readonly exported: Set<string>
  readonly referencedByExports: Set<string>
}

function readBarrel(file: ts.SourceFile): BarrelSurface {
  const declared = new Map<string, ts.Node>()
  const imported = new Set<string>()
  const exported = new Set<string>()
  const referencedByExports = new Set<string>()

  const hasExportModifier = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

  const collectRefs = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      referencedByExports.add(node.typeName.text)
    }
    // A heritage clause (`extends X`) is an expression, not a type reference.
    if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression)) {
      referencedByExports.add(node.expression.text)
    }
    ts.forEachChild(node, collectRefs)
  }

  // PASS ONE — what this file declares, imports, and exports.
  //
  // Two passes and not one, and the reason is why the first version of this guard was green over
  // nothing. A rollup does NOT put `export` on its declarations: it emits them bare and lists every
  // public name in one `export { … }` clause at the END of the file. A single forward pass keyed on
  // the `export` modifier therefore visited zero exported declarations, collected zero references,
  // and reported no problem — while `index.d.ts` line 1 imported `PluginsSettings`, line 359 used it
  // in a signature, and the clause at line 1445 did not carry it.
  const declare = (node: ts.Node): void => {
    if (
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node)
    ) {
      const name = node.name?.text
      if (name !== undefined) {
        declared.set(name, node)
        if (hasExportModifier(node)) exported.add(name)
      }
    }
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) exported.add(d.name.text)
      }
    }
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings !== undefined) {
      const bindings = node.importClause.namedBindings
      if (ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) imported.add(el.name.text)
      }
    }
    if (ts.isExportDeclaration(node) && node.exportClause !== undefined) {
      if (ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) exported.add(el.name.text)
      }
    }
    ts.forEachChild(node, declare)
  }
  declare(file)

  // PASS TWO — references, now that "exported" is known for the whole file.
  for (const [name, node] of declared) {
    if (exported.has(name)) collectRefs(node)
  }

  return { declared, imported, exported, referencedByExports }
}

/**
 * A barrel a consumer can write in an import specifier, as opposed to an internal chunk.
 *
 * The rollup names its internal chunks with a content hash (`agent-compiler-BztdbNPn.d.ts`); nothing
 * can import those by path, so what they export is not reachable and what they import IS a finding.
 */
function isPublicBarrel(file: string): boolean {
  return file.endsWith('.d.ts') && !/-[A-Za-z0-9_-]{8,}\.d\.ts$/.test(file)
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
}

/** Every name the root barrel makes importable, including what it re-exports from a chunk. */
function exportedNamesOf(source: ts.SourceFile): Set<string> {
  return readBarrel(source).exported
}

describe('every type an exported signature names crosses the barrel', () => {
  it('has a built barrel to read', () => {
    // Reading the BUILT declaration is the point: `export type` inside a module satisfies the
    // compiler, the unit tests and the reviewer; only the emitted barrel says what a consumer can
    // reach. A missing build must fail loudly rather than let this suite pass over nothing — a
    // filter that matches no files reports the same green as one that found no problems.
    expect(existsSync(BARREL), `${BARREL} is missing — build @theokit/agents first`).toBe(true)
  })

  it('names nothing a consumer cannot import', () => {
    // The ROOT barrel is what a consumer imports from; the signatures live in the CHUNKS it
    // re-exports. Reading only the root was the first attempt and it found nothing — the defect is
    // one file deeper, where `bridge-entry-*.d.ts` imports `PluginsSettings` from `@theokit/sdk`,
    // names it in an exported signature, and nothing re-exports it upward.
    // Reachable = the union of every barrel a consumer can IMPORT FROM, not just the root.
    // `@theokit/agents/auth` and `@theokit/agents/client-react` are real entry points, so a type
    // exported from `auth.d.ts` is nameable even though the root never mentions it. The hashed files
    // (`agent-compiler-BztdbNPn.d.ts`) are internal chunks — no consumer can write that specifier,
    // so what they export is not reachable and what they import is still a finding.
    const reachable = new Set<string>()
    for (const file of readdirSync(DIST_DIR).filter(isPublicBarrel)) {
      for (const name of exportedNamesOf(parse(join(DIST_DIR, file)))) reachable.add(name)
    }

    // The probe must be seen to work: a barrel that parsed to nothing would pass while proving
    // nothing at all.
    expect(
      reachable.size,
      'the barrels parsed to zero exports — the probe is broken',
    ).toBeGreaterThan(50)

    const unreachable = new Map<string, string>()
    for (const file of readdirSync(DIST_DIR).filter((f) => f.endsWith('.d.ts'))) {
      const source = parse(join(DIST_DIR, file))
      const { imported, referencedByExports } = readBarrel(source)
      for (const name of referencedByExports) {
        if (NOT_A_TYPE.has(name)) continue
        // Only names this chunk PULLED IN from elsewhere. A type the chunk declares itself is the
        // chunk's business; a type it imported and used in a public signature is a name the
        // consumer must be able to write, and can only reach through the root.
        if (!imported.has(name)) continue
        if (reachable.has(name)) continue
        if (!unreachable.has(name)) unreachable.set(name, file)
      }
    }

    expect(
      [...unreachable.keys()].sort((a, b) => a.localeCompare(b)),
      'these types appear in an exported signature and a consumer cannot name them — the shape ' +
        'bridge/index.ts enumerates five times by issue number',
    ).toEqual([])
  })
})
