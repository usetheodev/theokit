export {
  createMockAgentStream,
  type MockAgentStreamOptions,
  type MockResponse,
  type MockStreamEvent,
} from './mock-stream.js'

// M85 — the seam over the vocabulary production actually speaks.
//
// `createMockAgentStream` above emits a snake_case vocabulary NO production path of this framework
// consumes: our terminal renderer switches over the kebab-case `WIRE_CHUNK_TYPES`, and the presenter
// speaks a third. Measured adoption of it: one caller (its own unit test), zero in the only real
// product, which recorded the refusal in prose. These speak the wire and the presenter.
export { createMockOutputEvents, createMockWireStream, wireChunk } from './mock-wire-stream.js'
export { inspectCompiled } from './inspect-compiled.js'
export type { CompiledInspection } from './inspect-compiled.js'

/**
 * B-061 — the type this barrel's own signatures NAME.
 *
 * It appeared in an exported signature and crossed nothing: a consumer could read the shape in the
 * emitted `.d.ts` and could only name it by importing the upstream package directly. The sixth
 * instance of the shape `bridge/index.ts` enumerates by issue number, and the first caught by a
 * guard that DERIVES the requirement from the built barrels rather than listing it
 * (`tests/unit/every-public-type-crosses-the-barrel.test.ts`).
 */
export type { AgentOutputEvent } from '@theokit/presenter'
