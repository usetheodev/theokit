import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

/**
 * Recursive-descent arithmetic parser. MUST NOT use `eval` / `Function` / `vm`
 * (EC-2 from edge-case review). A unit test source-greps this file for those
 * patterns to enforce the constraint across refactors.
 *
 * Grammar (precedence: `+ -` < `* /` < unary `-` < parens):
 *
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := '-' factor | '(' expr ')' | NUMBER
 *
 * Whitespace ignored between tokens. NUMBER matches /\d+(\.\d+)?/.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < input.length) {
    const ch = input.charAt(i)
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push(ch)
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let n = ''
      while (i < input.length && /[0-9.]/.test(input.charAt(i))) {
        n += input.charAt(i)
        i++
      }
      tokens.push(n)
      continue
    }
    throw new Error(`unexpected character '${ch}' at position ${i.toString()}`)
  }
  return tokens
}

interface ParseState {
  tokens: string[]
  pos: number
}

function parseFactor(s: ParseState): number {
  const tok = s.tokens[s.pos]
  if (tok === undefined) throw new Error('unexpected end of expression')
  if (tok === '-') {
    s.pos++
    return -parseFactor(s)
  }
  if (tok === '(') {
    s.pos++
    const v = parseExpr(s)
    if (s.tokens[s.pos] !== ')') throw new Error("missing ')'")
    s.pos++
    return v
  }
  const n = Number(tok)
  if (Number.isNaN(n)) throw new Error(`invalid number '${tok}'`)
  s.pos++
  return n
}

function parseTerm(s: ParseState): number {
  let v = parseFactor(s)
  while (s.tokens[s.pos] === '*' || s.tokens[s.pos] === '/') {
    const op = s.tokens[s.pos]!
    s.pos++
    const r = parseFactor(s)
    v = op === '*' ? v * r : v / r
  }
  return v
}

function parseExpr(s: ParseState): number {
  let v = parseTerm(s)
  while (s.tokens[s.pos] === '+' || s.tokens[s.pos] === '-') {
    const op = s.tokens[s.pos]!
    s.pos++
    const r = parseTerm(s)
    v = op === '+' ? v + r : v - r
  }
  return v
}

export function evaluate(expression: string): number {
  // Belt-and-suspenders allowlist BEFORE the parser runs — any char outside
  // the arithmetic alphabet is a parse error.
  if (!/^[\d\s+\-*/().]+$/.test(expression)) {
    throw new Error('invalid characters in expression (only digits, +-*/(). allowed)')
  }
  const s: ParseState = { tokens: tokenize(expression), pos: 0 }
  const result = parseExpr(s)
  if (s.pos !== s.tokens.length) {
    throw new Error(`trailing tokens after position ${s.pos.toString()}`)
  }
  // EC-1: refuse Infinity / NaN — JSON.stringify(NaN) === 'null' which would
  // silently confuse the LLM.
  if (!Number.isFinite(result)) {
    throw new Error('result not finite (overflow or division by zero)')
  }
  return result
}

export const calculator = defineAgentTool({
  name: 'calculator',
  description:
    'Evaluate an arithmetic expression. Supports + - * / ( ) and decimals. ' +
    'Rejects division by zero, overflow, and any non-arithmetic input.',
  inputSchema: z.object({ expression: z.string().min(1) }),
  handler: ({ expression }) => String(evaluate(expression)),
})
