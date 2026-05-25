import { z } from 'zod'
import { defineAgentTool } from 'theokit/server'

/**
 * Recursive-descent arithmetic parser. MUST NOT use `eval` / `Function` / `vm`
 * — passing untrusted LLM-generated expressions through any of those is a
 * sandbox escape. This implementation is safe by construction (zero eval).
 *
 * Grammar (precedence: `+ -` < `* /` < unary `-` < parens):
 *
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := '-' factor | '(' expr ')' | NUMBER
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
  const t = s.tokens[s.pos]
  if (t === '-') {
    s.pos++
    return -parseFactor(s)
  }
  if (t === '(') {
    s.pos++
    const v = parseExpr(s)
    if (s.tokens[s.pos] !== ')') throw new Error('expected )')
    s.pos++
    return v
  }
  if (t === undefined) throw new Error('unexpected end of expression')
  const n = Number(t)
  if (!Number.isFinite(n)) throw new Error(`not a finite number: ${t}`)
  s.pos++
  return n
}

function parseTerm(s: ParseState): number {
  let v = parseFactor(s)
  while (s.tokens[s.pos] === '*' || s.tokens[s.pos] === '/') {
    const op = s.tokens[s.pos]
    s.pos++
    const r = parseFactor(s)
    if (op === '/') {
      if (r === 0) throw new Error('division by zero')
      v = v / r
    } else {
      v = v * r
    }
  }
  return v
}

function parseExpr(s: ParseState): number {
  let v = parseTerm(s)
  while (s.tokens[s.pos] === '+' || s.tokens[s.pos] === '-') {
    const op = s.tokens[s.pos]
    s.pos++
    const r = parseTerm(s)
    v = op === '+' ? v + r : v - r
  }
  return v
}

export const calculator = defineAgentTool({
  name: 'calculator',
  description:
    'Evaluate a basic arithmetic expression (supports +, -, *, /, parens, decimals, unary minus). Example: "(12.5 * 8) + 100".',
  inputSchema: z.object({
    expression: z.string().min(1).max(200),
  }),
  handler: ({ expression }) => {
    const state: ParseState = { tokens: tokenize(expression), pos: 0 }
    const result = parseExpr(state)
    if (state.pos < state.tokens.length)
      throw new Error(`trailing tokens: ${state.tokens[state.pos] ?? ''}`)
    if (!Number.isFinite(result)) throw new Error('result is not finite')
    return { expression, result }
  },
})
