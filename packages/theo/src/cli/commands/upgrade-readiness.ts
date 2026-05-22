/* eslint-disable security/detect-non-literal-fs-filename --
 * CLI lint scanner. Reads user source files under `projectRoot` (CLI
 * argument resolved to absolute). Read-only; never writes. No HTTP input.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'

/**
 * T2.3 — Upgrade-readiness scanner for the 0.2 → 0.3 cutover.
 *
 * LINT-only. Reads user source, reports anticipated 0.3.0 violations with
 * file:line + suggested fix. NEVER writes user files (ADR D1).
 *
 * Three rules:
 *   1. csrf-missing-header   — raw fetch POST/PUT/PATCH/DELETE missing the
 *      X-Theo-Action: '1' header → 403 under strict CSRF.
 *   2. inline-script         — <script>...</script> in .html files without
 *      `src=` attribute → blocked under enforce CSP without unsafe-inline.
 *   3. dangerously-set-inline-script — React `dangerouslySetInnerHTML`
 *      payload that contains <script>.
 *
 * EC-7: occurrences inside line comments (// ...) or wrapped in quoted
 * strings are best-effort skipped. The scanner is not a parser — it
 * filters obvious false-positive lines before running the violation
 * regex.
 * EC-8: scanning a directory with no `app/` and no `server/` returns a
 * 'no-project-detected' report with exitCode 0 (no crash).
 */

export type ViolationRule =
  | 'csrf-missing-header'
  | 'inline-script'
  | 'dangerously-set-inline-script'
  | 'zero-config-tailwind-suggest'
  | 'handrolled-dotenv-suggest'

export interface Violation {
  file: string
  line: number
  rule: ViolationRule
  message: string
  fix: string
}

export type ReadinessStatus =
  | 'ready'
  | 'has-violations'
  | 'no-project-detected'
  | 'not-a-theokit-project'

export interface UpgradeReadinessReport {
  status: ReadinessStatus
  exitCode: 0 | 1
  violations: Violation[]
}

export interface ScanOptions {
  cwd: string
  /** When true, exitCode is forced to 0 even when violations exist. */
  allowWarnings?: boolean
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.theokit', '.cache'])
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const HTML_EXTS = new Set(['.html', '.htm'])

function walkFiles(dir: string, root: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = resolve(dir, name)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      walkFiles(full, root, out)
    } else if (s.isFile()) {
      const dot = name.lastIndexOf('.')
      if (dot < 0) continue
      const ext = name.slice(dot)
      if (SOURCE_EXTS.has(ext) || HTML_EXTS.has(ext)) out.push(full)
    }
  }
}

function isLikelyCommentOrString(rawLine: string, matchIndex: number): boolean {
  // Comment: line-comment marker (//) appears before the match position.
  const lineCommentIdx = rawLine.indexOf('//')
  if (lineCommentIdx !== -1 && lineCommentIdx < matchIndex) {
    // Make sure // is not inside a string (best-effort: count unescaped
    // quote chars before the //)
    const before = rawLine.slice(0, lineCommentIdx)
    const quoteCount = (before.match(/(?<!\\)["']/g) ?? []).length
    if (quoteCount % 2 === 0) return true
  }
  // String literal: scan quote characters around match. If the match is
  // surrounded by an odd number of unescaped quotes on either side, it
  // sits inside a string. Best-effort — does not parse template literals
  // or multiline strings.
  const before = rawLine.slice(0, matchIndex)
  const doubleQuotes = (before.match(/(?<!\\)"/g) ?? []).length
  const singleQuotes = (before.match(/(?<!\\)'/g) ?? []).length
  return doubleQuotes % 2 === 1 || singleQuotes % 2 === 1
}

// `fetch(` followed (within ~200 chars, same call site) by a method:
// 'POST' | 'PUT' | 'PATCH' | 'DELETE'. We scan per-line to keep regex
// state simple; multi-line fetch calls match on the line that carries
// the `method:` literal.
const METHOD_PATTERN = /method\s*:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/gi

function scanSourceFile(file: string, rel: string, content: string, out: Violation[]): void {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    METHOD_PATTERN.lastIndex = 0
    const match = METHOD_PATTERN.exec(line)
    if (!match) continue
    if (isLikelyCommentOrString(line, match.index)) continue

    // Look 8 lines back AND forward for the enclosing `fetch(` and for an
    // X-Theo-Action header in the same call-site block.
    const blockStart = Math.max(0, i - 8)
    const blockEnd = Math.min(lines.length - 1, i + 8)
    const block = lines.slice(blockStart, blockEnd + 1).join('\n')
    if (!/\bfetch\s*\(/.test(block)) continue
    if (/\btheoFetch\s*\(/.test(block)) continue
    if (/['"`]X-Theo-Action['"`]\s*:/i.test(block)) continue

    out.push({
      file: rel,
      line: i + 1,
      rule: 'csrf-missing-header',
      message:
        'fetch(' +
        match[1] +
        ') without X-Theo-Action header — will return 403 under 0.3.0 strict CSRF',
      fix: "Use theoFetch(path, { method, body }) OR add headers: { 'X-Theo-Action': '1' }",
    })
  }

  // dangerouslySetInnerHTML with <script> in the payload.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/dangerouslySetInnerHTML/i.test(line)) continue
    // The script may live on the same line or in __html on a following
    // line; check a small window.
    const window = lines.slice(i, Math.min(lines.length, i + 6)).join('\n')
    if (!/__html\s*:\s*['"`][^'"`]*<script\b/i.test(window)) continue
    out.push({
      file: rel,
      line: i + 1,
      rule: 'dangerously-set-inline-script',
      message:
        'dangerouslySetInnerHTML payload contains <script> — blocked under 0.3.0 enforce CSP',
      fix: 'Move the script into a real module loaded via <script src="...">, or thread ctx.nonce',
    })
  }
}

const INLINE_SCRIPT_PATTERN = /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/gi

function scanHtmlFile(file: string, rel: string, content: string, out: Violation[]): void {
  INLINE_SCRIPT_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE_SCRIPT_PATTERN.exec(content)) !== null) {
    // Compute 1-based line number from match index.
    const before = content.slice(0, match.index)
    const line = (before.match(/\n/g) ?? []).length + 1
    out.push({
      file: rel,
      line,
      rule: 'inline-script',
      message:
        'Inline <script> without src — blocked under 0.3.0 enforce CSP without unsafe-inline',
      fix: "Move into a real script file (e.g. /main.js) and load with <script src='/main.js'>, or thread ctx.nonce",
    })
  }
}

/**
 * T4.1 — Zero-config hint: consumer has @usetheo/ui in deps AND a manual
 * tailwind.config.* that does NOT import the @usetheo/ui preset. Suggest
 * extending via `import preset from '@usetheo/ui/preset'`.
 */
function scanZeroConfigTailwindHint(cwd: string, out: Violation[]): void {
  const pkgPath = resolve(cwd, 'package.json')
  if (!existsSync(pkgPath)) return
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as typeof pkg
  } catch {
    return
  }
  const hasUi =
    Boolean(pkg.dependencies?.['@usetheo/ui']) ||
    Boolean(pkg.devDependencies?.['@usetheo/ui'])
  if (!hasUi) return

  for (const ext of ['.ts', '.js', '.mjs', '.cjs']) {
    const cfgPath = resolve(cwd, `tailwind.config${ext}`)
    if (!existsSync(cfgPath)) continue
    let content: string
    try {
      content = readFileSync(cfgPath, 'utf8')
    } catch {
      continue
    }
    if (content.includes('@usetheo/ui/preset')) return // already using preset
    out.push({
      file: `tailwind.config${ext}`,
      line: 1,
      rule: 'zero-config-tailwind-suggest',
      message:
        '@usetheo/ui detected with a manual tailwind.config — extend with the UI preset to keep theme tokens in sync.',
      fix: "import preset from '@usetheo/ui/preset'; export default { presets: [preset], content: [...] }",
    })
    return
  }
}

/**
 * T4.1 — Zero-config hint: consumer has hand-rolled dotenv loading in
 * server/ (import 'dotenv/config', dotenv.config(), readFile('.env'), etc.).
 * Suggest the framework's loadEnv (auto-invoked by CLI commands; importable
 * from theokit/server for standalone scripts).
 */
function scanHandRolledDotenvHint(file: string, rel: string, content: string, out: Violation[]): void {
  // Only flag server/ files
  if (!rel.startsWith('server/')) return
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    // import 'dotenv/config' or import * as dotenv from 'dotenv'
    if (/from\s+['"]dotenv['"]/.test(line) || /import\s+['"]dotenv\/config['"]/.test(line)) {
      out.push({
        file: rel,
        line: i + 1,
        rule: 'handrolled-dotenv-suggest',
        message:
          'Manual dotenv import detected — TheoKit auto-loads .env in CLI commands. For standalone scripts, import { loadEnv } from "theokit/server".',
        fix: "Remove this import. CLI commands (dev/build/start) auto-load .env. For standalone scripts: import { loadEnv } from 'theokit/server'; loadEnv()",
      })
      return // one hint per file
    }
  }
}

/**
 * EC-3: a directory may have an `app/` directory (Next.js, Remix, etc.) but
 * not actually be a TheoKit project. Run our 3 rules against such a project
 * would generate many false positives. The strict guard checks for `theokit`
 * in dependencies OR devDependencies of the cwd's package.json. Returns
 * `null` when the project IS a TheoKit project, or a non-TheoKit report
 * otherwise.
 */
function detectNonTheokitProject(cwd: string): UpgradeReadinessReport | null {
  const pkgPath = resolve(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    // No package.json — let the existing app/server detection handle it.
    return null
  }
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as typeof pkg
  } catch {
    // Malformed package.json — treat as "not a TheoKit project we can verify".
    return { status: 'not-a-theokit-project', exitCode: 1, violations: [] }
  }
  const deps = pkg.dependencies ?? {}
  const devDeps = pkg.devDependencies ?? {}
  if (!Object.hasOwn(deps, 'theokit') && !Object.hasOwn(devDeps, 'theokit')) {
    return { status: 'not-a-theokit-project', exitCode: 1, violations: [] }
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/require-await -- async surface for future fs.promises migration
export async function scanUpgradeReadiness(options: ScanOptions): Promise<UpgradeReadinessReport> {
  const cwd = options.cwd
  const allowWarnings = options.allowWarnings === true

  const appDir = resolve(cwd, 'app')
  const serverDir = resolve(cwd, 'server')
  const publicDir = resolve(cwd, 'public')

  const hasApp = existsSync(appDir)
  const hasServer = existsSync(serverDir)

  if (!hasApp && !hasServer) {
    return { status: 'no-project-detected', exitCode: 0, violations: [] }
  }

  // EC-3: refuse to scan non-TheoKit projects (avoid FP avalanche).
  const nonTheokit = detectNonTheokitProject(cwd)
  if (nonTheokit) return nonTheokit

  const files: string[] = []
  if (hasApp) walkFiles(appDir, cwd, files)
  if (hasServer) walkFiles(serverDir, cwd, files)
  if (existsSync(publicDir)) walkFiles(publicDir, cwd, files)

  const violations: Violation[] = []
  for (const file of files) {
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const rel = relative(cwd, file).split(sep).join('/')
    const dot = file.lastIndexOf('.')
    const ext = dot >= 0 ? file.slice(dot) : ''
    if (HTML_EXTS.has(ext)) {
      scanHtmlFile(file, rel, content, violations)
    } else if (SOURCE_EXTS.has(ext)) {
      scanSourceFile(file, rel, content, violations)
      scanHandRolledDotenvHint(file, rel, content, violations)
    }
  }

  // T4.1 — Project-level hint (not per-file): does the consumer have a
  // manual tailwind.config without the UI preset?
  scanZeroConfigTailwindHint(cwd, violations)

  const hasHigh = violations.length > 0
  const status: ReadinessStatus = hasHigh ? 'has-violations' : 'ready'
  const exitCode: 0 | 1 = hasHigh && !allowWarnings ? 1 : 0
  return { status, exitCode, violations }
}

/**
 * CLI wrapper. Prints a human-readable or JSON report and exits with the
 * computed exit code. Imported lazily from `cli/index.ts`.
 */
export async function upgradeReadinessCommand(opts: {
  json?: boolean
  allowWarnings?: boolean
}): Promise<void> {
  const report = await scanUpgradeReadiness({
    cwd: process.cwd(),
    allowWarnings: opts.allowWarnings,
  })

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.exitCode)
  }

  console.log('')
  if (report.status === 'no-project-detected') {
    console.log("  · No theokit project detected here (no 'app/' or 'server/' dir).")
    console.log('')
    process.exit(report.exitCode)
  }
  if (report.status === 'not-a-theokit-project') {
    console.log('  ✗ Not a TheoKit project (theokit not in package.json).')
    console.log('    Run this command from a TheoKit project root.')
    console.log('')
    process.exit(report.exitCode)
  }
  if (report.violations.length === 0) {
    console.log('  ✓ Upgrade-readiness 0.3: no violations detected.')
    console.log('')
    process.exit(report.exitCode)
  }
  console.log(`  ✗ Upgrade-readiness 0.3: ${report.violations.length} violation(s)`)
  console.log('')
  for (const v of report.violations) {
    console.log(`  ${v.file}:${v.line}  [${v.rule}]`)
    console.log(`    ${v.message}`)
    console.log(`    fix: ${v.fix}`)
    console.log('')
  }
  process.exit(report.exitCode)
}
