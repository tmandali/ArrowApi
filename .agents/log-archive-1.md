# ArrowApi Developer Agent Decision & Evolution Log (Archive 1)

Archived decisions from September 2026 to ensure active documentation files strictly satisfy the 500-line limit.

---

## [2026-09-20] Decoupling Built-in Slash Commands (Library Runtime) vs Application Tools (Yula Client)
- **Rationale:** When executing `/yardim skil create` or typing `/yardım` (dotless-i), the command leaked past `@my-agent/core` into `/api/agent/chat` because `/yardım` was not recognized as a registered system command. Consequently, the backend LLM invoked the `ask_user_choice` tool to ask what the user meant while simultaneously rejecting it, whereas `yula-worked-steps.tsx` synthesized an artificial `slash_command (status: ok)` step.
- **Decision:**
  - **Core Library (`@my-agent/core`):** Added `normalizeCommandToken` to normalize Turkish character variants (`ı` vs `i`, case-folding). Explicitly registered `/yardım` as an alias alongside `/yardim` and `/help`.
  - **Client Hook (`@my-agent/react`):** Enhanced `handleBuiltInCommand` in `chat-commands.ts` so that `/help` and `/yardim`/`/yardım` commands—even with argument hints (e.g. `/yardim model` or `/yardim skil create`)—are filtered and resolved 100% locally on the client and always return `true`, completely preventing unintended forwarding to the LLM backend.
  - **Application UI (`yula.client`):**
    - Updated `yula-commands.ts` to include `phase` in `parseYamlCommands` and normalize Turkish characters in `resolveYulaSlashCommand` and `matchYulaCommands`.
    - In `yula-worked-steps.tsx`, excluded `phase === "system"` commands from synthesizing fake tool steps in server turn transcripts, and ensured error states accurately reflect tool failure.
- **Author:** Antigravity / Team

---

## [2026-09-18] Single-Page Unified Report Flow & SSE Anti-Buffering
- **Rationale:** Separate `[jobId]` pages polluted browser history and triggered full reload overhead on navigation.
- **Decision:**
  - Unified report flow under `src/app/<workspace>/<report>/page.tsx?jobId=<guid>`.
  - Configured backend SSE (`ArrowJobSse.cs`) with anti-buffering headers (`X-Accel-Buffering: no`, `Cache-Control: no-transform`) and immediate response body flushing.
  - Built `ArrowJobEventHub` singleton event dispatcher with visual micro-rhythm (~70ms tempo) on the frontend.
- **Author:** Antigravity / Team

---

## [2026-09-10] Headless React UI-Agent (@my-agent) & Tool Consolidation
- **Rationale:** 20+ fragmented manual tool calls overwhelmed the LLM and caused high token waste and reasoning failures.
- **Decision:**
  - Replaced manual tool loops with `@my-agent/core` and `@my-agent/react` featuring 6 standard tools (`STANDARD_AGENT_TOOLS`).
  - Wrapped interactive components natively via `useAgentComponent` in their own React lifecycle.
  - Strictly banned popup modals; implemented inline interactive choice cards (`YulaChoiceCard` via `ask_user_choice`).
- **Author:** Antigravity / Team

---

## [2026-09-20] Client-Side Pyodide Skills & Event Hub Architecture
- **Rationale:** Executing user-created Python skills or data validation scripts on the server introduces significant RCE security vulnerabilities, complex infrastructure scaling, and PII/KVKK privacy risks. Running Python natively in the browser via WebAssembly provides complete process sandboxing, zero server compute overhead, and aligns with the existing DuckDB WASM architecture.
- **Decision:**
  - Integrated Pyodide WebAssembly in an isolated background thread (`pyodide.worker.ts`) pre-loading `pandas`, `openpyxl`, and `numpy`.
  - Implemented `SkillEventHub` extending native `EventTarget` for streaming pub/sub (`stdout`, `stderr`, `progress`, `snapshot`, `replay`).
  - Added a 30s timeout and crash watchdog calling `worker.terminate()` with seamless worker re-spawn.
  - Implemented `duckdb-pyodide-bridge.ts` allowing direct injection of DuckDB WASM tabular records into Pyodide pandas `df`.
  - Implemented `useSkillStore` with Zustand `persist` supporting local `Draft` authoring and `Released` status for DB syncing.
  - Added public exports under `src/features/skills/index.ts` and UI terminal drawer `SkillTerminalDrawer`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Integration of Anthropic Agent Skills (xlsx, pdf, mcp-builder, frontend-design, skill-creator)
- **Rationale:** Equipping the Yula Agent and developers with production-tested domain guidelines for Excel modeling, PDF document extraction, Model Context Protocol server development, distinctive UI design, and meta-skill authoring.
- **Decision:**
  - Added 5 new built-in skills under `src/Sims/yula.client/skills/`: `xlsx`, `pdf`, `mcp-builder`, `frontend-design`, `skill-creator`.
  - Registered all 5 skills into `built-in-skills.ts` and updated `built-in-skills.test.ts`.
  - Linked `xlsx` directly with the Pyodide Web Worker runtime (`openpyxl` & `pandas`).
  - Verified 100% test passing across the test suite (212/212 tests pass).
- **Author:** Antigravity / Team

---

## [2026-09-20] Integration of Document & Presentation Skills (doc-coauthoring, docx, pptx)
- **Rationale:** Providing the Yula Agent with production guidelines for collaborative technical document authoring (PRDs, specs, ADRs), programmatic Word (.docx) document generation via docx-js, and executive PowerPoint (.pptx) slide deck creation.
- **Decision:**
  - Added 3 built-in skills under `src/Sims/yula.client/skills/`: `doc-coauthoring`, `docx`, and `pptx`.
  - Registered all skills into `built-in-skills.ts` and updated `built-in-skills.test.ts` (11 total built-in skills).
  - Validated test suite passing (212/212 pass) and clean lint/types.
- **Author:** Antigravity / Team

---

## [2026-09-20] Graph-Native (Node & Edge) Documentation Standard with Traversable Neighbor Links
- **Rationale:** Flat textual documentation failed to clearly capture the multi-agent control loops, event-driven reactive bridges, and Human-in-the-Loop (HITL) pause/resume flows in the Yula AI and Arrow ecosystem.
- **Decision:**
  - Established the mandatory **Graph-Native Documentation Standard** in `.agents/standards/graph-documentation-standard.md`.
  - Added Rule 5 to root `AGENTS.md` requiring all architecture and agent workflow documents to define Mermaid topology, Nodes catalog, and Edges with feedback loops.
  - Authored canonical master system graph document in `src/yula-ai/agent.md`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Deterministic Local Development Ports & Instant Shutdown Protocol
- **Rationale:** Stopping local development services previously required exploratory port hunting via `lsof`. Deterministic ports allow immediate single-command termination upon user request ("proje kapat").
- **Decision:**
  - Standardized all default ports in `.agents/standards/dev-operations.md`.
  - Defined the instant shutdown one-liner: `kill -9 $(lsof -ti:56402,3000,5168,7137) 2>/dev/null; pkill -f "dotnet run|next-server|yula.client.*next" 2>/dev/null || true`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Documented Core UI Components & Arrow Jobs .NET Engine
- **Rationale:** The application's presentation layer (VirtualSpreadsheet, Criteria Form, Yula Client) and distributed job engine (`Arrow.Jobs.*`) required explicit centralized architecture guides.
- **Decision:**
  - Created `.agents/architecture/core-ui-components.md` and `.agents/architecture/arrow-jobs-engine.md`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Enforced English-Only Documentation & Evolutive Wiki Protocol
- **Rationale:** LLM tokenizers and instruction-following attention mechanisms perform with higher accuracy in English. Documentation must evolve dynamically with user corrections.
- **Decision:**
  - Added 4th Golden Rule to root `AGENTS.md` enforcing English-only repository documentation and Evolutive Wiki Maintenance Protocol.
  - User-agent conversations remain in Turkish.
- **Author:** Antigravity / Team

---

## [2026-09-21] Strict pnpm Package Manager Enforcement across JS/TS Workspaces
- **Rationale:** The repository transitioned to `pnpm` (`packageManager: pnpm@10.15.1`, `pnpm-lock.yaml`), but lack of explicit prohibition in agent instructions led to occasional fallback invocations of `npm test` or `npx tsc`, triggering `.npmrc` configuration warnings and bypassing pnpm resolution.
- **Decision:**
  - Added Rule 5 to `src/Sims/yula.client/AGENTS.md` strictly requiring `pnpm` (`pnpm test`, `pnpm run typecheck`, `pnpm run lint`) and forbidding `npm` / `npx`.
  - Added Section 3 ("Package Manager & Script Runner Standard") to `.agents/standards/dev-operations.md`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Type-Safe UI Telemetry & Upstream Event Stream Architecture
- **Rationale:**
  1. *Asymmetry between Downstream & Upstream:* While downstream actions (Agent -> UI via `dispatch_component_action`) enjoyed strict Zod preflight contracts, upstream interactions (UI -> Agent) relied on loose strings (`source: string`, `type: string`, `payload?: any`), leading to risk of typos, payload schema discrepancies, and token inflation.
  2. *Single-Lifecycle Ambient Sensing:* Rapor job states and manual UI operations (filter changes, route changes, row selections) needed to stream cleanly into the LLM's ring-buffer memory without cancelable blocking queues or page-churn memory leaks.
- **Decision:**
  - **Core Typings (`@my-agent/core`):** Introduced `AppTelemetryEvent` discriminated union (`app_router`, `arrow_job`, `result_grid`, `criteria_form`), `InferEventPayload<T>`, and `ComponentEventEmitter<TEvents>`. Upgraded `IEventBus.recordTelemetry` to support strongly typed contracts with backward compatibility.
  - **Component Inferred Emitter (`@my-agent/react`):** Enhanced `useAgentComponent` to return `{ emit }` typed against declared `events` Zod schemas.
  - **Application Telemetry Stream (`yula.client`):**
    - `arrow-job-hub-stream.ts`: Emits `arrow_job:REPORT_COMPLETED`, `REPORT_CANCELLED`, and `REPORT_FAILED` on terminal states.
    - `use-headless-system-components.ts`: Emits `app_router:ROUTE_CHANGED` on client navigations.
    - `use-result-grid-agent.ts`: Declares `row_selected`, `filter_change`, and emits filter events automatically when filters mutate.
- **Author:** Antigravity / Team

---

## [2026-09-20] ReAct / Plan Mode Badge, Focus Screen Button, and Event Bus Dedup
- **Rationale:** Triggering confirmation cards when the user is already on the target screen slowed down execution; fullscreen overlay also needed an instant way to focus on the underlying page.
- **Decision:**
  - Screen scope (`/stock/stock-balance`) defaults to **Direct ReAct** mode; global scope (`/`, `/dashboard`) defaults to **Plan-First** mode.
  - Added live status badge (`YulaAgentModeChip`: `ReAct`, `Plan`, `Reasoning…`, `Acting…`) to the side dock and fullscreen header.
  - Added `YulaFocusScreenButton` in fullscreen overlay to collapse the dock and focus on the underlying screen with `USER_FOCUS_SCREEN` telemetry.
  - Added 150ms windowed deduplication and coalescing in `uiEventBus`.
- **Author:** Antigravity / Team

---

## [2026-09-21] ActionContract Canonicalization & StrictActionContract Elimination
- **Rationale:** An extra intermediate type `StrictActionContract` was unnecessary since `@my-agent/core` already defines `ActionContract<TIn, TOut>` with required `whenToCall` and `whenNotToCall`.
- **Decision:**
  - Standardized all system contracts (`app_router`, `criteria_form`, `result_grid:active`, `job_history`, `job-detail-tool`) directly on `@my-agent/core`'s `ActionContract`.
  - Enforced schemas and prompts compile-time safety using `satisfies ActionContract`.
  - Deleted redundant `action-contract-types.ts`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Generic Type-Safe ActionHandlersMap & Approach 2 Standardization
- **Rationale:**
  1. *Action Dispatch Boilerplate & Type Insecurity:* Previously, custom hooks and components handling actions had to implement a generic `onAction: async (action: string, payload: any)` callback containing `switch-case` blocks, defensive `typeof` checks, and manual payload casting. Typos in action names were undetected at compile time.
  2. *Approach 2 (Isolated Custom Binding Hooks) Standard:* Inline `useAgentComponent` in complex UI views led to file bloat (e.g. `ItemFormShell.tsx` was 691 lines).
- **Decision:**
  - **Type Inference Primitives (`@my-agent/core`):** Introduced `InferActionInput<T>`, `InferActionOutput<T>`, and `ActionHandlersMap<TActions>` in `types.ts` to infer input and output types directly from Zod `ActionContract` schemas.
  - **Type-Safe `handlers` in `useAgentComponent` (`@my-agent/react`):** Enhanced `useAgentComponent<TActions, TEvents>` with generic action typing and a strongly typed `handlers?: ActionHandlersMap<TActions>` property. Each action key maps to an async handler receiving automatically inferred payload types (`z.infer<TIn>`) and returning typed results. Backward-compatible fallback to `onAction` is preserved.
  - **100% Approach 2 Adoption across `yula.client`:** Extracted dedicated binding hooks (`useJobExecutionsAgent`, `useStockItemAgent`, `useMySettingsAgent`, `usePluginsAgentBinding`, `useMemoryAgentBinding`) and migrated their actions to the new `handlers` map.
  - **File Size Compliance:** Modularized `ItemFormShell.tsx` from 691 lines down to 404 lines ($\le 500$).
- **Author:** Antigravity / Team

---

## [2026-09-20] Procedural Memory & Playbook (Karpathy LLM Wiki Pattern)
- **Rationale:** The AI agent had amnesia regarding screen-specific operational procedures and repeated exploratory trial-and-error queries from scratch on every turn.
- **Decision:**
  - Implemented `PlaybookService`, `MemoryPlaybookStorage`, `RestPlaybookStorage`, and `LocalStoragePlaybookStorage` in `@my-agent/core`.
  - Added `AgentProvider` DI support and `useAgentPlaybook` hook in `@my-agent/react`.
  - Added Markdown-backed server storage (`ServerFsPlaybookStorage`) in `yula.client` under `storage/wiki/workspaces/<workspace>/`.
  - Surfaced active Wiki reading tier (`Workspace Wiki`, `User Wiki`, `System Baseline`) and playbook updates (`propose_playbook_update`) transparently in the Worked Steps UI.
- **Author:** Antigravity / Team

---

## [2026-09-20] Harmonized Card Container & Header Height Chrome between Yula Full Mode and Dock Mode
- **Rationale:** The visual presentation of Yula in `full` mode (3-column IDE overlay) previously felt detached from the Sims workspace design language: columns lacked card boundaries, resize handles were thin border lines rather than standard 8px gutters, and the diagram canvas header had a 2-tier stacked bar (`h-16+`) rather than matching the uniform `h-11` (`panelHeaderClass`) height of dock mode and other workspace cards.
- **Decision:**
  - Standardized all 3 columns inside `panelCardClass` (`rounded-md border bg-card shadow-none`) with `panelResizeHandleClass` (`w-2 bg-transparent`).
  - Standardized canvas header to single `h-11` row matching `panelHeaderClass` (`bg-card`, `border-b border-border px-3`).
- **Author:** Antigravity / Team

---

## [2026-09-20] AppLayout Content-Frame Architecture for Yula Fullscreen Overlay Host
- **Rationale:** `YulaFullscreenOverlay` was mounted deep inside individual page docks, causing layout clipping and trapping within leaf pages.
- **Decision:**
  - Created `yula-fullscreen-host.tsx` mounted inside `AppLayout`'s `<main>` frame with `absolute inset-0 z-40 rounded-t-2xl overflow-hidden`.
  - Extracted shared buttons into `yula-dock-controls.tsx`.
- **Author:** Antigravity / Team

---

## [2026-09-20] 3-Column Antigravity IDE Workspace for Yula Fullscreen Overlay Mode
- **Rationale:** Slide-out right drawers felt cramped in fullscreen mode. A 3-column split view (Left: Sidebar/History, Center: Chat Stream, Right: Diagram Canvas) provides full workspace ergonomics.
- **Decision:** Built `yula-fullscreen-overlay.tsx` using Shadcn `<ResizablePanelGroup orientation="horizontal">` with 3 columns.
- **Author:** Antigravity / Team

---

## [2026-09-20] Artifact & Side Canvas Architecture for Mermaid Diagrams
- **Rationale:** Narrow chat bubbles forced horizontal scroll on wide diagrams.
- **Decision:** Compact `MermaidChip` in chat opening either wide `<Sheet side="right">` (Dock mode) or split `<ResizablePanelGroup>` canvas (Fullscreen mode) via `active-diagram-store.ts`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Dynamic Client-Side Mermaid Integration for Markdown
- **Rationale:** `next-mdx-remote` caused token streaming chokes and RCE security risks.
- **Decision:** Preserved token streaming `react-markdown` and added zero-overhead lazy-loaded `MermaidBlock` with light/dark theme support.
- **Author:** Antigravity / Team

---

## [2026-09-20] Graph-Native (DAG) Architecture for Yula Playbook Wiki
- **Rationale:** Multi-step workflow recipes were prone to hallucinations when stored as free-form prose.
- **Decision:** Implemented `PlaybookDAG` in `@my-agent/core` with Tarjan DFS cycle detection, Kahn's topological sort, and interactive Dagre graph visualization in `WorkflowGraphCanvas.tsx`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Direct 3-Column Fullscreen Workspace for SystemHomeView (Root Path)
- **Rationale:** The system home view (`/`) is the primary landing screen of the Sims application. Having it render a single-column shell with an expand toggle to switch into fullscreen mode was redundant.
- **Decision:** `SystemHomeView` directly renders `YulaFullscreenOverlay` in page flow. Collapse and close controls are omitted on the home view.
- **Author:** Antigravity / Team

---

## [2026-09-20] Auto-Collapse Fullscreen Overlay on Navigation & Header Button Deduplication
- **Rationale:** Duplicate actions in header and overlay trapping during navigation.
- **Decision:** Unified on `YulaExpandToggleButton` [⤢], updated `WorkspaceAiChatProvider` to auto-collapse on route changes, and ensured `expanded` mode is not persisted.
- **Author:** Antigravity / Team

---

## [2026-09-20] Architectural Separation of User Screen Navigation vs In-IDE Interactions
- **Rationale:** Clicking screen navigation elements in Fullscreen Overlay mode signifies intent to view screens, whereas in-IDE interactions (switching chat sessions) should not collapse the overlay.
- **Decision:** Root-level provider mounting, capture-phase navigation interceptor, and clear separation of in-IDE actions (`selectConversation` without `router.push`).
- **Author:** Antigravity / Team

---

## [2026-09-20] Integration of Library Built-in System Commands into Yula Slash Palette
- **Rationale:** The `@my-agent/core` runtime engine and `@my-agent/react` chat hook implement core built-in commands (`/plan`, `/compact`, `/model`, `/help`/`/yardim`, `/new`/`/yeni`), but these were previously absent from `yula.client`'s `system.agent.yaml` slash palette manifest, preventing discoverability and autocomplete for end users.
- **Decision:**
  - **Manifest Registration:** Added `/plan`, `/compact`, `/model`, and `/yardim` to `system.agent.yaml` with explicit icons (`ListTodo`, `Minimize2`, `Cpu`, `HelpCircle`).
  - **Icon Resolution:** Expanded `ICON_MAP` in `yula-commands.ts` with the new Lucide icons.
  - **I18n Localization:** Localized labels, descriptions, and prompts across `tr.json` and `en.json`.
  - **Dual-Language Core Aliases:** Registered `/yeni` and `/yardim` aliases alongside `/new` and `/help` in `prompt-templates.ts` and `chat-commands.ts`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Removal of Legacy Prototype Test Slash Commands & Emptying Skills Seed
- **Rationale:** Following the integration of official Anthropic agent skills (`xlsx`, `pdf`, `docx`, `pptx`, `frontend-design`, `mcp-builder`, `skill-creator`, `doc-coauthoring`), the legacy prototype skills (`/ay-kapanis`, `/sayim-fark`, `/rapor-kalite`, `/gunluk-ozet`) and mock template commands (`/rapor`, `/sirala`, `/csv`, `/geri` in `@my-agent/core`) were obsolete and created confusion in the chat slash palette.
- **Decision:**
  - **Deleted Prototype Skills:** Removed `skills/ay-kapanis`, `skills/sayim-fark`, and `skills/rapor-kalite` from `src/Sims/yula.client/skills`.
  - **Clean Built-in Skills Registry:** `built-in-skills.ts` and its test now register and verify exactly the 8 production Anthropic skills.
  - **Removed Example Skill Seeding:** `ensureExampleSkill` in `user-skills.ts` no longer seeds `gunluk-ozet`; it actively cleans up any existing `gunluk-ozet` entry from user `localStorage`.
  - **Localized Skills Namespace:** `LOCALIZABLE_SKILL_SLASHES` emptied in `yula-user-skill.ts`; removed orphaned commands (`attach`, `grid-top5`, `report-run-job`) and old skill entries from `tr.json` and `en.json`.
  - **Pure Core Templates:** Removed domain-specific mock templates from `prompt-templates.ts` in `@my-agent/core`; system commands (`/new`, `/model`, `/login`, `/compact`, `/plan`, `/help`) preserved.
- **Author:** Antigravity / Team

---

## [2026-09-20] Migration of Management Screens & Dashboards to useScreenAgentContext and entity_form:* Dynamic Tool Binding
- **Rationale:** On screens like `/my/skills`, when a user asked contextual questions such as *"bu skili nasıl test ederim"*, Yula hallucinated unrelated ERP/stock report test instructions because the screen lacked both screen context and dynamic tool registration. The system prompt defaulted to global orchestration mode and injected irrelevant sample report catalog prompts.
- **Decision:**
  - **Controlled Tab Navigation Support:** Added `activeTab` and `onTabChange` to `TabbedDetail` (`tabbed-detail.tsx`), and forwarded them via `ManagementPageTemplate` (`management-page-template.tsx`) so agents can programmatically switch tabs and inspect tab states.
  - **Dedicated Hook Extraction Pattern:** To maintain strict adherence to Golden Rule 2 (500-line ceiling), created dedicated binding hooks (`use-skill-agent-binding.ts`, `use-agent-management-binding.ts`, `use-playbook-agent-binding.ts`, `use-system-users-agent-binding.ts`).
  - **Full Management & Settings Coverage:**
    - Integrated `entity_form:skill_editor` into `SkillManagementView.tsx` (`/my/skills`, `/system/skills`).
    - Integrated `entity_form:agent_editor` into `AgentManagementView.tsx` (`/my/agents`, `/system/agents`).
    - Integrated `entity_form:playbook_manager` into `playbooks-management-view.tsx` (`/my/playbooks`).
    - Integrated `entity_form:user_settings` into `my-settings-form.tsx` (`/my/settings`).
    - Integrated `entity_form:plugin_registry` into `plugins-tab-view.tsx` (`/my/plugins`).
    - Integrated `entity_form:agent_memory` into `memory-tab-view.tsx` (`/my/memory`).
    - Integrated `entity_form:system_users` into `SystemUsersView.tsx` (`/system/users`), refactoring its guests tab into `SystemUsersGuestsTab.tsx`.
  - **Workspace Dashboard Context Grounding:** Integrated `useScreenAgentContext` into `blank-workspace-landing.tsx` across all domain modules (`/stock`, `/accounting`, `/selling`, `/manufacturing`, `/subcontracting`), supplying module titles, descriptions, and contextual quick prompt chips.
- **Author:** Antigravity / Team

---

## [2026-09-20] Architectural Dual-Layer Localization: Library-Agnostic i18n Dictionary vs Application Next-Intl
- **Rationale:**
  1. *Core Library Invariance:* Hardcoded Turkish string checks in `@my-agent/core` and Turkish-only response messages in `@my-agent/react` (`chat-commands.ts`) violated the architectural principle that core agent libraries must be domain-agnostic and language-neutral by default.
  2. *Application UI Localization:* Hardcoded Turkish quick prompts and strings in `yula.client` caused inconsistent multilingual experiences when switching between English and Turkish.
- **Decision:**
  - **Library Layer (`@my-agent/core` & `@my-agent/react`):** Extended `AgentDictionary` with `commandAliases` and `commandResponses`. Fully populated localized command dictionaries in `trDictionary` and `enDictionary`. Dynamic alias resolution in `prompt-templates.ts`. Removed hardcoded strings in `chat-commands.ts`.
  - **Application Layer (`src/Sims/yula.client`):** Standardized all `quickPrompts` passed to `useScreenAgentContext` to use `next-intl` (`useTranslations`). Added prompt message keys across management views in `tr.json` and `en.json`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Upgrading Yula AI with Reference-Pi Patterns & Vercel AI SDK Best Practices (Dynamic Routing, Tool Deltas, Failover, Output Schemas)
- **Rationale:**
  1. *Tool Hallucination & Token Waste:* Providing full tool definitions across all execution phases caused prompt bloat and allowed models to attempt grid SQL queries before data was loaded.
  2. *Unannounced Tool Loadout Transitions:* As UI components mounted/unmounted across routes, models lacked explicit visibility into loadout deltas, causing unmounted tool invocation errors.
  3. *Cloud Provider Outage & Rate Limits:* When Azure OpenAI or primary models returned 429 Rate Limits or 503 Service Unavailable, agent requests failed without transparent failover.
  4. *Untyped Tool Outputs:* Server tools previously lacked formal Zod output schemas, reducing client-side runtime validation confidence.
- **Decision:**
  - **Dynamic Step Routing (`src/Sims/yula.client/src/lib/yula-step-router.ts`):** Integrated `prepareStepRouting` into Vercel AI SDK `prepareStep` to dynamically prune tools based on screen phase and manage token compaction cleanly under the 500-line limit.
  - **Tool Output Schemas (`src/Sims/yula.client/src/lib/server-tools/standard-agent-tools.ts`):** Added explicit Zod `outputSchema` definitions to `remember_fact`, `recall_fact`, `query_playbook`, and `propose_playbook_update`.
  - **Pi Tool Loadout Delta (`packages/agent-core/src/agent-loop.ts`):** Added `declareToolChanges` to detect added/removed tools between turns and inject transparent system notifications (`[Tools Loadout Updated]`).
  - **Adaptive Model Cascading (`prepareNextTurn` in `agent-loop.ts` & `agent.ts`):** Added Pi-style `prepareNextTurn` support enabling turn-to-turn dynamic model promotion and thinking level adjustments.
  - **Provider Resilience & Failover (`src/Sims/yula.client/src/lib/yula-provider-failover.ts`):** Implemented `createFailoverLanguageModel` using AI SDK `wrapLanguageModel`, seamlessly switching from primary (e.g. Azure OpenAI) to secondary fallbacks (OpenAI / Agnes) on 429/5xx errors.
  - **Interactive Simulation Harness (`apps/demo-app`):** Implemented `useAdvancedArchitecturalSimulations.ts` and updated `PiTestPanel.tsx` / `PiDiagnosticsView.tsx` with 4 interactive test scenarios (Tool Loadout Delta, Model Cascading, Provider Failover, Dynamic Step Routing).
- **Author:** Antigravity / Team

---

## [2026-09-20] Modernization of Yula.Client Flows & Removal of Legacy Custom Workarounds
- **Rationale:**
  1. *Prompt Bloat & Redundant Defensive Warnings:* Previously, without dynamic tool pruning (`prepareStep`) and native loop termination (`stopWhen: [hasToolCall("ask_user_choice")]`), system prompts had to explicitly forbid calling criteria forms when unmounted, forbid asking multiple questions, and forbid duplicate tool calls.
  2. *Untyped Client Tools:* While server tools had Zod `outputSchema`, client-executed tools (`dispatch_component_action`, `inspect_ui_state`, `ask_user_choice`, `time_travel`) lacked formal output schemas.
  3. *Arbitrary Sliding Window in Transport Slimming:* `context-slim.ts` previously truncated conversations at 16 messages and cut rows at 800 chars regardless of actual token consumption.
  4. *Component Mount/Unmount Desynchronization:* Active UI components mounted/unmounted without broadcasting explicit `tool_loadout_updated` events to the Pi event stream.
- **Decision:**
  - **Prompt Streamlining (`yula-agent-prompt.ts`):** Removed redundant duplicate tool call prohibitions and defensive prompt walls, relying on engine-level `prepareStepRouting` and `stopWhen`.
  - **Client Tool Output Schemas (`standard-agent-tools.ts`):** Added explicit Zod `outputSchema` definitions to `dispatch_component_action`, `inspect_ui_state`, `ask_user_choice`, and `time_travel`.
  - **Deprecation of Manual Deduplication (`yula-tool-info.ts`):** Deprecated `findDuplicateQuestionCallIds` as native `stopWhen` stops the loop after 1 choice prompt.
  - **Transport Window Consolidation (`context-slim.ts`):** Relaxed arbitrary 16-message transport cutoff to safety-net levels, delegating fine-grained compaction to SDK-native `pruneMessages` inside `prepareStepRouting`.
  - **Tool Loadout Delta Broadcast (`use-agent-component.ts` & `use-screen-agent-context.tsx`):** Connected `piEventStream.emit({ type: 'tool_loadout_updated', added, removed })` on component mount and unmount.
- **Author:** Antigravity / Team

---

## [2026-09-20] Multi-Step ReAct Isolation & Tool Loadout Synchronization (Pi DAG Message Model & Server-Client Tool Bridge)
- **Rationale:**
  1. *Duplicate Visual Artifacts & Preamble Pollution:* In multi-step turns (where the model executed tools before formulating its terminal response), intermediate assistant preambles and draft Mermaid diagrams were concatenated with the terminal response because `computeChatTurns` merged all assistant message parts using `flatMap`.
  2. *Tool Loadout Desynchronization (`query_playbook` missing in client adapter):* `STANDARD_AGENT_TOOLS` on the server and `yula-agent-prompt.ts` included `query_playbook` and `propose_playbook_update`, but `createStandardAgentTools()` in `@my-agent/core/ui-tool-adapter.ts` omitted them, causing an immediate `Tool "query_playbook" not found.` error and triggering an unnecessary fallback recovery turn (resulting in 11-second turn latencies).
  3. *Premature Tool Execution Bridge:* `chat-stream-fn.ts` intercepted server-streamed `tool-input-available` chunks and prematurely terminated the stream with `stopReason: 'tool_use'`, claiming client execution authority even when the server was already executing the tool.
  4. *Unconstrained Pre-Tool Synthesis:* The system prompt previously lacked a strict negative constraint forbidding visual artifact and diagram generation in intermediate tool-invoking steps.
- **Decision:**
  - **Pi DAG Presentation Layer (`use-chat-turns.ts`):** Implemented `buildTurnAssistantMessage` following Pi's message DAG model. The visible chat bubble now strictly extracts text parts exclusively from the terminal assistant message. Any intermediate assistant text generated prior to tool invocations is demoted to `reasoning` (`meta: "intermediate_plan"`) so it is preserved inside the `WorkedSteps` accordion without polluting the user-facing response bubble.
  - **Tool Adapter Synchronization (`ui-tool-adapter.ts`):** Registered `query_playbook` and `propose_playbook_update` in `createStandardAgentTools()` using `playbookManager`, ensuring 1:1 parity between prompt capabilities and local agent loop tools.
  - **Hybrid Server/Client Tool Bridge (`chat-stream-fn.ts`):** Added handlers for server-completed tool chunks (`tool-output-available`, `tool-result`, and AI SDK `a:` protocol). Server-executed tools are removed from the client's pending execution list so the client agent loop does not attempt to re-execute them locally.
  - **Prompting Directives (`yula-agent-prompt.ts`):** Added the `SINGLE FINAL SYNTHESIS & NO PRE-TOOL ARTIFACTS` directive forbidding Mermaid diagrams in pre-tool steps, and clarified that general conceptual ERP inquiries must be answered directly without triggering unnecessary playbook queries.
- **Author:** Antigravity / Team

---

## [2026-09-20] Typed Component & Action Contracts: Dual Schema Support (Input/Output), Emitted Events, and Deterministic Conditions
- **Rationale:**
  1. *Action Contract Schema Ambiguity:* `ActionContract.schema` was previously an input payload schema only, leaving return values untyped and unvalidated, and missing output introspection for tool-calling agents.
  2. *Component Event Visibility:* UI components emitted events over `uiEventBus` (e.g. `field_change`, `filter_changed`, `job_queued`, `view_transformed`), but had no formal schema declaration for inspection or observability by agent tools like `inspect_ui_state`.
  3. *Deterministic Guarding vs LLM Reasoning:* While natural language directives (`whenToCall` & `whenNotToCall`) are critical for LLM prompt reasoning, engine-level deterministic preflight conditions (`when?: ActionCondition`) were needed to prevent invalid action dispatches (e.g., executing grid actions when in criteria form phase).
- **Decision:**
  - **Core Types (`@my-agent/core`):**
    - Added `ActionCondition` (`route?: string`, `phase?: string`, `custom?: (ctx) => boolean`).
    - Added `EventContract` (`schema?: ZodTypeAny`, `description: string`, `whenEmitted?: string`).
    - Enhanced `ActionContract` with `inputSchema` (aliasing `schema` for 100% backward compatibility), `outputSchema`, and `when?: ActionCondition`.
    - Enhanced `ComponentSchema` with `events?: Record<string, EventContract>`.
    - Added `postflightValidate` to `IComponentRegistry` for verifying action results against `outputSchema`.
  - **Prompt & Registry Formatting (`component-registry.ts`):**
    - Enforced deterministic `when` condition checking in `preflightValidate`.
    - Enhanced `formatActiveComponentsPrompt` to cleanly format `Parameters:`, `Returns:`, and `Emitted Events:`.
  - **React Hook Layer (`@my-agent/react`):**
    - Enhanced `UseAgentComponentOptions` and `useAgentComponent` to accept and register typed `events`.
  - **Application Migration (`Sims/yula.client`):**
    - Added typed `outputSchema` and `events` across `criteria_form:*` (in `use-screen-agent-context.tsx`, `use-headless-system-components.ts`, and `yula-active-components.ts`) and `result_grid:active` (in `use-result-grid-agent.ts` and `yula-active-components.ts`).
    - Enhanced `inspect_ui_state` tool's `outputSchema` with typed `recent_events` Zod schema.
    - Extracted `useResultGridAgent` and `renderReportGridSubtitle` from `arrow-report-grid.tsx` to maintain clean separation and strictly adhere to the 500-line limit (486 lines).
- **Author:** Antigravity / Team

---

## [2026-09-20] Grounded ERP Workflow Protocol & Procedural Memory (Eliminating Theoretical LLM Fallback)
- **Rationale:**
  1. *Theoretical Parametric Fallback:* When a user asked about multi-step enterprise workflows, the LLM lacked verified procedural recipes in the workspace wiki. Governed by a generic rule, the model generated generic textbook theories detached from actual Sims ERP screens.
  2. *Missing Level 0 Recipe Discovery:* `chat/route.ts` pre-injected `playbookRules`, but omitted `playbookRecipes` from Level 0 system prompt context.
- **Decision:**
  - **Prompt Grounding & Directives (`yula-agent-prompt.ts`):** Established the **Grounded Workflow Protocol**: ungrounded textbook essays and theoretical diagrams detached from Sims ERP are strictly forbidden. Present concrete DAG steps and screen routes. Proactively offer interactive `ask_user_choice` chips.
  - **Zero-Latency Recipe Discovery (`chat/route.ts`):** Pre-injected `playbookRecipes` using `serverPlaybookStorage.readEntries(wsId)`.
  - **Verification:** All simulation suites pass (31/31), 18/18 prompt tests pass.
- **Author:** Antigravity / Team

---

## [2026-09-21] Robust Chart Visualization Dispatch, Parameter Aliases & Base Table Fallback
- **Rationale:** When users requested chart visualizations (e.g. "top 5 stores"), the agent defaulted to issuing raw SQL queries on `active_view` instead of triggering visualization, failed Zod validation on `orderMode: "desc"`, and encountered DuckDB Binder Errors when previous custom views masked underlying columns or filtered out requested entities (like `T999`).
- **Decision:**
  - **Tool & ReAct Prompt Grounding:** Added `VISUALIZE` example to `dispatch_component_action` in `standard-agent-tools.ts` and registered an autonomous execution step in `yula-agent-prompt.ts`.
  - **Schema & Order Mode Normalization:** Allowed `"desc"` and `"asc"` in `GRID_VISUALIZE_CONTRACT` and mapped them to `"value_desc"` and `"value_asc"` in `inferChartOrderMode`.
  - **Custom View & Base Table Fallbacks:** Derived columns from the probe row in `resolveActiveDataset` (`dataset.ts`) and added automatic fallback to `baseColumns` / base table in `visualizeGrid` when custom views lack requested columns or yield empty rows.
  - **UI Chart Rendering:** Guaranteed unwrap of nested `details` in `parseChartOutput` and normalized AI SDK tool call parts in `yula-tool-info.ts`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Comprehensive WasmSql Architecture Migration & Legacy DuckDB Cleanup
- **Rationale:**
  1. *Architectural Disambiguation:* The browser-side WebAssembly SQL engine was historically named after a specific vendor implementation (`duckdb`). Renaming to `wasmsql` cleanly distinguishes client-side WASM execution from Next.js server-side SQL, while opening up engine-agnostic AI tooling.
  2. *Full System Cleansing:* Beyond hook aliases, a complete cleanup was needed across localization dictionaries (`tr.json`, `en.json`), KPI landing specs, core service folders (`src/services/wasmsql`), vector memory stores (`wasmsql-vector`), Pyodide skill bridges, and internal hook state variables (`tableName`, `applyFilters`, `columnWasmTypes`, `gridAggregations`).
- **Decision:**
  - **Core Service Migration (`src/services/wasmsql/`):** Established `src/services/wasmsql/` as the single source of truth (`wasm-sql-client.ts`, `wasm-sql.worker.ts`, `filter-parser.ts`, `wasmsql-vector-*`, `ai/`). Completely removed legacy `src/services/duckdb` directory and deleted obsolete proxy files.
  - **Localization & KPI Keys:** Migrated `duckdb-status` to `wasmsql-status` across Turkish and English translation files and `workspace-landing-data.ts`.
  - **Grid Props & State Variable Cleanup:** Replaced `duckTableName` with `tableName`, `duckApplyFilters` with `applyFilters`, `columnDuckTypes` with `columnWasmTypes`, and `duckDbAggregations` with `gridAggregations` across all report-grid hooks and `arrow-report-grid.tsx`.
  - **Headless AI Wasm SQL Engine:** Bound `wasm_sql_engine` component (`use-wasm-sql-agent.ts`) with `RUN_SQL`, `DESCRIBE_TABLE`, and `LIST_TABLES` action contracts and strict read-only SQL guard routing in `dispatch-bridge.ts`.
  - **Skills & Tools Integration:** Renamed Pyodide bridge to `wasmsql-pyodide-bridge.ts` and updated dataset resolver, profiler, visualizer, and RAG vector indexing to import directly from `@/services/wasmsql` and `@/services/wasmsql-vector`.
  - **Verification:** All 316 unit tests passed, all 8/8 grid test suites passed (`npm run test:grid`), 0 oxlint warnings/errors, 0 tsc errors, all files strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Option B Governance & Approval Lifecycle for Procedural Playbook (Draft Isolation & Admin Review Screen)
- **Rationale:**
  1. *Unrestricted Production Mutations:* Standard users or agent proposals previously committed workflow recipes and screen rules directly to production company wikis via `recordEntry`. Allowing non-administrative roles to alter canonical corporate workflows poses severe governance and compliance risks.
  2. *Need for Draft Isolation (Zero Leakage):* Newly proposed rules and recipes must be quarantined in `proposals/` (`status: "draft"`) so that active Level 0 prompt injection and `findRecipe` queries ignore them until officially sanctioned by an administrator.
  3. *Admin Visual DAG Inspection:* Administrators require a dedicated review interface (`/system/playbooks`) featuring interactive flowchart rendering (`WorkflowGraphCanvas`), step inspection, and one-click `[Approve & Publish]` or `[Reject]` actions.
- **Decision:**
  - **Core Governance Models (`@my-agent/core`):** Extended `PlaybookEntry` with `status: 'draft' | 'approved' | 'rejected'`, `proposedBy`, `reviewedBy`, and `changeSummary`. Added `readProposals`, `writeProposal`, `approveProposal`, and `rejectProposal` to `IPlaybookStorageAdapter` and `PlaybookService`.
  - **Tool Adapter Quarantining (`ui-tool-adapter.ts`):** Modified `propose_playbook_update` to invoke `proposeEntry` instead of `recordEntry`, ensuring non-admin proposals enter the draft pool awaiting admin authorization.
  - **Server File Storage (`playbook-server.ts`):** Added isolated storage in `storage/wiki/workspaces/<workspace>/proposals/` and promotion logic moving approved recipes to `workflows/` or `screens/` while updating `index.md` and logging `proposal_approved`.
  - **Dedicated API (`/api/agent/playbook/proposals`):** Created endpoints for proposal retrieval, draft creation, approvals, and rejections.
  - **Visual Admin UI (`PlaybookProposalsTab` & `/system/playbooks`):** Created modular proposal review tab with DAG flowchart preview, diff view, and decision buttons, integrated into `PlaybooksManagementView` and guarded by `RequireAdmin`.
  - **Navigation Integration:** Added `Kural & Akış Onayları` to `systemNav`, `global-nav-drawer.tsx`, `module-nav-menu.tsx`, and `workspace-landing-data.ts`.
- **Author:** Antigravity / Team

