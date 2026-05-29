---
'create-theokit': patch
---

Fix template default chat.ts: adiciona `providers: { routes: [{ capability: 'chat', provider: 'openrouter' }] }` quando OPENROUTER_API_KEY presente. Sem isso, SDK inferia provider do prefixo do model id (`openai/gpt-4o-mini` → tentava OpenAI direto, exigindo `OPENAI_API_KEY`). Stranger agora pode usar APENAS OPENROUTER_API_KEY e tudo roteia corretamente.
