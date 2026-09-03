# Yula AI — SDK notları

Paketler (yula.client): `ai` (^7), `@ai-sdk/react`, `@ai-sdk/azure`, `@ai-sdk/openai`, `ollama-ai-provider-v2`, `zod` (^4).

**Kaynak:** https://ai-sdk.dev/docs — custom çözümden önce oku.

## Projede kullanılan desenler

### streamText + tools (sunucu)

`src/app/api/agent/chat/route.ts`:

- `streamText({ model, system, messages, tools, … })`
- `extractReasoningMiddleware({ tagName: "think" })` + `wrapLanguageModel`
- Tool execute sunucuda yok → client tools / `addToolOutput`

### useChat (istemci)

`src/hooks/use-yula-chat.tsx`:

- `@ai-sdk/react` `useChat` + `DefaultChatTransport`
- Bekleyen `input-available` tool → `executeClientTool` → `addToolOutput`
- `sendAutomaticallyWhen` / should-continue: başarılı terminal screen tool’da dur; hata/blocked’da devam

### tool vs dynamicTool

- Statik (zod): `tool({ description, inputSchema, outputSchema })` → `tool-<name>` UI parçaları, `InferUITools`
- Dinamik kolon enum: `dynamicTool()` → `dynamic-tool` parçaları
- Referans: `yula-server-tools.ts` (`STATIC_TOOLS`, `gridTools`, `buildServerTools`)

### Provider adaptör

Yalnız `yula-provider.ts`:

| Sağlayıcı | Paket | Not |
|-----------|-------|-----|
| Microsoft Foundry | `@ai-sdk/azure` `createAzure` | `/openai/v1` baseURL |
| OpenAI | `@ai-sdk/openai` `createOpenAI` | |
| Ollama | `ollama-ai-provider-v2` `createOllama` | keep_alive / num_ctx fetch sarmalayıcıda |

UI/chat dosyalarına provider factory import etme.

## Dokümana bakmadan yapma

- Yeni tool calling / multi-step agent loop
- Message part tipleri (`tool-*`, `dynamic-tool`, reasoning)
- Streaming UI / `useChat` status
- Provider Options / middleware

Önce docs + mevcut route/hook; sonra minimal genişletme.

## Versiyon notu

`package.json` semver’ına güven. Breaking change şüphesinde ai-sdk.dev’deki güncel `streamText` / `tool` / `useChat` sayfalarını aç; eski blog/cookbook’u körü körüne kopyalama.
