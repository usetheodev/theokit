import { describe, it, expect } from 'vitest'
import { levenshtein, findSuggestion } from '../../packages/theo/src/server/suggest.js'

describe('levenshtein', () => {
  it('should return 0 for identical strings', () => {
    // Given: two identical strings
    const a = 'users'
    const b = 'users'

    // When: computing levenshtein distance
    const distance = levenshtein(a, b)

    // Then: distance is 0
    expect(distance).toBe(0)
  })

  it('should return 2 for one swap (transposition)', () => {
    // Given: 'users' vs 'uesrs' (two characters swapped)
    const a = 'users'
    const b = 'uesrs'

    // When: computing levenshtein distance
    const distance = levenshtein(a, b)

    // Then: distance is 2 (two substitutions)
    expect(distance).toBe(2)
  })

  it('should return 3 for completely different short strings', () => {
    // Given: two completely different 3-char strings
    const a = 'abc'
    const b = 'xyz'

    // When: computing levenshtein distance
    const distance = levenshtein(a, b)

    // Then: distance is 3
    expect(distance).toBe(3)
  })
})

describe('findSuggestion', () => {
  it('should return closest match when within maxDistance', () => {
    // Given: a typo input and valid candidates
    const input = '/api/uesrs'
    const candidates = ['/api/users', '/api/posts']

    // When: finding a suggestion
    const suggestion = findSuggestion(input, candidates)

    // Then: the closest match is returned
    expect(suggestion).toBe('/api/users')
  })

  it('should return null when no candidate is within maxDistance', () => {
    // Given: an input very different from all candidates
    const input = '/api/xyz'
    const candidates = ['/api/users']

    // When: finding a suggestion
    const suggestion = findSuggestion(input, candidates)

    // Then: null is returned (distance > 3)
    expect(suggestion).toBeNull()
  })

  it('should return null for empty candidates', () => {
    // Given: no candidates at all
    const input = '/api/users'
    const candidates: string[] = []

    // When: finding a suggestion
    const suggestion = findSuggestion(input, candidates)

    // Then: null is returned
    expect(suggestion).toBeNull()
  })
})
