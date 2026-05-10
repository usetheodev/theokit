import superjson from 'superjson'

export interface SerializedResponse {
  json: unknown
  meta?: unknown
}

/**
 * Serialize data using superjson for rich type support (Date, Map, Set, BigInt, etc.)
 */
export function serializeResponse(data: unknown): SerializedResponse {
  return superjson.serialize(data)
}

/**
 * Deserialize data that was serialized with superjson.
 */
export function deserializeResponse(serialized: SerializedResponse): unknown {
  return superjson.deserialize(serialized as Parameters<typeof superjson.deserialize>[0])
}
