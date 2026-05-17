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
    const parsed = JSON.parse(raw)
    return superjson.deserialize(parsed as Parameters<typeof superjson.deserialize>[0])
  },
}

export const jsonTransformer: TheoTransformer = {
  name: 'json',
  serialize: (v) => JSON.stringify(v),
  deserialize: (raw) => JSON.parse(raw),
}

const BUILT_INS: Record<string, TheoTransformer> = {
  superjson: superjsonTransformer,
  json: jsonTransformer,
}

export function resolveTransformer(
  selector: 'json' | 'superjson' | TheoTransformer,
): TheoTransformer {
  if (typeof selector === 'string') {
    const built = BUILT_INS[selector]
    if (!built) {
      throw new Error(
        `Unknown transformer "${selector}". Built-in options: ${Object.keys(BUILT_INS).join(', ')}.`,
      )
    }
    return built
  }
  if (
    !selector ||
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
