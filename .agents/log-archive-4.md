# ArrowApi Developer Agent Decision & Evolution Log — Archive 4

This document archives historic architectural decisions from September 2026 to adhere to the repository's 500-line rule (`AGENTS.md` Rule 2).

---

## [2026-09-21] Typesafe Component Family and Dispatch Architecture (`JobComponentFamily`, `ComponentFamily`)
- **Rationale:**
  1. *Fragmented Naming & Silent Failures:* Job components were addressed by three disparate aliases (`arrow_job`, `arrow_job_manager`, `job_history`). In `my-agent-pi-bridge.ts`, only `job_history` was handled, causing `arrow_job` cancel/status calls to fall back into generic labels without proper trace descriptions.
  2. *Compile-Time Safety vs Untyped Strings:* While actions had union types (`JobHistoryAction`, `CriteriaFormAction`), `component_id` was an arbitrary untyped string. TypeScript could not prevent incompatible actions being sent to component families (e.g. sending `CANCEL` to `criteria_form`).
- **Decision:**
  - **Typesafe Family Contracts (`dispatch-types.ts`):** Defined `JobComponentFamily` ("arrow_job" | "arrow_job_manager" | "job_history") and `ComponentFamily`, accompanied by runtime type guards `isJobFamily` and `isComponentFamily`.
  - **Colocated Action Types & Hub Aggregation:** Relocated action type unions (`CriteriaFormAction`, `ResultGridAction`, `AppRouterAction`, `JobHistoryAction`, `WasmSqlAction`) into their respective `*-contracts.ts` definition files (Single Source of Truth), importing and aggregating them into `dispatch-types.ts`.
  - **Component ID Parser & Literal Types (`parseComponentId`, `ComponentId`):** Extracted `parseComponentId` to safely separate family from `subId` across colons, supporting scoped component IDs (`${ComponentFamily}:${string}`).
  - **Pi Bridge & Dispatch Synchronization:** Replaced fragile manual OR-checks with `isJobFamily` across `dispatch-bridge.ts` and `my-agent-pi-bridge.ts`, providing dedicated trace labels (`Cancelled job`, `Job execution`) for in-flight job actions.
  - **Verification:** 325/325 unit tests pass (including 9 new tests in `dispatch-types.test.ts`), 0 oxlint warnings/errors, all files strictly $\le 500$ lines (`dispatch-bridge.ts`: 386 lines, `dispatch-types.ts`: 118 lines).
- **Author:** Antigravity / Team

---

## [2026-09-21] Decoupling & Relocation of VirtualSpreadsheet to Standalone Component
- **Rationale:**
  1. *Domain Independence:* `VirtualSpreadsheet` was historically placed inside `features/jobs/components/` as a job result viewer. In reality, it is a generic, high-performance in-browser spreadsheet component (`VirtualSpreadsheet<T>`) independent of Arrow Jobs.
  2. *Modular Architecture:* Decoupled the spreadsheet engine and its 10 hooks from the backend computation domain, elevating it to a first-class shared UI component.
- **Decision:**
  - **Relocated Standalone Subsystem:** Moved `VirtualSpreadsheet` and its hooks, types, Canvas 2D sizing, and test suite to `src/components/virtual-spreadsheet/`.
  - **Backward-Compatible Proxy:** Converted `src/features/jobs/components/VirtualSpreadsheet.tsx` into a thin proxy re-exporting types and component. Updated report-grid consumers and `package.json`'s `test:grid` script.
  - **Verification:** 8/8 grid tests pass (`npm run test:grid`), 309/309 client tests pass, 0 oxlint warnings/errors, 0 tsc errors, all files $\le 500$ lines (`VirtualSpreadsheet.tsx`: 478 lines, `arrow-report-grid.tsx`: 489 lines).
- **Author:** Antigravity / Team

---

## [2026-09-21] Arrow Jobs Domain Types Relocation & Decoupling from Yula Namespace
- **Rationale:**
  1. *Domain Ownership & Layering:* `YulaActiveJobSummary` and `YulaJobContext` were previously declared inside prompt formatting utilities and loosely associated with the Yula client app. In reality, Arrow Jobs are a general distributed compute engine (`Arrow.Jobs`) on the backend (`ArrowJobModels.cs`), independent of Yula.
  2. *Status Completeness & Type Safety:* Jobs exist in multiple states beyond "active" (e.g. `Queued`, `Running`, `Completed`, `Failed`, `Cancelled`, `Idle`). Confining the naming to `ActiveJobSummary` obscured terminal and pending lifecycle phases.
- **Decision:**
  - **Canonical Domain Model (`src/features/jobs/types.ts`):** Moved canonical models (`ArrowJobLifecycleState`, `normalizeJobState`, `isTerminalJobState`, `ArrowJobSummary`, `ArrowJobContext`) into `types.ts` alongside existing job domain types.
  - **Backward-Compatible Aliasing:** Preserved `YulaActiveJobSummary = ArrowJobSummary` and `YulaJobContext = ArrowJobContext` aliases in `types.ts`, `job-agent-grounding.ts`, and `yula-agent-prompt.ts`.
  - **Verification:** 309/309 tests passing, 0 oxlint warnings/errors, 0 tsc errors, all files strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Arrow Jobs Decoupled State Machine (`arrow_job`) and Catalog Manager (`arrow_job_manager`)
- **Rationale:**
  1. *Jobs as State Machines, Not Static Panels:* Arrow Jobs transition across 5 discrete lifecycle states (`queued` -> `running` -> `completed` | `failed` | `cancelled`). Treating them merely as an "active" flag or blending them into `job_history` conflated the runtime execution monitor with the archival history catalog.
  2. *Clear ReAct Responsibility:* An agent cancelling or inspecting an in-flight computation should target `arrow_job`, whereas listing, selecting, or searching historical executions should target `arrow_job_manager`.
- **Decision:**
  - **Focused Job State Machine (`arrow_job` & `useArrowJobAgent`):** Created `useArrowJobAgent` (200 lines) binding `id: "arrow_job"`. Manages state-aware metadata (`status`, `phase`, `currentStep`, `durationMs`, `totalRows`, `error`), lifecycle events (`job_started`, `job_progress`, `job_completed`, `job_failed`, `job_cancelled`), and actions (`CANCEL`, `GET_STATUS`, `GET_SUMMARY`).
  - **Catalog Manager (`arrow_job_manager` & `useJobExecutionsAgent`):** Refactored `useJobExecutionsAgent` (206 lines) to focus on catalog management (`LIST`, `SELECT`, `OPEN_LAST`, `FIND`, `REFRESH`). Simultaneously registers `job_history` for 100% backward compatibility.
  - **Dispatch Bridge & Prompt Grounding:** Updated `dispatch-bridge.ts` to route actions for `arrow_job`, `arrow_job_manager`, and `job_history`. Updated `yula-agent-prompt.ts` with explicit ReAct guidance and state-aware prompt grounding.
  - **Verification:** 307/307 tests pass, 0 oxlint errors/warnings, 0 tsc errors, all files strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Colocated Component AI Architecture (VirtualGrid, CriteriaGrid, LocalSqlEngine)
- **Rationale:**
  1. *Monolithic Prompt Bloat:* `yula-agent-prompt.ts` had bloated to 477 lines, dangerously close to the 500-line ceiling (Rule 2). It centralized internal state formatting, DuckDB table naming, view mode string logic, and action contracts for generic UI components (VirtualGrid, CriteriaForm, DuckDB).
  2. *Violation of Feature-First Colocation:* Each generic component should own its AI capabilities (prompt grounding, action contracts, metadata type guards, and hooks) rather than relying on a global prompt builder knowing every component's internal structure.
- **Decision:**
  - **VirtualGrid AI Module (`features/jobs/components/report-grid/ai/`):** Created `grid-agent-grounding.ts` (pure TypeScript, server-safe) encapsulating `YulaGridContext`, `ResultGridMetaPayload`, `isResultGridMeta`, `resolveEffectiveGrid`, and `formatGridPromptGrounding`. Re-exported contracts from `index.ts`. Added isolated unit test `grid-agent-grounding.test.ts`.
  - **CriteriaGrid AI Module (`features/report-criteria/ai/`):** Created `criteria-agent-grounding.ts` and `index.ts` encapsulating active report context rules, direct execution directives, and criteria contracts. Added isolated unit test `criteria-agent-grounding.test.ts`.
  - **Local SQL Engine AI Module (`services/duckdb/ai/`):** Created `duckdb-agent-grounding.ts` and `index.ts` encapsulating DuckDB engine constants (`DUCKDB_ACTIVE_VIEW_NAME`) and read-only execution directives.
  - **Orchestrator Delegation & Line Reduction:** `yula-agent-prompt.ts` delegates to `formatGridPromptGrounding` and `formatCriteriaPromptGrounding`, while maintaining 100% backward-compatible re-exports. Reduced `yula-agent-prompt.ts` from 477 lines down to 346 lines (-131 lines).
  - **Verification:** 300/300 unit tests pass, 0 oxlint errors, 0 tsc errors, all files strictly comply with the 500-line limit.
- **Author:** Antigravity / Team

---

## [2026-09-21] Explicit Base Table vs Active Saved Query Distinction in Telemetry, Component Meta & System Prompt
- **Rationale:**
  1. *Ambiguous View State in Telemetry:* When users navigated between saved queries or reverted to the base table, `VIEW_TRANSFORMED` emitted only `{ viewId, title, query }` to `uiEventBus.recordTelemetry`. It omitted the physical DuckDB table name (`baseTable`), the active view name (`activeView`), and `isBaseTable: boolean`. Additionally, it was never emitted to `@my-agent/react` component ring buffer via `emit("view_transformed", ...)`.
  2. *Incomplete Component Metadata:* `useResultGridAgent` was called in `arrow-report-grid.tsx` without passing `customQueryTitle`, `activeAiViewId`, or `savedViews`. Consequently, `result_grid:active.meta` lacked visibility into the currently active saved query or the catalog of available views.
  3. *Unclear LLM System Prompt Grounding:* `buildSystemPrompt` previously displayed `Active table: <tableName>` without explicitly distinguishing the physical base table (which holds all raw detail records) from the active screen view (which may be grouped or projected by a saved query).
- **Decision:**
  - **Enriched Hook Contracts (`use-result-grid-agent.ts`):** Extended `UseResultGridAgentOptions` with `customQueryTitle`, `activeAiViewId`, and `savedViews`. Registered `baseTable`, `isBaseTable`, `activeView`, `activeAiViewId`, `customQueryTitle`, and `savedViews` into `result_grid:active.meta`. Updated `events.view_transformed` schema to enforce `{ baseTable, activeView, isBaseTable, viewId, title, query, rowCount }`.
  - **Component Event & Telemetry Parity (`use-result-grid-agent.ts`):** In `handleViewTransformed`, both `emit("view_transformed", payload)` and `uiEventBus.recordTelemetry` are invoked with the complete payload. Added automatic transition tracking via `useEffect` ref across `[isTableReady, activeAiViewId, customQuerySql, customQueryTitle]` so transitions from tab selection, agent `RUN_SQL`, or `RESET_LAYOUT` are always captured.
  - **Props Threading & Line Economy (`arrow-report-grid.tsx`):** Threaded `customQueryTitle`, `activeAiViewId`, and `savedViews` into `useResultGridAgent` while compacting the `yulaContext` dependency array to maintain the file strictly at 489 lines ($\le 500$).
  - **Clear Prompt Grounding (`yula-agent-prompt.ts`):** Grounded `VIEW MODE: SAVED QUERY [ID: "..."]` vs `BASE TABLE VIEW`, explicit `• Base Physical Table: "<baseTable>" (Stores all raw detail records)`, `• Active Screen View: "active_view"`, and `AVAILABLE SAVED VIEWS: [...]`.
  - **Verification:** 295/295 tests pass, 0 oxlint warnings/errors, clean `tsc --noEmit`, all modified files comply with the 500-line rule.
- **Author:** Antigravity / Team

---

## [2026-09-23] ScreenContract Standard, Pre-Flight Circuit Breaker & 100% CI Route Coverage
- **Rationale:**
  1. *Context Leakage & Hallucination on Non-Report Screens:* Opening management screens like `/my/agents` resulted in stale report titles (e.g. Retail Sales Report) being fed to LLMs due to non-reactive route synchronization in `YulaChatProvider` and conversational history pollution.
  2. *Lack of Code-Safe Screen Boundaries:* Screens lacked deterministic capability declarations, leading to ambiguous LLM interpretations and brittle string-based prompt directives.
  3. *Unprotected Auth & Security Boundaries:* Sensitive routes (e.g. `/(auth)/*`, password changes) required deterministic local pre-flight blocking without making external LLM calls.
- **Decision:**
  - **Deterministic 4-Tier Screen Contract Standard (`screen-contract.ts`):** Defined `ScreenCategory` (`interactive_operator`, `report_results`, `workspace_hub`, `restricted`) backed by Zod schemas via `defineScreenContract()`.
  - **Client-Side Pre-Flight Circuit Breaker (`yula-chat-instance.tsx`):** Added synchronous route gatekeeping in `sendMessageText` that intercepts restricted routes locally, immediately outputting an assistant notification with 0 external API calls and 0 token cost.
  - **Typed Screen Binding Hook (`use-screen-contract.ts`):** Built a unified hook wrapping `@my-agent/react`'s `useAgentComponent` and `useScreenAgentContext` ensuring 100% compile-time type safety for component action handlers.
  - **Comprehensive Screen Migration:**
    - Personal & System Management: `AgentEditorContract`, `SkillEditorContract`, `PluginsRegistryContract`, `MemoryManagementContract`, `PlaybooksManagementContract`, `UserSettingsContract`, and `SystemUsersContract`.
    - Stock Entity Management: `StockItemContract` with field toggles and multi-tab switching.
    - Reporting Contracts: `StockBalanceReportContract`, `StockAnalyticsReportContract`, `RetailSalesReportContract`, and `StockLedgerReportContract`.
    - Workspace Hub Contracts: `RootWorkspaceHubContract`, `StockWorkspaceHubContract`, `AccountingWorkspaceHubContract`, `SellingWorkspaceHubContract`, `ManufacturingWorkspaceHubContract`, `SubcontractingWorkspaceHubContract`, and `FinancialReportsHubContract`.
  - **100% CI Route Coverage Suite (`screen-contract-coverage.test.ts`):** Implemented an automated test that dynamically scans all `src/app/**/page.tsx` routes, asserting valid category resolution and circuit-breaker compliance, failing CI if any new page is added without contract classification.
- **Verification:** 428/428 tests passed across 98 suites (100% pass rate), clean static checks, zero Oxlint errors, and all files strictly comply with the 500-line rule.
- **Author:** Antigravity / Team

---

## [2026-09-23] Unified useScreenBinding, Direct RPC, Bidirectional State Mirroring & Multi-Screen Journey
- **Rationale:**
  1. *Dual-Store & Redundant Registration Overhead:* Previously, screens maintained split state across `useScreenAgentContext` and `useAgentComponent`, leading to code duplication and synchronization lag.
  2. *EventBus String Pub/Sub Bottleneck:* Intra-screen actions (`SET_FIELDS`, `SWITCH_TAB`, `SAVE`) relied on loose string-based EventBus dispatch, resulting in `unhandled-entity-form` errors and lack of direct handler return values.
  3. *Lack of Bidirectional Full-Duplex State Sync:* The LLM operated with only past event telemetry without direct visibility into real-time React DOM state.
  4. *Multi-Screen Amnesia & Hallucination:* As users transitioned between screens during a single LLM session, models lacked awareness of previously visited pages and final state snapshots.
- **Decision:**
  - **Unified `useScreenBinding` Hook (`use-screen-binding.ts`):** Created the canonical single-door binding hook unifying React state, `@my-agent/react` component registration, `useYulaGridStore` backward compatibility, automatic i18n localization, and session journey logging. `use-screen-contract.ts` is unified as a direct re-export.
  - **Direct RPC Execution (`dispatch-bridge.ts`):** Refactored `executeDispatchComponentAction` to directly invoke mounted UI component handlers via `uiEventBus.dispatch(component_id, action, args)` (and subId fallback), awaiting Promise outcomes and returning `{ status: "ok", ...result }` without unhandled errors.
  - **Bidirectional Live State Mirroring (`yula-agent-prompt.ts`):** `useScreenBinding` mirrors `state` into `uiRegistry` `meta.state`. The server system prompt builder injects `=== LIVE SCREEN STATE (Real-time DOM State Mirror) ===` on every turn for 0-latency upstream awareness.
  - **Multi-Screen Session Journey Engine (`screen-journey-store.ts`):** Tracks navigation entries, timestamps, and exit snapshots (`getExitSnapshot()`). Headless `session_journey` component in `useHeadlessSystemComponents` syncs breadcrumbs to `uiRegistry`. `yula-agent-prompt.ts` separates `CURRENT LIVE SCREEN (Active DOM)` from `SESSION SCREEN JOURNEY (Breadcrumbs & Artifacts)`.
  - **Active Screen Domain Guidelines:** Injected dynamic screen rules (`contract.promptGuidelines`) into the system prompt under `=== ACTIVE SCREEN DOMAIN GUIDELINES ===` strictly when the target screen is mounted.
- **Verification:** 434/434 tests passed across 100 suites (100% pass rate in `screen-binding-journey.test.ts`), zero lint/type errors, all source/test/log files strictly comply with the 500-line rule.
- **Author:** Antigravity / Team

---

## [2026-09-23] Reactive ActiveScreenStore, Undo/Rollback Buffer, and Studio Screens State Enrichment
- **Rationale:**
  1. *Decoupling Screen Lifecycle from Grid Store:* Previously, non-grid management and studio screens (`/my/agents`, `/my/settings`, `/system/users`) were registering their screen metadata inside `useYulaGridStore`, creating unnecessary coupling between DuckDB table views and DOM forms.
  2. *Reactivity for Chat Dock & Quick Prompts:* `uiRegistry` is an in-memory JS map that does not trigger React re-renders. When the user changed selections or active tabs, the Chat Dock could not reactively adapt its quick action prompt chips.
  3. *Action Undo / Mutation Safety:* When the AI agent dispatched form modifications via direct RPC (`SET_FIELDS`, `SWITCH_TAB`), previous state was not buffered, preventing 1-click user rollback.
  4. *Studio Screens Migration Completion:* Several studio management hooks (`plugins`, `memory`, `settings`, `playbooks`) lacked explicit `state` and `getExitSnapshot` implementations.
- **Decision:**
  - **Dedicated Reactive Store (`active-screen-store.ts`):** Created `useActiveScreenStore` managing active screen info, live state, reactive `quickPrompts`, `stateHistory` buffer (depth 20), `canUndo`, and `restoreDraft()`.
  - **Single-Door Integration (`use-screen-binding.ts`):** `useScreenBinding` registers with `useActiveScreenStore` on mount, syncs state/prompts changes, and wraps action handlers to push pre-mutation state to the history buffer automatically before executing direct RPC actions.
  - **Studio Screens State Enrichment:**
    - `use-plugins-agent-binding.ts`: Added `state` (`pluginsCount`, `pluginIds`, `pluginNames`) and `getExitSnapshot()`.
    - `use-memory-agent-binding.ts`: Added `state` (`factsCount`, `keys`) and `getExitSnapshot()`.
    - `use-my-settings-agent.ts`: Added `state` (`activeTab`, `email`, `language`, `aiProvider`, `aiModel`, `aiThinkingLevel`) and `getExitSnapshot()`.
    - `use-playbook-agent-binding.ts`: Added `state` (`workspace`, `searchQuery`, `rulesCount`, `workflowsCount`, `selectedWorkflowId`, `viewMode`) and `getExitSnapshot()`.
  - **Unit Testing Suite (`active-screen-store.test.ts`):** Added 5 unit tests verifying active screen setting, selective state updates, undo/rollback mechanics, draft restore from `screenJourneyStore`, and cleanup.
  - **Dual-Registration Legacy Cleanup:** Purged redundant duplicate direct calls to `useScreenAgentContext` in `plugins-tab-view.tsx`, `memory-tab-view.tsx`, `my-settings-form.tsx`, and `ItemFormShell.tsx`; unified all screen binding exclusively through contract hooks.
- **Verification:** 439/439 tests passed across 101 suites (100% green), 0 TypeScript errors (`tsc --noEmit`), 0 Oxlint warnings/errors, all files strictly $\le 500$ lines.
- **Author:** Antigravity / Team
