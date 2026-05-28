/**
 * Telegram bot — same agent that runs in the web chat.
 *
 * Pattern (from @usetheo/gateway-telegram README):
 *
 *   1. `TelegramAdapter` wraps grammy + the BasePlatformAdapter contract.
 *   2. `GatewayRunner` orchestrates adapters; the handler receives a
 *      normalized `MessageEvent` regardless of transport.
 *   3. We derive the SDK agentId from `event.telegram.chatId` so each
 *      Telegram chat resumes its own conversation across bot restarts.
 *
 * Run:  `pnpm bot` (after putting TELEGRAM_BOT_TOKEN in .env)
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Agent } from '@usetheo/sdk'
import { GatewayRunner } from '@usetheo/gateway'
import { TelegramAdapter } from '@usetheo/gateway-telegram'
import { loadEnv } from 'theokit/server'

import { buildTools } from './tools/index.js'

// T1.4 + EC-7 — Bot is a standalone script outside the CLI loop, so
// loadEnv() must be called explicitly. Use the BOT'S OWN dirname (not
// process.cwd()) so launching `pnpm bot` from the monorepo root still
// reads the example's `.env` rather than the root's.
const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ cwd: resolve(__dirname, '..') })

const token = process.env.TELEGRAM_BOT_TOKEN
if (token === undefined || token.length === 0) {
  console.error(
    'TELEGRAM_BOT_TOKEN required. Get one by DM-ing @BotFather on Telegram, then add it to .env.',
  )
  process.exit(1)
}

function resolveProvider(): { apiKey: string; modelId: string } | null {
  const orKey = process.env.OPENROUTER_API_KEY
  const anKey = process.env.ANTHROPIC_API_KEY
  const userModel = process.env.MODEL_ID
  if (orKey !== undefined && orKey.length > 0) {
    // Default: openai/gpt-4o-mini — cheap, production-grade, excellent tool
    // calling. Override via MODEL_ID env (see README "Model catalog").
    return { apiKey: orKey, modelId: userModel ?? 'openrouter/openai/gpt-4o-mini' }
  }
  if (anKey !== undefined && anKey.length > 0) {
    return { apiKey: anKey, modelId: userModel ?? 'claude-sonnet-4-5-20250929' }
  }
  return null
}

const adapter = new TelegramAdapter({ token })

const runner = new GatewayRunner({
  adapters: [adapter],
  handler: async (event, ctx) => {
    if (event.platform !== 'telegram') {
      // Defensive — runner is configured with only a Telegram adapter, so
      // this branch is unreachable today. Pinned for future multi-adapter
      // setups (Discord etc.).
      return
    }

    const provider = resolveProvider()
    if (provider === null) {
      await ctx.reply(
        'Server missing OPENROUTER_API_KEY (or ANTHROPIC_API_KEY). Tell the operator.',
      )
      return
    }

    // Channel-prefixed agentId — never collides with web's `web-<uuid>`.
    const agentId = `tg-${event.telegram.chatId.toString()}`

    const agent = await Agent.getOrCreate(agentId, {
      apiKey: provider.apiKey,
      model: { id: provider.modelId },
      tools: buildTools(agentId),
    })

    try {
      const run = await agent.send(event.text)
      const result = await run.wait()
      const reply = result.status === 'error' && result.error !== undefined
        ? `Agent error: ${result.error.message}`
        : (result.result ?? '(no reply)')
      await ctx.reply(reply)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await ctx.reply(`Bot crashed: ${message}`)
    }
  },
})

await runner.start()
console.log('Telegram bot running — DM the bot to chat.')
