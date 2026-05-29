---
'theokit': patch
'create-theokit': patch
---

**FAANG-grade provider routing — Strategy + Registry pattern.**

Provider resolution moved from per-template conditionals into a centralized Strategy + Registry inside `theokit/server`. Consumers (template `chat.ts`, fixtures) now ship **zero conditionals on provider** — the framework resolves `apiKey` + `baseUrl` automatically from the highest-priority env var present (`OPENROUTER_API_KEY` > `OPENAI_API_KEY` > `ANTHROPIC_API_KEY`).

Inspired by Dapr Conversation Registry (`dapr/pkg/components/conversation/registry.go`) and Encore Manager provider array (`encore/runtimes/go/pubsub/manager_internal.go`).

**New public API in `theokit/server`:**

- `resolveProvider(): ResolvedProvider` — throws actionable error if no env var present
- `tryResolveProvider(): ResolvedProvider | null` — graceful degradation
- `registerProvider(descriptor: ProviderDescriptor): void` — runtime extension point (idempotent by name)
- `resetProviderRegistry(): void` — test-only / dev escape hatch
- `listProviders(): readonly ProviderDescriptor[]` — sorted by priority

**`createConversationHistory` upgrade:** auto-injects `apiKey` + `providers.routes[0]` (capability=chat) into SDK options when consumer omits `options.apiKey`. Explicit `options.apiKey` always wins (escape hatch preserved).

**Template `chat.ts` is now FAANG-clean** — pure `model: { id: 'gpt-4o-mini' }`, no `process.env.*` reads, no provider conditionals, no manual error yields.

**Wire protocol:** OpenAI Chat Completions (universal — every provider implements it). Anthropic uses native Messages API behind the same Strategy abstraction.
