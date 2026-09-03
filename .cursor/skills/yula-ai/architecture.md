# Yula AI — mimari referans

Ayrıntılı harita. Günlük iş için [SKILL.md](SKILL.md) yeterli.

## Katmanlar

```
UI (ai-chat-assistant, yula dock)
  → useYulaChat (@ai-sdk/react useChat)
    → POST /api/agent/chat
         → getYulaLanguageModel (yula-provider)
         → buildSystemPrompt (yula-agent-prompt + screen context)
         → buildServerTools (evre: grid yoksa STATIC_TOOLS; grid varsa grid tools)
         → streamText({ model, tools, … })
    ← tool-* / dynamic-tool parçaları
  → runPendingTool → executeClientTool (istemci DuckDB/OPFS/job)
```

## Evreler (phase wall)

| Evre | URL / durum | Araçlar | Slash |
|------|-------------|---------|-------|
| workspace / criteria | `/stock/stock-balance` (GUID yok) | apply_criteria, run_job, get_report_schema, navigate… | system + report |
| results | GUID path veya `?job=` + tablo | filter/analyze/SQL grid tools | system + grid |
| results-loading | tablo hazır değil | araç yok | — |

Kriter ile sonuç araçlarını karıştırma. Prompt: `yula-agent-prompt.ts` PHASE WALL.

## YAML agent manifest

- Yükleme: `raw-loader` (`next.config.ts`) → string → `js-yaml` (`yula-commands.ts`).
- Tip: `src/types/yaml.d.ts` (`declare module "*.yaml"`).
- Üç dosya (mevcut kayıt):
  - `features/system/agents/system.agent.yaml` — her zaman
  - `features/reports/agents/grid.agent.yaml` — sonuç
  - `features/stock/agents/report.agent.yaml` — kriter
- `getAllYulaCommands(isViewingResults, pathname)` paleti seçer.
- Kullanıcı: sohbet kutusunda `/komut`.

### YAML şablon

```yaml
commands:
  - id: "grid-ornek"
    slash: "ornek"
    label: "Örnek"
    description: "Kısa açıklama"
    prompt: "Modele gidecek tam kullanıcı metni"
    icon: "BarChart2"
    phase: "grid"
```

## Provider / env

| Env | Rol |
|-----|-----|
| `AI_PROVIDER` / `NEXT_PUBLIC_AI_PROVIDER` | `azure`/`foundry`, `openai`, `ollama` |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_MODEL` | Foundry |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_KEEP_ALIVE`, `YULA_NUM_CTX` | Yerel |
| Embedding | `*_EMBEDDING_MODEL`, `VECTOR_DIMENSION` |
| RAG mesafe eşiği | `NEXT_PUBLIC_RAG_SHORT_MAX_DISTANCE`, `NEXT_PUBLIC_RAG_MAX_DISTANCE` |

`getActiveProvider()` (`yula-config.ts`): env → yoksa Azure kimliği varsa azure → …  
Foundry: `createAzure({ baseURL, apiKey })` — Foundry için `createOpenAI` kullanma.

## Header semantik arama

```
Header Search / ⌘K / sidebar Search
  → useWorkspaceSearch (context) + WorkspaceSearchTrigger / MainView / Panel
  → useWorkspaceRagSearch(query)
       1) token/kök exact (menü + chats) — anında
       2) searchVectorContext → getEmbedding → DuckDB array_cosine_distance
  ← gruplu sonuçlar (menu | conversation); semantik skor ≥ 50
```

| Parça | Dosya |
|-------|--------|
| Trigger (header input) | `components/layout/workspace-search-trigger.tsx` |
| Panel / main view | `workspace-search-panel.tsx`, `workspace-search-main-view.tsx`, `workspace-search-dialog.tsx` |
| Context / hooks | `context/workspace-search*.tsx`, `workspace-search-hooks.ts` |
| RAG hook | `hooks/use-workspace-rag-search.ts` |
| Vektör store | `services/duckdb-vector.ts` (`yula_rag_embeddings`) |
| Embedding | `lib/yula-embedding.ts` → `/api/agent/embed` |
| OPFS bucket | `lib/yula-storage-buckets.ts` (`yula-rag-vectors`) |
| Menü kayıt | `features/stock/lib/stock-menu-registry.ts` (`indexWorkspaceMenus`) |

İndeksleyenler: `indexWorkspaceMenus`, `indexReportSchemas`, `indexConversationHistory` (sohbet/Yula açılışında tembel). Chat sohbeti de aynı `searchVectorContext` ile bağlam çekebilir (`use-yula-chat`).

## Niyet kapısı (kriter)

`report-run-intent.ts` + `use-yula-chat` `runPendingTool`:

- `run_job`/`run_report` yalnız `hasExplicitReportRunIntent`
- `apply_criteria` yalnız `hasExplicitCriteriaApplyIntent`
- Aksi → `{ status: "blocked", reason: "incomplete-intent" }` (form/job yok)
- Chip `yula-criteria:...` tıklaması tool kapısından geçmez (doğrudan draft)

## Rapor plug-in

1. `schemas/<report>-criteria.schema.json` — `x-scope`, `x-page-path`, `x-job-endpoint`, `x-ai`
2. `REGISTERED_REPORTS` — `report-registry.ts`
3. `app/<ws>/<report>/page.tsx` + `[jobId]/page.tsx`
4. JobView → `ArrowReportGrid`
5. `formatPathnameLabel` — `workspace-paths.ts`
6. Slash gerekirse ilgili `*.agent.yaml` (kod yok)

`x-ai`: aliases, quickPrompts, resultsPrompts, columnAliases, field `dateBehavior`. Kelime-listesi rapor özel guard yasak.

## İstemci vs sunucu tools

- Sunucu: Zod `tool()` / `dynamicTool()` — şema + description; **execute yok**.
- İstemci: `executeClientTool` — job, draft, DuckDB, navigate.
- Terminal ekran araçları başarılıysa auto-continue durur; `blocked`/`error` failed sayılır → model düzeltebilir.

## Konuşma / navigasyon (kısa)

- Sohbet `pathname` + `jobId` bağlı.
- Tool ile sayfa değişince: `beginConversationFollow` → varışta `followArrivedConversation` (yeni sohbet açılmaz).
- Elle URL değişimi → taze sohbet (normalizePath birebir).
