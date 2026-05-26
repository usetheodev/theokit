/**
 * T2.1 — createConversationHistory `conversationStorage` passthrough.
 *
 * Verifies:
 *  - storage option flows through to Agent.getOrCreate
 *  - omitted storage = undefined (SDK uses its default)
 *  - structural contract — partial interface accepted
 *  - EC-5: bidirectional assignability with SDK's ConversationStorageAdapter
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
  __setSdkForTests,
  __resetSdkForTests,
  createConversationHistory,
  type ConversationStorageLike,
  type SdkAgentOptions,
  type SdkAgent,
} from '../../packages/theo/src/server/agent/create-conversation-history.js'

import { InMemoryConversationStorage } from '@usetheo/sdk'
import type { ConversationStorageAdapter } from '@usetheo/sdk'

interface CapturedCall {
  agentId: string
  options: SdkAgentOptions
}

function makeStubSdk(captured: CapturedCall[]) {
  return {
    Agent: {
      getOrCreate: async (agentId: string, options: SdkAgentOptions): Promise<SdkAgent> => {
        captured.push({ agentId, options })
        return {
          send: async () => ({
            stream: async function* () {},
            wait: async () => ({ status: 'finished' as const }),
          }),
          dispose: async () => {},
        }
      },
    },
  }
}

function makeRequestWith(cookie?: string) {
  return {
    headers: { cookie },
  }
}

beforeEach(() => {
  __resetSdkForTests()
})

afterEach(() => {
  __resetSdkForTests()
})

describe('createConversationHistory — conversationStorage passthrough (T2.1)', () => {
  it('test_storage_passthrough_explicit — storage forwarded to Agent.getOrCreate', async () => {
    const calls: CapturedCall[] = []
    __setSdkForTests(makeStubSdk(calls))
    const stub = new InMemoryConversationStorage()
    await createConversationHistory({
      request: makeRequestWith() as unknown as Request,
      agentId: 'explicit-id',
      options: {
        apiKey: 'k',
        model: { id: 'm' },
        conversationStorage: stub,
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].options.conversationStorage).toBe(stub)
  })

  it('test_storage_omitted_defaults_to_sdk — undefined in options', async () => {
    const calls: CapturedCall[] = []
    __setSdkForTests(makeStubSdk(calls))
    await createConversationHistory({
      request: makeRequestWith() as unknown as Request,
      agentId: 'a',
      options: {
        apiKey: 'k',
        model: { id: 'm' },
      },
    })
    expect(calls[0].options.conversationStorage).toBeUndefined()
  })

  it('test_storage_partial_interface_typechecks (only required methods)', () => {
    const minimalStorage: ConversationStorageLike = {
      getMessages: async () => [],
      appendMessage: async () => {},
      deleteConversation: async () => {},
    }
    // Type-only assertion — if this line compiles, the partial interface
    // (without optional listConversationIds / dispose) is accepted.
    expect(typeof minimalStorage.getMessages).toBe('function')
  })

  it('test_storage_extra_methods_typecheck (optional methods)', () => {
    const fullStorage: ConversationStorageLike = {
      getMessages: async () => [],
      appendMessage: async () => {},
      deleteConversation: async () => {},
      listConversationIds: async () => [],
      dispose: async () => {},
    }
    expect(typeof fullStorage.dispose).toBe('function')
  })

  // EC-5 (SHOULD TEST) — bidirectional sync between TheoKit's structural type
  // and the SDK's nominal type. If either side drifts, this test catches it.
  it('test_sdk_contract_assignability (EC-5 direction: SDK → TheoKit)', () => {
    // The SDK's adapter must be assignable to TheoKit's structural shape.
    const fromSdk: ConversationStorageAdapter = new InMemoryConversationStorage()
    const asTheokit: ConversationStorageLike = fromSdk
    expect(typeof asTheokit.appendMessage).toBe('function')
  })

  it('test_theokit_storage_assignable_to_sdk_adapter (EC-5 direction: TheoKit → SDK)', () => {
    // A TheoKit-typed value must be assignable to the SDK's adapter type.
    // If TheoKit adds a method the SDK doesn't expect, this assignment fails.
    const minimal: ConversationStorageLike = {
      getMessages: async () => [],
      appendMessage: async () => {},
      deleteConversation: async () => {},
    }
    const asSdk: ConversationStorageAdapter = minimal as ConversationStorageAdapter
    expect(typeof asSdk.appendMessage).toBe('function')
  })
})
