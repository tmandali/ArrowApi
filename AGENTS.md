# ArrowApi

## Yula Client (Next.js frontend)

For architecture decisions and directory structure rules, see: **`src/Sims/yula.client/AGENTS.md`**
(read it in every session).

Quick summary:
- **Shell (host)** = root skeleton: routing, layout, sidebar, Yula, global pages.
- **Workspace** = independent work area; its content lives under `src/workspaces/<workspace>/`, `src/app/` holds thin wrappers only.
- **Domain Workspace vs. Platform Core**: Platform infrastructure modules (`auth`, `jobs`, `reports`, `report-criteria`, `system`, `settings`) live under `src/features/<feature>/`. Independent work areas (`stock`, `selling`, `subcontracting`, `accounting`, `manufacturing`) live under `src/workspaces/<workspace>/`.
- **Workspace Route Standard**: The workspace root (`/<workspace>`) is the general landing screen; summary dashboards and KPI screens live on the standard sub-route (`/<workspace>/dashboard`).
- Each workspace **registers itself** via `workspace.config.ts` + `routes.ts` + `index.ts`; `src/lib/workspace-registry.ts` collects all modules dynamically.
- **Declarative YAML Agent Manifest & Command Registry**: No hardcoded commands or prompts in code. All system, grid, and workspace-level agent/command capabilities are declared in the relevant `src/workspaces/<workspace>/agents/*.agent.yaml` (or `src/features/system/agents/`) manifest files and loaded dynamically through `yula-commands.ts`.
- Do not touch shadcn `components/ui/*`; protected by `.oxlintrc.json` overrides.
- Hooks and Providers in separate files (Fast Refresh).
- **Workspaces will later split via module federation** (each a separate React remote);
  preserve workspace boundaries on every change, cross-workspace imports are forbidden, outsiders consume only the workspace's `index.ts` (Public API) entry point.
- **Large Data Reports**: Shared `<ArrowReportGrid />` component with W3C OPFS local disk cache and the DuckDB WASM engine. After F5, reports open from disk with zero internet cost.
- **Tauri 2.0 Desktop & Hybrid Web**: The project runs both in the browser (`npm run dev`) and on desktop (`npm run tauri:dev`). Tauri dependencies are dynamically isolated via `isTauriEnv`.
- **Embedded Python AI Sidecar**: Bidirectional Tool Calling over a `sys.stdin`/`sys.stdout` JSON stream with a `toolRegistry` bridge.
- **Context-Aware & Scoped AI Agent**: 3-level hierarchical scope (Global > Workspace > Page Scope), dynamic tool registration/cleanup via `useScreenAgentContext`, bidirectional live React state sharing, State-Driven Tool Swapping (Criteria vs Results mode), Few-Shot Data Grounding (column mapping via sample rows), and smart cross-workspace routing.
- **3-Layer Yula AI Agent Core Tool Architecture**:
  - **Layer 1 (Virtual Spreadsheet UI Tools)**: `set_grid_query` (DuckDB view/GROUP BY), `set_grid_sort`, `configure_grid_columns`, `pin_grid_columns`, `apply_grid_filters`, `reset_grid_layout`, `export_grid_data`.
  - **Layer 2 (DuckDB SQL Tools)**: `run_expert_sql` (read-only SQL analytics), `profile_grid_table` (data quality/anomalies), `analyze_grid_data` (fast KPIs), `visualize_grid_data` (charts).
  - **Layer 3 (Criteria Input Engine & Job Lifecycle)**: `validate_criteria_input` (D365/BC syntax: `100..200`, `..2026-08-31`, `dün`, `geçen hafta`, `required`, `enum`), `get_current_criteria` (live form draft reading & validation), `apply_criteria`, `run_job` (single execution tool; `report` is a registered scope enum), `list_report_executions`, `cancel_job`, `open_last_report`.
- **2-Stage Hybrid AI Router (Fast Intent Router + selected LLM)**: High-confidence report and suggestion requests resolve instantly via the local schema matcher (**~12 ms**); free-form requests go to the model on the active provider (default Microsoft Foundry / Azure, also OpenAI or local Ollama). Chat is provider-agnostic via `streamText({ tools })`; SDK selection lives in the `yula-provider.ts` adapter. AI telemetry is printed to the DevTools console (`🤖 [Yula AI Telemetry]`).
- **Multilingual LLM & Context Poisoning Prevention**: All system feedback in tool outputs (`message`, `hint`, `error`, `directive`, `note`) stays in standard English. Never impose single-language directives; no artificial language regex gates on the client — the response language is determined by the user's preference and LLM semantics.
- **Yula AI Panel (Side Dock)**: The Yula AI panel always keeps its side dock/drawer form regardless of screen size; it never switches to forced fullscreen on small screens.
- **Exploration & Sampling Limit (Max 10 Records Rule)**: In exploration queries run by Yula AI (`run_expert_sql`, `analyze_grid_data`), schema samples (`get_report_schema`, `sampleRows`), or job history lists (`list_report_executions`), **never more than 10 records** may be returned to the model/context. This prevents context bloat, token waste, and model hallucination.
- **Plug-and-Play Workspace Report Registration**: Workspaces declare reports via `YulaReportCardConfig` and the structured `x-ai` block of the JSON Schema (`aliases`, `quickPrompts`, `columnAliases`); they auto-register with both the Fast Router and the LLM without touching AI internals.
- **Native Auto-Updater**: Update checks never pollute the web UI — they run only through the macOS/Windows native menu (`Check for Updates...`) and Rust dialogs.

### 📋 Checklist When Adding a New Report / Agent (Step by Step)
When a new report or agent command is added to the project, apply the following steps without exception:

1. **JSON Schema Definition (`schemas/<report>-criteria.schema.json`):**
   - Define the criteria schema with `x-scope`, `x-page-path`, `x-job-endpoint`, and `x-ai` (`aliases`, `quickPrompts`, `resultsPrompts`, `columnHints`) fields.
2. **YAML Agent Manifest Definition (`src/workspaces/<workspace>/agents/<name>.agent.yaml`):**
   - When a new workspace or feature command/agent capability is needed, define the YAML manifest file in the relevant `agents/` folder instead of writing hardcoded code.
3. **Report Registration (`src/features/reports/report-registry.ts`):**
   - Export the created JSON schema through the relevant workspace's `index.ts` Public API and add it to the `REGISTERED_REPORTS` array with `scope`, `workspace`, `title`, `pagePath`, `aliases`, and `fullSchema`.
4. **Next.js Route Page (`src/app/`):**
   - Report Screen: `src/app/<workspace>/<report>/page.tsx` (single-page standard: criteria filters, execution history, and the result DuckDB grid are unified on one page; direct job links open via the `?jobId=<guid>` parameter).
5. **Result Screen Component (`<Report>ResultGrid.tsx`):**
   - Build the report result component on the standard OPFS + DuckDB WASM-backed `<ArrowReportGrid jobId={jobId} jobUrl={reportUrl} reportScope="<scope>" ... />` and bind it to the Form's `renderResult` prop.
6. **Path & Title Formatting (`src/lib/workspace-paths.ts`):**
   - Add the report's Turkish label to the `formatPathnameLabel(pathname)` function (`if (pathname.includes("/<workspace>/<report>")) return "<Rapor Adı>"`).

### 📊 Report Lifecycle, Single-Page Architecture, and SSE Flow

#### 1. Single-Page Architecture (Single-Page Unified Report Flow)
- The report route always lives under `src/app/<workspace>/<report>/page.tsx`. Instead of separate old `[jobId]` pages, the `?jobId=<guid>` URL query parameter is used (legacy `/[jobId]` folders `redirect` to the `?jobId=` format for backward compatibility).
- The report screen consists of 3 core blocks:
  1. **Criteria Filter Form (`<Report>Form.tsx` & `<Report>Filter.tsx`)**: The user enters criteria or fills them via AI with schema-based completion.
  2. **Unified Execution Panel (`<ArrowJobExecutionsPanel />`)**:
     - Past executions list on the left (date, duration, row count, status icon).
     - Selected job's criteria (JSON or criteria table) and live progress stream (`<RunProgressSteps />`) on the right.
     - A delete trash icon appears on hover over `Completed`, `Failed`, and `Cancelled` jobs.
     - `Cancel` actions for running jobs and `Delete` actions for terminated jobs are integrated in the page header and the panel.
  3. **Result Grid Panel (`<ArrowJobResultPanel />` & `<ArrowReportGrid />`)**: Serves large data with zero memory overhead via DuckDB WASM and the W3C OPFS disk cache.

#### 2. SSE Live Event Stream (Server-Sent Events)
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
