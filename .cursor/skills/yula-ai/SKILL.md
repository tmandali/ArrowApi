---
name: yula-ai
description: >-
  Yula AI (yula.client) mimarisi, YAML slash ajanları, Vercel AI SDK sohbet yolu,
  sağlayıcı/env, DuckDB WASM semantik header arama (⌘K), rapor kriter/run niyet
  kapısı ve rapor kaydı. Use when changing Yula chat, tools, prompts, agent YAML,
  /slash commands, AI provider, workspace search / semantic RAG search, DuckDB
  vectors, report criteria, run_job/apply_criteria, or stock/report AI behavior in
  src/Sims/yula.client.
---

# Yula AI

**Kök:** `src/Sims/yula.client`  
**Yeniden keşif yapma** — önce bu skill + [architecture.md](architecture.md) + [sdk-notes.md](sdk-notes.md). Custom çözümden önce AI SDK dokümanına bak.

## Değişmez kurallar

1. **Slash ajan = YAML.** Komut metni/prompt kodda hardcode edilmez.
2. **Mevcut `*.agent.yaml` dosyasına komut eklemek = kod değişikliği yok.** Kullanıcı ekranda `/slash` ile kullanır.
3. **Sağlayıcı SDK yalnız** `src/lib/yula-provider.ts`. Chat/UI’ya `createAzure` / `createOllama` / `createOpenAI` gömme.
4. **Sohbet yolu:** `/api/agent/chat` → `getYulaLanguageModel` + `streamText({ model, tools })`. Araç çağrısını prompt metnine yazma.
5. **Niyet tamamlanmadan aksiyon yok:** yalnız slot (`geçen hafta`) → öneri; `forma doldur`/`uygula` → `apply_criteria`; `çalıştır`/`run` → `run_job`/`run_report`. Kapı: `src/lib/report-run-intent.ts`.
6. **SDK tutarlılığı:** Custom pattern yazmadan önce [AI SDK docs](https://ai-sdk.dev/docs) (+ ilgili provider paketi). Projede zaten olan cookbook desenini kopyala.

## Hızlı harita

| Konu | Dosya |
|------|--------|
| Slash YAML yükleme | `src/components/layout/yula-commands.ts` |
| Sistem komutları | `src/features/system/agents/system.agent.yaml` |
| Grid (sonuç) komutları | `src/features/reports/agents/grid.agent.yaml` |
| Rapor (kriter) komutları | `src/features/stock/agents/report.agent.yaml` |
| Chat API | `src/app/api/agent/chat/route.ts` |
| System prompt | `src/lib/yula-agent-prompt.ts` |
| Tool şemaları (sunucu) | `src/lib/yula-server-tools.ts` |
| Tool yürütme (istemci) | `src/lib/yula-client-tools.ts` |
| Provider adaptör | `src/lib/yula-provider.ts` |
| Env / aktif provider | `src/lib/yula-config.ts` |
| Sohbet hook | `src/hooks/use-yula-chat.tsx` |
| Ekran bağlamı | `src/hooks/use-screen-agent-context.tsx` |
| Run niyet kapısı | `src/lib/report-run-intent.ts` |
| Header semantik arama (⌘K) | `src/hooks/use-workspace-rag-search.ts` |
| Arama UI (trigger/panel) | `src/components/layout/workspace-search-*.tsx` |
| DuckDB vektör / RAG | `src/services/duckdb-vector.ts` |
| Embedding API | `src/app/api/agent/embed/route.ts`, `src/lib/yula-embedding.ts` |
| Menü indeksi kaynağı | `src/features/stock/lib/stock-menu-registry.ts` |
| Rapor registry | `src/features/reports/report-registry.ts` |
| Stok bakiye şema | `src/features/stock/item/schemas/stock-balance-criteria.schema.json` |
| Mimari checklist | `src/Sims/yula.client/AGENTS.md` |

## Header semantik arama (DuckDB WASM)

Ana ekran Search kutusu / sidebar Search / **⌘K** → `useWorkspaceSearch` açılır; sonuçlar `useWorkspaceRagSearch` ile gelir.

1. **Fast path (~0 ms):** menü + sohbet geçmişinde token/kök eşleşmesi (`ALL_WORKSPACE_MENU_ITEMS`, chats store).
2. **Semantik (~100 ms debounce):** `searchVectorContext(query)` → embedding + DuckDB `yula_rag_embeddings` üzerinde `array_cosine_distance`; skor ≥ %50 birleştirilir.
3. Telemetri: `🤖 [Yula Header AI Search Telemetry]` / `🤖 [Yula RAG Telemetry]`.

İndeks: menü (`indexWorkspaceMenus`), rapor şemaları (`indexReportSchemas`), sohbet (`indexConversationHistory`). Tablo: `yula_rag_embeddings` (OPFS bucket `yula-rag-vectors`). Detay: [architecture.md](architecture.md#header-semantik-arama).

## Slash komut ekleme (kod yok)

1. Doğru evre YAML’ına satır ekle (`phase`: `system` | `grid` | `report`).
2. Alanlar: `id`, `slash`, `label`, `description`, `prompt`, `icon`, `phase` (+ opsiyonel `pagePath`).
3. `icon` mevcut `ICON_MAP` adlarından olsun (`SquarePen`, `Paperclip`, `FileText`, `BarChart2`, `Database`, `RotateCcw`, `Package`, `ShieldAlert`). Yeni ikon gerekirse tek satır `ICON_MAP` (nadir istisna).
4. Script: `node .cursor/skills/yula-ai/scripts/add-slash-command.mjs --help`

**Yeni YAML dosyası** (yeni workspace/evre): `yula-commands.ts`’e import + dizi birleştirme gerekir — kaçın; mümkünse mevcut üç dosyaya ekle.

## Provider / env

- Aktif: `AI_PROVIDER` / `NEXT_PUBLIC_AI_PROVIDER` (`foundry` ≡ `azure`).
- Azure: `AZURE_OPENAI_*`; OpenAI: `OPENAI_*`; Ollama: `OLLAMA_URL`, `OLLAMA_MODEL`.
- Kullanıcı seçimi: `yula_ai_config` (localStorage) + model popover; kayıt yoksa sunucu env’e güvenir.
- Detay: [architecture.md](architecture.md#provider--env).

## Rapor / AI checklist (kısa)

Yeni rapor: JSON Schema (`x-ai`) → registry → app route → JobView (`ArrowReportGrid`) → `workspace-paths` etiketi. Ayrıntı: `AGENTS.md`. Rapora özel filtre kelime listesi yazma.

## SDK önce

Sohbet/tool/stream değişikliğinde sıra:

1. [sdk-notes.md](sdk-notes.md) + https://ai-sdk.dev/docs (useChat, streamText, tool, dynamicTool, client tools).
2. Mevcut `route.ts` / `use-yula-chat.tsx` / `yula-server-tools.ts` desenini genişlet.
3. Ancak dokümanda yoksa ve mevcut desen yetmiyorsa custom yaz; nedenini kısaca not et.

## Scriptler

```bash
# Kayıtlı slash komutları listele
node .cursor/skills/yula-ai/scripts/list-agents.mjs

# YAML'a komut ekle (kod değiştirmez)
node .cursor/skills/yula-ai/scripts/add-slash-command.mjs --phase grid --slash kpi --label "KPI" --prompt "Genel toplam ve KPI göster" --icon BarChart2

# Niyet kapısı smoke
node --experimental-strip-types --test src/Sims/yula.client/src/lib/report-run-intent.test.ts
```

## Doğrulama

- `cd src/Sims/yula.client && npm run typecheck`
- Slash: ilgili ekranda `/` paleti + komut çalışır
- Kriter: eksik niyet job/form yazmaz; `raporu çalıştır` job açar
- Header ⌘K: token eşleşmesi anında; semantik sonuçlar telemetri ile gelir
