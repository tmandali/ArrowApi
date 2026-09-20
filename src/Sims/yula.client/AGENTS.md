<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Yula Client Architect & Report Checklist

## 🤖 Declarative YAML Agent Manifest & Modular Skills Standards
- **Declarative YAML Agent Manifests:** No commands or prompt text are hardcoded in code. All system, grid, and workspace agent capabilities are stored in `src/workspaces/<workspace>/agents/*.agent.yaml` (or `src/features/system/agents/`, `src/features/reports/agents/`) manifest files. Manifest loading runs dynamically through `yula-commands.ts` via bundler raw loaders and `js-yaml`.
- **Modular UI Skills (`src/lib/skills/yula-ui-skills.ts`):** Heavy catalog navigation and grid data rules are isolated into dynamic skills (`report-catalog-navigation`, `active-table-grid-operations`). They are injected only when the relevant UI components are active on screen, keeping `yula-agent-prompt.ts` lightweight and prompt-bloat-free.
- **User Skills (runtime, on-device):** Users define their own slash commands (`lib/stores/user-skills.ts`, localStorage-persisted; pure logic in `lib/yula-user-skill.ts`). Scope is `global` or a workspace id; user skills may attach reference files (.md/.txt/.json, 32K each, validated, never scripts) shown with previews in the editor and loadable via the client-executed `read_user_file` tool. They merge into the same `YulaCommand` pipe (`source: "user"`), appear in the slash palette with a `skill` badge, and send via `buildUserSkillPrompt` (`{{input}}` substitution, else append). Built-in slashes win on conflict. Creating a skill never creates an agent — skills are instruction data run by the existing Yula agent.
- **Model Skill Awareness (progressive disclosure):** Each turn sends only the in-scope inventory (slash/label/description, never full prompts) in the request body (`context.userSkills`); the prompt lists it under USER SKILLS. The `run_user_skill` tool loads the full instructions as tool output and the model follows them. Worked-steps render `Loaded skill: /<slash>`.
- **Built-in Skills:** `/ay-kapanis` (global month-end close checklist), `/sayim-fark` (stock count variance), `/rapor-kalite` (global data-quality tour) — single source is `skills/<name>/SKILL.md` (standard Agent Skills layout: `name`/`description` + `slash`/`label`/`scope` extensions), raw-imported via bundler rules and parsed into `BUILT_IN_USER_SKILLS` (`lib/built-in-skills.ts`).
- **Yula AI Customization Hub (`/my/*`):** All user-facing AI customization is organized into 4 dedicated screens in the `my` workspace: Skills (`/my/skills`), Personas/Agents (`/my/agents`), Plugin Registry (`/my/plugins`), and Agent Memory (`/my/memory`). Legacy `/my/studio`, `/system/agents`, and `/system/skills` routes redirect to their corresponding `/my/*` pages; the `system` workspace strictly manages platform infrastructure and users (`/system/users`).
- **Skill Discovery (pure):** `lib/skill-discovery.ts` (SKILL.md frontmatter parse only: `parseSkillFile`, `stripSkillFrontmatter`).

---

## 📋 Checklist When Adding a New Report / Agent (Step by Step)

Apply the following steps without exception whenever a new report or agent capability is added to the project:

1. **JSON Schema Definition (`schemas/<report>-criteria.schema.json`):**
   - Define the criteria schema with `x-scope`, `x-page-path`, `x-job-endpoint`, and `x-ai` (`aliases`, `quickPrompts`, `resultsPrompts`, `columnHints`) fields.
   - For iterative result-screen analysis, add the `x-ai.analysisTopics` (`id`, `title`, `goal`, `tool`: analyze|sql|visualize|filter, `columns`, `followUp`) playbook.
2. **YAML Agent Manifest Definition (`src/workspaces/<workspace>/agents/<name>.agent.yaml`):**
   - When a new workspace or feature command/agent capability is needed, define the YAML manifest file in the relevant `agents/` folder.
3. **Report Registration (`src/features/reports/report-registry.ts`):**
   - Export the created JSON schema through the relevant workspace's `index.ts` gateway and add it to the `REGISTERED_REPORTS` array with `scope`, `workspace`, `title`, `pagePath`, `aliases`, and `fullSchema`.
4. **Next.js Route Page (`src/app/`):**
   - Report Screen: `src/app/<workspace>/<report>/page.tsx` (single-page standard: criteria filters, execution history, and the result DuckDB grid are unified on one page; direct job links open via the `?jobId=<guid>` parameter).
5. **Result Screen Component (`<Report>ResultGrid.tsx`):**
   - Build the report result component on the standard OPFS + DuckDB WASM-backed `<ArrowReportGrid jobId={jobId} jobUrl={reportUrl} reportScope="<scope>" ... />` and bind it to the Form's `renderResult` prop.
6. **Path & Title Formatting (`src/lib/workspace-paths.ts`):**
   - Add the report's Turkish label to the `formatPathnameLabel(pathname)` function (`if (pathname.includes("/<workspace>/<report>")) return "<Rapor Adı>"`).

---

## 📊 Report Lifecycle, Single-Page Architecture, and SSE Flow

### 1. Single-Page Architecture (Single-Page Unified Report Flow)
- The report route always lives under `src/app/<workspace>/<report>/page.tsx`. Instead of separate old `[jobId]` pages, the `?jobId=<guid>` URL query parameter is used (legacy `/[jobId]` folders `redirect` to the `?jobId=` format for backward compatibility).
- The report screen consists of 3 core blocks:
  1. **Criteria Filter Form (`<Report>Form.tsx` & `<Report>Filter.tsx`)**: The user enters criteria or fills them via AI with schema-based completion.
  2. **Unified Execution Panel (`<ArrowJobExecutionsPanel />`)**:
     - Past executions list on the left (date, duration, row count, status icon).
     - Selected job's criteria (JSON or criteria table) and live progress stream (`<RunProgressSteps />`) on the right.
     - A delete trash icon appears on hover over `Completed`, `Failed`, and `Cancelled` jobs.
     - `Cancel` actions for running jobs and `Delete` actions for terminated jobs are integrated in the page header and the panel.
  3. **Result Grid Panel (`<ArrowJobResultPanel />` & `<ArrowReportGrid />`)**: Serves large data with zero memory overhead via DuckDB WASM and the W3C OPFS disk cache.

### 2. SSE Live Event Stream (Server-Sent Events)
- **Backend (`src/Arrow.Jobs.AspNetCore/ArrowJobSse.cs`)**:
  - Endpoint: `GET /api/arrow/jobs/{jobId}/events` (`Content-Type: text/event-stream`).
  - **Anti-Buffering Headers**: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Connection: keep-alive`. Prevents proxy/Next.js layers from holding back small events.
  - Each event is flushed to the client immediately via `await response.Body.FlushAsync(cancellationToken)` right after writing.
  - Supported events: `status`, `info`, `progress`, `completed`, `failed`, `cancelled`.
  - On connect, past events (`event-log`) are replayed first; then the live stream starts.
- **Client Event Dispatcher (`src/features/jobs/services/arrow-job-event-hub.ts`)**:
  - `ArrowJobEventHub`: A native `EventTarget`-based singleton Pub/Sub service independent of the React lifecycle (`arrowJobEventHub`).
  - **Deduplication**: Even if multiple components subscribe to the same `jobId`, only one SSE connection opens.
  - **Replay**: Components subscribing late via `arrowJobEventHub.subscribe(jobId, callback, { replay: true })` immediately receive the latest snapshot.
  - **Instant First Step**: When `startStream` fires (`initialPhase === "running"`), the `Running — status` step is written to the snapshot at `0ms` and reflected in the UI immediately, before the network handshake completes.
  - **Micro-Rhythm (`arrow-job-client.ts` -> `readJobSseEvents`)**: Even when the backend fires preparation steps (`status`, `info`) back-to-back within 2ms in the same TCP packet, ~70ms of visual tempo is inserted between steps so React doesn't burst them all in a single frame.
  - **Progress Speed**: High-frequency `progress` (row count) steps stream at full speed with no delay; UI notifications render fluidly with ~60ms throttling.
- **Job Status Management (`src/store/slices/active-jobs-store.ts`)**:
  - Zustand-based store tracks active jobs (`Queued`, `Running`, `Completed`, `Failed`, `Cancelled`) globally.
  - `isTerminalJobStatus(status)`: Confirms the job has terminated on `Completed`, `Failed`, `Cancelled` states.

---

## 🤖 Headless React UI-Agent & Yula AI Architecture (@my-agent)

Yula AI operates on the modern **Headless React UI-Agent architecture** powered by `@my-agent/core` and `@my-agent/react`. All monolithic 20+ legacy tools, client-side manual tool watchers, regex gates, and artificial censoring layers have been consolidated into unified, preflight-validated UI actions.

```
                      ┌─────────────────────────────────────────┐
                      │            Yula AI LLM Model            │
                      └────────────────────┬────────────────────┘
                                           │
                        STANDARD_AGENT_TOOLS (Server-Side)
                                           │
         ┌─────────────────────────────────┴─────────────────────────────────┐
         ▼                                 ▼                                 ▼
┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐
│ dispatch_component_action │   │ inspect_ui_state          │   │ ask_user_choice           │
│ • criteria_form:<scope>   │   │ (Active screen state,     │   │ time_travel               │
│ • result_grid:active      │   │  mounted components,      │   │ remember_fact             │
│ • app_router              │   │  and open schema without  │   │ recall_fact               │
│ • job_history             │   │  context bloat)           │   │                           │
└─────────────┬─────────────┘   └───────────────────────────┘   └───────────────────────────┘
              │ (Direct Headless Dispatch)
              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ React UI Component Layer (@my-agent/react: useAgentComponent / useAgentRouter)            │
│  • Zod Preflight Validation & Self-Healing                                               │
│  • Behavioral Contracts: whenToCall (positive guidance) & whenNotToCall (negative guards)  │
│  • Direct state mutation via onAction handler with immediate feedback                      │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Standard Agent Tools (`STANDARD_AGENT_TOOLS`)
- **`dispatch_component_action`**: Central entry point to control interactive UI components.
  - **`criteria_form:<scope>`**:
    - `APPLY`: Writes validated criteria into the active form draft.
    - `RUN`: Starts execution of the report job with full parameters.
    - `VALIDATE`: Pre-validates user inputs against JSON schema and D365/BC syntax.
    - `READ`: Reads current form criteria values.
  - **`result_grid:active`**:
    - `RUN_SQL`: Executes analytical SQL queries on DuckDB WASM.
    - `QUERY`: Updates SQL query/view on the virtual spreadsheet.
    - `FILTER` / `SORT`: Sets dynamic column filters and sort orders.
    - `COLUMNS` / `PIN`: Toggles visibility and pins columns.
    - `EXPORT`: Exports grid data to CSV, Excel, or Parquet.
    - `RESET_LAYOUT`: Restores the original grid view layout.
    - `VISUALIZE` / `ANALYZE` / `PROFILE`: Generates chart specs, data profiles, and KPI metrics.
  - **`app_router`**:
    - `NAVIGATE`: Seamless client-side navigation (`{ path: "/retail/sales" }`).
    - `BACK`: Steps back in browser history.
  - **`job_history`**:
    - `OPEN_LAST`: Opens the most recent job output without re-running.
    - `LIST`: Lists recent job executions.
    - `FIND`: Searches past executions matching criteria.
    - `CANCEL`: Cancels an active or queued job.
- **`inspect_ui_state`**: Retrieves the live snapshot of mounted screen components, active routes, and criteria drafts without polluting the system prompt.
- **`ask_user_choice`**: Interactive decision card prompting the user with selectable option buttons or custom input.
- **`time_travel`**: Native undo/redo of criteria and grid mutations.
- **`remember_fact` & `recall_fact`**: Session or persistent memory CRUD for user preferences.

### 2. Headless React Component Contracts (`whenToCall` & `whenNotToCall`)
Every agent-ready component MUST register via `@my-agent/react` (`useAgentComponent` or `useRegisterComponentAction`):
- **Zod Schema:** Every action payload is validated before execution (Preflight). Invalid payloads return instant structured errors to the LLM for automatic self-healing.
- **`whenToCall`:** Positive natural language instructions specifying when the model should invoke the action.
- **`whenNotToCall`:** Strict negative constraints preventing duplicate executions, accidental job runs without confirmation, or invalid state changes.
- **No Regex Gates:** Intent validation is handled natively by the model guided by `whenToCall`/`whenNotToCall` and Zod schemas, eliminating fragile regex intent blockers (`report-run-intent.ts`).

### 3. Transparent Streaming & Zero Artificial Censorship
- **Zero Thought or Output Suppression:** The legacy `sanitizeAssistantText` filter has been replaced with a transparent pass-through. The assistant's reasoning (`<think>` blocks) and streaming output are displayed authentically and completely without being swallowed or hidden.
- **No Synthetic "worker" Traces:** Fake internal worker calls (`toolName: "worker"`, `id: "user-send"`, `selectedJobId: null`) are completely eliminated. User messages produce clean turns; only real LLM tool executions and Pi events are rendered.
- **Worked-Steps Trace:** Real tool executions are displayed in clean phase accordions with input/output payloads, status indicators, and duration metrics.

### 4. Streamlined Chat Instance Architecture
- **No Manual Tool Loops:** Vercel AI SDK legacy manual loops (`useEffect`, `handledToolsRef`, `isExecutingTools`, `runPendingTool`, `chat.addToolOutput`) are eradicated. Tool executions are directly dispatched by `@my-agent/react` through `executeComponentAction`.
- **No Artificial Gating Timeouts:** The 8-second artificial `sendGate` lock and timer have been removed.
- **No Navigation Queue Delays:** `queueYulaPrompt` / `takeQueuedYulaPrompt` queueing has been removed in favor of direct route synchronization.
- **Direct Dispatch:** `yula-chat-instance.tsx` is lightweight (~300 lines) and directly connects to the `@my-agent/react` engine.

### 5. Detailed Session Dump & Audit Trail (`/dump`)
- **Full Trace Export:** `exportDetailedYulaSessionDump` compiles a comprehensive JSON audit trail containing:
  - Session metadata, active agent persona, and model information.
  - Complete chronological message history.
  - Step-by-step human-readable transcript (`stepByStepTranscript`) detailing every user prompt, model reply, tool call, input arguments, and output results.
  - Active UI component states, telemetry metrics, Pi lifecycle events, and memory snapshots.
- **One-Click Access:**
  - **Dock Header Button:** Direct download button with a download icon on both main workspace and side dock headers.
  - **Slash Command:** `/dump` command available in the chat composer palette.

### 6. Multilingual LLM & Context Poisoning Prevention Standard
- **Neutral English System Feedback:** Tool returns (`message`, `hint`, `error`, `directive`) must stay neutral, standard English.
- **Natural Language Mirroring:** Never hardcode instructions forcing a single language (e.g. *"respond only in Turkish"*). The model mirrors the user's conversational language dynamically.
- **Exploration Limit (Max 10 Records Rule):** SQL explorations, schema previews, or job lists must never return more than 10 records to prevent token bloat and hallucination.

### 7. Pi Güvenilirlik Katmanı & 14 Çekirdek Yetenek (@my-agent/core & @my-agent/react)
Yula AI, endüstriyel güvenilirlik için 14 temel motor yeteneği ile donatılmıştır:
1. **✍️ SET_FIELDS / APPLY:** `criteria_form` eylemleri kriterleri reaktif form taslağına hatasız yansıtır.
2. **🚀 SUBMIT (Inline HITL):** Kritik aksiyonlar (`SUBMIT`, `RUN`, `EXPORT`) `hookPipeline.beforeToolCall` ile kullanıcı onayına tabi tutulur.
3. **⚡ Steer (Araya Gir):** Ajan çalışırken kullanıcı anında yönlendirme veya vazgeçme talimatı verebilir (`SteeringQueue.enqueueSteer`).
4. **📥 Follow-up (Takip İşi):** Ajanın mevcut işi bittiğinde ardışık yürütülecek işler kuyruğa alınır (`SteeringQueue.enqueueFollowUp`).
5. **✂️ Dual-Bound Truncation:** UI aksiyon çıktıları hem satır (`maxLines`) hem bayt (`maxBytes`) sınırıyla kırpılarak token ve hafıza şişmesi engellenir.
6. **⛓️ Mutation Line (Atomik Sıralama):** `globalMutationLine` tüm UI mutasyonlarını FIFO sırasında işleterek yarış durumlarını (race conditions) ortadan kaldırır.
7. **🌊 Adaptive Publisher (60 FPS):** Yüksek frekanslı olaylar 16ms'lik animasyon penceresinde batch edilerek UI render yükü minimize edilir.
8. **🔁 Retry Backoff:** Geçici ağ kopmalarında katlanarak artan gecikmeyle (exponential backoff) otomatik kurtarma sağlanır (`retryWithBackoff`).
9. **🧠 Memory (Kalıcı Tercih):** `remember_fact` ve `recall_fact` ile kullanıcı tercihleri `session` veya kalıcı `localStorage` ortamında saklanır.
10. **🔌 Plugin Registry (`yula-plugins.ts`):** Tahminleme, harici servisler ve analitik modülleri dinamik olarak sisteme kaydedilir (`pluginRegistry`).
11. **🛤️ Multi-Lane Scheduler:** DuckDB RAG indeksleme ve ağır arka plan işleri `multiLaneScheduler.enqueue('background', ...)` ile interaktif sohbet şeridinden tamamen izole edilir.
12. **⏱️ Deferred Manager (Askıya Al & Uyandır):** Rapor işi başladığında ajan askıya alınır (`deferredManager.createDeferred`), Arrow Job SSE terminal olayı (`Completed`/`Failed`) geldiğinde ajanı otomatik uyandırır (`deferredManager.resume`).
13. **🔄 Reconciliation Engine (Kurtarma):** Uygulama açılışında `reconciliationEngine.reconcile()` çalışarak tarayıcı yenilemesi sonrası askıda kalan kilitleri ve yetim durumları mühürler.
14. **🌐 Remote RPC (JSON-RPC 2.0):** Worker ve AI sidecar iletişimi için tip güvenli JSON-RPC 2.0 köprüsü (`yula-rpc-client.ts`).

### 8. Akış İçi (Inline) Onay & HITL Standardı (No Modals)
- **Modal Yasağı:** Yula paneli her ekran boyutunda Side Dock / Drawer form faktörünü korur. Ekranın ortasına veya sohbetin üstüne popup modal (`HitlModal`) açmak kesinlikle yasaktır; modal yaklaşımı dar ekranlarda taşma yapar, akışı koparır ve denetim izini (audit trail) gizler.
- **Akış İçi Onay Kartları (`YulaChoiceCard`):** Kullanıcı teyidi ve seçenek sorma işlemleri yalnızca akış içi `ask_user_choice` veya `request_user_confirmation` mekanizmaları ile mesaj dizisi içine eklenen etkileşimli çip/buton kartları üzerinden yürütülür.
- **Audit Trail & Yeniden Oynatma:** Kullanıcının verdiği her onay veya ret kararı sohbet geçmişinde birer mesaj/araç çıktısı olarak kalıcılaşır ve `/dump` raporuna eksiksiz yansır.

### 9. Doğal Bileşen Sarmalama (`useAgentComponent`) & Execution Panel Standardı
- **Dışarıdan Tool Yamalama Yasağı (No External Tool Band-Aids):** Bir UI bileşeni (çalışma geçmişi, sonuç ızgarası, varlık formu vb.) asla dışarıdan rastgele tool calling fonksiyonları veya dağınık store çağrılarıyla yamalanmamalıdır. Her interaktif bileşen doğrudan `@my-agent/react` paketindeki `useAgentComponent` kancası ile kendi yaşam döngüsünde (`mount`/`unmount`) sisteme kaydolmalı ve `onAction` işleyicisine sahip olmalıdır.
- **Unified Execution Panel (`job_history`):** `<ArrowJobExecutionsPanel />` bileşeni mount olduğunda doğrudan `job_history` ID'si ile kaydolur. Canlı çalışma verilerini (`itemsCount`, `total`, `selectedJobId`, son 10 çalışmanın özet detayları `recentExecutions`) `meta` olarak **0 ms**'de modele sunar. Desteklediği aksiyonlar: `LIST`, `SELECT`, `REFRESH`, `CANCEL`. Model, geçmiş çalıştırma sorularına anında elindeki bu canlı `meta` ile cevap verir.
- **Result Grid (`result_grid:active`):** `<ArrowReportGrid />` bileşeni mount olduğunda `result_grid:active` olarak kaydolur. Tablo adı (`duckTableName`), sütunlar, satır sayısı ve aktif filtreler canlı `meta` olarak expose edilir. Desteklediği aksiyonlar: `RUN_SQL`, `FILTER`, `APPLY_FILTERS`, `SORT`, `COLUMNS`, `PIN`, `RESET_LAYOUT`, `EXPORT`, `VISUALIZE`, `ANALYZE`, `PROFILE`.

### 10. Prompt Pruning, Single Form & Aktif Ekran Topraklaması (Grounding)
- **Sabit 6 Standart Araç Kuralı (Max 6 Standard Tools):** LLM'e asla 20+ tekil araç register edilmez. Model her zaman yalnızca 6 evrensel araç alır (`STANDARD_AGENT_TOOLS`: `dispatch_component_action`, `inspect_ui_state`, `ask_user_choice`, `time_travel`, `remember_fact`, `recall_fact`).
- **Sistem Promptunda Tek Form Kuralı (`filterRelevantComponents`):** Headless sistem bileşenleri arka planda tüm raporları kaydetse bile, kullanıcı belirli bir rapor ekranındayken sistem promptuna **tüm 15 raporun form sözleşmeleri dökülemez** (~4000 token israfı ve dikkat dağınıklığı yasaktır). `filterRelevantComponents` ile inaktif rapor formları budanır; promptta yalnızca aktif rotanın formu (`criteria_form:<activeScope>`), evrensel araçlar (`app_router`, `job_history`) ve sonuç ızgarası yer alır.
- **Master Data (Entity Form) vs. Criteria Form Ayrımı:** `criteria_form:<scope>` kimliği yalnızca `REGISTERED_REPORTS` içinde kayıtlı rapor ekranları içindir. Stok kartı, cari kart vb. master-data ekranları asla `criteria_form` olarak kaydedilemez; `entity_form:<entity_name>` (`SET_FIELDS`, `SWITCH_TAB`, `READ`) kimliğiyle kaydolmalıdır.
- **Aktif Ekran Bağlam Kuralı (Active Screen Grounding):** Kullanıcı spesifik bir ekrandayken (örneğin `/stock/stock-balance`), çalışma geçmişi, kayıt sayısı, filtreleme veya çalıştırma sorduğunda (örneğin *"kaç rapor çalışmış"*, *"önceki sonuçları aç"*, *"filtrele"*), model **asla kullanıcıya hangi rapor olduğunu sormaz**; doğrudan o ekrandaki aktif raporu ve aktif bileşeni baz alarak yanıt üretir.

### 11. İş Alanından ve Dilden Bağımsız Genel UI Kontrolleri Standardı (Domain-Agnostic & Language-Agnostic UI Primitives)
- **Sıfır Alan Bağımlılığı (Zero Domain Coupling in Shared Components):** Platform ve genel kullanım amaçlı arayüz kontrolleri (`YulaChoiceCard`, `YulaQuestionnaireCard`, `YulaSuggestionChips`, `ArrowReportGrid`, `ArrowJobExecutionsPanel` vb.) kesinlikle belirli bir iş alanına (`retail`, `stock`, `finance`, `manufacturing`) veya modül mantığına özel kod, koşul, başlık veya veri tipi barındıramaz.
- **Saf Yeniden Kullanılabilir Kontroller (Pure Reusable Primitives):** Genel bileşenler yalnızca dışarıdan kontrat olarak aldıkları soyut verileri (`question`, `options`, `columns`, `items`, `status`) saf (pure) olarak render eder. "Perakende satış", "stok bakiyesi" gibi etki alanına özel ifadeler asla bileşen içine gömülemez; bu içerikler yalnızca çalışma anında (runtime) ilgili ekranın manifestosundan, şemasından veya modelin dinamik girdisinden akar.
- **Dilden Tam İzolasyon (Zero Hardcoded Language Strings):** Paylaşılan arayüz bileşenleri ve çekirdek kütüphaneler hiçbir dilde (Türkçe, İngilizce vb.) sabit string içeremez. Kullanıcıya gösterilecek tüm statik etiket ve varsayılan metinler münhasıran `next-intl` sözlüklerinden (`messages/*.json`) çözülür; dinamik içerikler ise modele ve kullanıcı girdisine bırakılır.

---

## 🛡️ Verification & Clean Architecture Guardrails

Every agent and developer modifying `yula.client` MUST adhere to these strict guardrails:

1. **Strict 500-Line Limit Per File:**
   Every single file MUST stay under 500 lines of code (`wc -l`). Files exceeding 450 lines must be proactively split into modular helpers or subcomponents.
2. **Zero TypeScript Errors:**
   `pnpm run typecheck` must pass with 0 errors (`tsc --noEmit`).
3. **100% Test Pass Rate:**
   `pnpm test` must pass all test suites cleanly.
4. **Zero Legacy Vercel AI SDK Client Imports:**
   Do not introduce `useChat` or Vercel AI SDK client hooks into UI components; always use `@my-agent/react`.
