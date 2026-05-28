export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from<number>({ length: n + 1 }).fill(0),
  )

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }

  return dp[m][n]
}

export function findSuggestion(
  input: string,
  candidates: string[],
  maxDistance = 3,
): string | null {
  let best: string | null = null
  let bestDist = maxDistance + 1

  for (const c of candidates) {
    const d = levenshtein(input, c)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }

  return best
}
