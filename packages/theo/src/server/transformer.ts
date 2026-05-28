import superjson from 'superjson'

/**
 * T5.2 — pluggable response/request transformer.
 *
 * `superjson` is the default, preserving Date/Map/Set/BigInt/etc.
 * `json` is the lightweight option (plain JSON.stringify/parse).
 * Users can supply a custom object implementing this contract.
 */
export interface TheoTransformer {
  name: string
  serialize: (value: unknown) => string
  deserialize: (raw: string) => unknown
}

export const superjsonTransformer: TheoTransformer = {
  name: 'superjson',
  serialize: (v) => JSON.stringify(superjson.serialize(v)),
  deserialize: (raw) => {
    const parsed = JSON.parse(raw) as Parameters<typeof superjson.deserialize>[0]
    return superjson.deserialize(parsed)
  },
}

export const jsonTransformer: TheoTransformer = {
  name: 'json',
  serialize: (v) => JSON.stringify(v),
  deserialize: (raw) => JSON.parse(raw) as unknown,
}

const BUILT_INS: Record<string, TheoTransformer> = {
  superjson: superjsonTransformer,
  json: jsonTransformer,
}

export function resolveTransformer(
  selector: 'json' | 'superjson' | TheoTransformer,
): TheoTransformer {
  if (typeof selector === 'string') {
    // selector is 'json' | 'superjson' literal — both keys exist in
    // BUILT_INS by construction. Type system guarantees a hit; we keep
    // a defensive fallback that the compiler cannot see is unreachable
    // at runtime, just in case someone adds a new literal to the union
    // but forgets to register the built-in.
    const built = BUILT_INS[selector]
    // Defensive: the public union ensures `built` is defined, but if a
    // future contributor extends the union without registering the impl,
    // the cast keeps the failure mode loud.
    if ((built as TheoTransformer | undefined) === undefined) {
      throw new Error(
        `Unknown transformer "${selector}". Built-in options: ${Object.keys(BUILT_INS).join(', ')}.`,
      )
    }
    return built
  }
  if (
    typeof selector !== 'object' ||
    typeof selector.serialize !== 'function' ||
    typeof selector.deserialize !== 'function'
  ) {
    throw new Error(
      `Custom transformer must have serialize and deserialize functions. Got: ${JSON.stringify(selector)}`,
    )
  }
  return selector
}
