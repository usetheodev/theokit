import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * T3.1 — auto-tests for the recipes documented in
 * `docs/migration/0.2-to-0.3.md`. If the framework changes the warn-event
 * payload shape, these tests fail and the migration guide gets updated.
 *
 * EC-6: the test uses the Node-only recipe (Variant B in the guide) so it
 * runs on Windows / Alpine / minimal containers without jq.
 *
 * The fixture at docs/migration/fixtures/0.2-to-0.3-warn-log.jsonl has:
 *   - 2× /api/chat
 *   - 1× /api/checkout
 *   - 1× /api/upload
 *   - 1× /api/profile
 * Expected unique paths (sorted): /api/chat, /api/checkout, /api/profile, /api/upload
 * Expected total events: 5
 */

const ROOT = resolve(__dirname, '../..')
const FIXTURE = resolve(ROOT, 'docs/migration/fixtures/0.2-to-0.3-warn-log.jsonl')
const GUIDE = resolve(ROOT, 'docs/migration/0.2-to-0.3.md')

describe('Migration guide 0.2 → 0.3 — file exists + cross-referenced', () => {
  it('Given the guide path, Then the file exists', () => {
    expect(existsSync(GUIDE)).toBe(true)
  })

  it('Given the guide, Then it links to theokit check --upgrade-readiness', () => {
    const content = readFileSync(GUIDE, 'utf8')
    expect(content).toContain('theokit check --upgrade-readiness 0.3')
  })

  it('Given the guide, Then it documents the @next dist-tag install path', () => {
    const content = readFileSync(GUIDE, 'utf8')
    expect(content).toContain('npm install theokit@next')
  })
})

describe('Migration guide 0.2 → 0.3 — recipes (EC-6 Node-only)', () => {
  it('Given the fixture, When the documented Node recipe runs, Then unique paths are extracted', () => {
    // Mirrors EXACTLY the recipe documented in the guide (Variant B).
    const script = `process.stdin.on('data',d=>d.toString().split('\\n').filter(Boolean).forEach(l=>{try{console.log(JSON.parse(l).path)}catch{}}))`
    // eslint-disable-next-line sonarjs/os-command -- test pipes a constant Node script against a controlled fixture path
    const out = execSync(`node -e "${script}" < "${FIXTURE}" | sort -u`, {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
    expect(out).toEqual(['/api/chat', '/api/checkout', '/api/profile', '/api/upload'])
  })

  it('Given the fixture, When counting total events with Node, Then count is 5', () => {
    const script = `let n=0;process.stdin.on('data',d=>n+=d.toString().split('\\n').filter(Boolean).length);process.stdin.on('end',()=>console.log(n))`
    // eslint-disable-next-line sonarjs/os-command -- test pipes a constant Node script against a controlled fixture path
    const out = execSync(`node -e "${script}" < "${FIXTURE}"`, {
      encoding: 'utf8',
    }).trim()
    expect(out).toBe('5')
  })

  it('Given a fixture with blank lines, When recipe runs, Then output is unaffected (EC: log artifacts)', () => {
    const content = readFileSync(FIXTURE, 'utf8')
    const withBlanks = content
      .split('\n')
      .flatMap((line) => [line, ''])
      .join('\n')
    const tmpPath = resolve(__dirname, `../../tmp-warn-with-blanks-${String(Date.now())}.jsonl`)
    writeFileSync(tmpPath, withBlanks)
    try {
      // eslint-disable-next-line sonarjs/os-command -- test pipes a constant Node script against a controlled fixture path
      const out = execSync(
        `node -e "process.stdin.on('data',d=>d.toString().split('\\\\n').filter(Boolean).forEach(l=>{try{console.log(JSON.parse(l).path)}catch{}}))" < "${tmpPath}" | sort -u`,
        { encoding: 'utf8' },
      )
        .trim()
        .split('\n')
      expect(out).toEqual(['/api/chat', '/api/checkout', '/api/profile', '/api/upload'])
    } finally {
      unlinkSync(tmpPath)
    }
  })

  it('Given a fixture with malformed JSON lines, When recipe runs, Then valid lines still produce output (error scenario)', () => {
    const tmpPath = resolve(__dirname, `../../tmp-warn-with-bad-${String(Date.now())}.jsonl`)
    const content =
      readFileSync(FIXTURE, 'utf8') + '{ this is not json\n' + readFileSync(FIXTURE, 'utf8')
    writeFileSync(tmpPath, content)
    try {
      // eslint-disable-next-line sonarjs/os-command -- test pipes a constant Node script against a controlled fixture path
      const out = execSync(
        `node -e "process.stdin.on('data',d=>d.toString().split('\\\\n').filter(Boolean).forEach(l=>{try{console.log(JSON.parse(l).path)}catch{}}))" < "${tmpPath}" | sort -u`,
        { encoding: 'utf8' },
      )
        .trim()
        .split('\n')
      // Bad lines are silently skipped (the recipe's try/catch swallows them).
      expect(out).toEqual(['/api/chat', '/api/checkout', '/api/profile', '/api/upload'])
    } finally {
      unlinkSync(tmpPath)
    }
  })
})
