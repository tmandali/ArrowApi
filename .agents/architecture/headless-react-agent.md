# Headless React UI-Agent Architecture & Reliability Layer (@my-agent)

This document details the **Headless React UI-Agent (@my-agent)** architecture, its bi-directional reactive bridge, and the Pi reliability layer.

> Canonical Master Graph Index: [`src/yula-ai/agent.md`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md)  
> Mandatory Standard: [Graph-Native Documentation Standard](file:///Users/tmr/Source/ArrowApi/.agents/standards/graph-documentation-standard.md)

---

## 1. System Graph Diagram (Mermaid)

```mermaid
graph TD
    classDef agent fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef hook fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#eef2ff;
    classDef hitl fill:#701a75,stroke:#f472b6,stroke-width:2px,color:#fdf2f8;
    classDef backend fill:#14532d,stroke:#4ade80,stroke-width:2px,color:#f0fdf4;

    User([👤 User]):::hitl
    AgentLoop[🧠 AgentLoopNode<br/>ReAct / Plan-and-Solve]:::agent
    PiGuard[🛡️ PiReliabilityNode<br/>14 Core Reliability Primitives]:::agent
    DispatchBridge[🌉 DispatchBridgeNode<br/>dispatch_component_action]:::agent

    subgraph HeadlessReactBridge ["🖥️ Headless React Component Nodes (useAgentComponent)"]
        CriteriaForm[📝 CriteriaFormNode<br/>criteria_form:activeScope]:::hook
        ResultGrid[📊 ResultGridNode<br/>result_grid:active]:::hook
        JobHistory[⏱️ JobHistoryNode<br/>job_history]:::hook
        AppRouter[🧭 AppRouterNode<br/>app_router:NAVIGATE]:::hook
    end

    subgraph ExternalServices ["⚙️ External Processing Nodes"]
        ArrowEngine[🚀 ArrowJobsEngineNode<br/>.NET SSE Stream]:::backend
        DuckDB[🦆 DuckDbEngineNode<br/>WASM / OPFS Cache]:::backend
    end

    User -->|Prompt / Steer| AgentLoop
    AgentLoop <-->|Safety Gate & Stagnation Halt| PiGuard
    AgentLoop -->|dispatch_component_action| DispatchBridge

    DispatchBridge -->|SET_FIELDS / SUBMIT| CriteriaForm
    DispatchBridge -->|RUN_SQL / FILTER| ResultGrid
    DispatchBridge -->|SELECT / CANCEL| JobHistory
    DispatchBridge -->|NAVIGATE| AppRouter

    CriteriaForm -->|Submit Job| ArrowEngine
    ArrowEngine -->|SSE Stream Events| ResultGrid
    ResultGrid -->|SQL Analytics| DuckDB

    %% Feedback Loops
    CriteriaForm -.->|Zod Preflight Error (Self-Healing)| AgentLoop
    ResultGrid -.->|Grid Live State & Row Count| AgentLoop
    AgentLoop -->|ask_user_choice| User
```

---

## 2. Nodes Catalog & Component Wrapping

Interactive components are never manipulated through artificial external stores or ad-hoc tool injections. Each component registers itself natively inside its React lifecycle using `useAgentComponent`.

### 🏷️ `JobHistoryNode` (`job_history`)
- **Type:** Registered Headless UI Component ([`<ArrowJobExecutionsPanel />`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/features/jobs/components/executions/arrow-job-executions-panel.tsx)).
- **Actions & Contracts:** `LIST`, `GET_DETAIL`, `SELECT`, `REFRESH`, `CANCEL`, `OPEN_LAST`, `FIND` (see [`job-history-contracts.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/lib/client-tools/job-history-contracts.ts)).
- **Live Metadata:** Supplies `recentExecutions`, `itemsCount`, `total` to the model at 0 ms without extra queries.
- **Inbound Edges:** Triggered by `[DispatchBridgeNode](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md#dispatchbridgenode)`.
- **Outbound Edges:** Dispatches to `[ArrowJobsEngineNode](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md)`.

### 🏷️ `ResultGridNode` (`result_grid:active`)
- **Type:** Registered Headless UI Component ([`<ArrowReportGrid />`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/features/jobs/components/report-grid/arrow-report-grid.tsx)).
- **Actions & Contracts:** `RUN_SQL`, `QUERY`, `FILTER`, `APPLY_FILTERS`, `SORT`, `COLUMNS`, `PIN`, `RESET_LAYOUT`, `EXPORT`, `VISUALIZE`, `ANALYZE`, `PROFILE` (see [`result-grid-contracts.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/lib/client-tools/result-grid-contracts.ts)).
- **Inbound Edges:** Triggered by `[DispatchBridgeNode](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md#dispatchbridgenode)` and streams from `[ArrowJobsEngineNode](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md)`.
- **Outbound Edges:** Queries `[DuckDbEngineNode](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md)`.
- **Feedback Loop:** Emits row counts, applied filter states, and aggregation statistics back to `[AgentLoopNode](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md#agentloopnode)` as observations.

### 🏷️ `CriteriaFormNode` (`criteria_form:<scope>`)
- **Type:** Registered Headless Criteria Form ([`useHeadlessSystemComponents.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/hooks/yula-chat/use-headless-system-components.ts)).
- **Actions & Contracts:** `SET_FIELDS`, `APPLY`, `SUBMIT`, `RUN`, `SCHEMA`, `READ`, `VALIDATE` (see [`criteria-form-contracts.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/lib/client-tools/criteria-form-contracts.ts)).
- **Inbound Edges:** Triggered by `[DispatchBridgeNode](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md#dispatchbridgenode)`.
- **Outbound Edges:** Triggers report execution on `[ArrowJobsEngineNode](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md)`.

### 🏷️ `AppRouterNode` (`app_router`)
- **Type:** Universal Route Navigator ([`useHeadlessSystemComponents.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/hooks/yula-chat/use-headless-system-components.ts)).
- **Actions & Contracts:** `NAVIGATE` (see [`app-router-contracts.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/lib/client-tools/app-router-contracts.ts)).
- **Inbound Edges:** Triggered by `[DispatchBridgeNode](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md#dispatchbridgenode)`.
- **Outbound Edges:** Dispatches client navigation via Next.js App Router.

```tsx
// Typical typed registration pattern
useAgentComponent({
  id: "result_grid:active",
  meta: {
    description: `Active Result Grid (${duckTableName}) - ${rowCount ?? "?"} rows`,
    tableName: duckTableName,
    columns,
  },
  events: {
    filter_change: {
      description: "Triggered when grid column filters are updated",
      schema: z.object({ filters: z.record(z.string(), z.any()) }),
    },
    view_transformed: {
      description: "Triggered when SQL, sorting, or projection transforms active view",
      schema: z.object({ query: z.string().optional(), rowCount: z.number().optional() }),
    },
  },
  actions: {
    RUN_SQL: {
      description: "Executes a read-only DuckDB SQL query against 'active_view' ({ query }).",
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.object({ success: z.boolean(), rowCount: z.number().optional() }),
      whenToCall: "When custom SQL queries, aggregations, or calculations are requested.",
      whenNotToCall: "When simple column filtering or sorting is sufficient.",
      when: { phase: "results" },
    },
  },
  onAction: async (action, payload) => {
    return executeDispatchComponentAction({ component_id: "result_grid:active", action, payload });
  },
});
```

---

## 3. Prompt Pruning, Single Active Form & Typesafe Component Families

Inactive report forms MUST NOT be injected into the system prompt (`filterRelevantComponents`). Only:
1. The active route/screen form (`criteria_form:<activeScope>`)
2. Universal components (`arrow_job`, `arrow_job_manager` / `job_history`, `app_router`, `wasm_sql_engine`)
3. The active result grid (`result_grid:active`)

are transferred. This saves ~4000 tokens per turn. Entity/master-data screens register as `entity_form:<name>`.

### 🛡️ Component Families & Typesafe Dispatch

All UI components and dispatch operations adhere to canonical types declared in [`dispatch-types.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/lib/client-tools/dispatch-types.ts):
- **Job Families (`JobComponentFamily`):** `"arrow_job" | "arrow_job_manager" | "job_history"` unified through runtime type-guard `isJobFamily(family)`.
- **Component Families (`ComponentFamily`):** `"criteria_form" | "result_grid" | "app_router" | JobComponentFamily | "wasm_sql_engine" | "entity_form" | "plugin"` guarded by `isComponentFamily(family)`.
- **Scoped Component IDs (`ComponentId`):** Structured as `${ComponentFamily}:${string}` and safely unpacked via `parseComponentId(componentId)`.


### 🏷️ Management & Master Data Screens Registration Standard (`entity_form:*`)

For administrative and configuration screens (Skills, Agents, Playbooks, User Settings, Plugins, Memory, Users), standard bindings ensure Yula is immediately aware of what screen the user is viewing and which item/tab is currently active:

1. **Screen Context Hook (`useScreenAgentContext`):**
   Supplies screen identity, title, description, and contextual quick prompt chips to the agent.
2. **Dynamic Tool Registration (`useAgentComponent`):**
   Registers an `entity_form:<name>` component into `@my-agent/core`'s dynamic UI registry with standard actions:
   - `READ`: Returns current active selection, tab, search terms, and count metadata.
   - `SELECT_<ENTITY>`: Programmatically selects an item from the list/master view.
   - `SWITCH_TAB`: Switches active sub-tabs (e.g. `overview`, `code`, `tests`, `system_prompt`).
   - `TEST_<ENTITY>` / `SAVE` / `SET_FIELDS`: Dispatches test flows or saves form changes.
3. **Dedicated Binding Hook Pattern (`use-*-agent-binding.ts`) & Type-Safe Handlers:**
   To strictly enforce Golden Rule 2 (500-line ceiling), agent bindings for views must be isolated into dedicated `use-*-agent-binding.ts` or `use-*-agent.ts` hook files.
   Furthermore, instead of boilerplate `onAction: async (action, payload)` switches, hooks leverage `@my-agent/react`'s generic `handlers?: ActionHandlersMap<TActions>` property:
   ```ts
   useAgentComponent({
     id: "entity_form:custom_scope",
     actions: {
       READ: READ_CONTRACT,
       SET_FIELDS: SET_FIELDS_CONTRACT,
     },
     handlers: {
       READ: async () => ({ success: true, ... }),
       SET_FIELDS: async (payload) => {
         // payload is automatically typed and validated from SET_FIELDS_CONTRACT.inputSchema!
         updateState(payload);
         return { success: true };
       },
     },
   });
   ```
   This eliminates `any` casting, guarantees autocompletion, catches action key typos at compile-time, and preserves backward compatibility.

| Screen Route | Entity Form ID | Key Actions Registered |
| :--- | :--- | :--- |
| `/my/skills`, `/system/skills` | `entity_form:skill_editor` | `READ`, `SELECT_SKILL`, `SWITCH_TAB`, `TEST_SKILL`, `SAVE` |
| `/my/agents`, `/system/agents` | `entity_form:agent_editor` | `READ`, `SELECT_AGENT`, `SWITCH_TAB`, `SET_ACTIVE`, `TEST_AGENT`, `SAVE` |
| `/my/playbooks` | `entity_form:playbook_manager` | `READ`, `SELECT_PLAYBOOK`, `SWITCH_TAB`, `SAVE`, `DELETE` |
| `/my/settings` | `entity_form:user_settings` | `READ`, `SET_FIELDS`, `SWITCH_TAB`, `SAVE` |
| `/my/plugins` | `entity_form:plugin_registry` | `READ`, `SELECT_PLUGIN`, `SEARCH` |
| `/my/memory` | `entity_form:agent_memory` | `READ`, `ADD_ENTRY`, `SEARCH`, `CLEAR` |
| `/system/users` | `entity_form:system_users` | `READ`, `SWITCH_TAB`, `SEARCH` |
| `/<workspace>` (Dashboards) | `useScreenAgentContext` | Contextual navigation, reports catalog, and workspace shortcuts |

> [!IMPORTANT]
> **Active Screen Grounding Rule:**
> When the user is on a specific screen (e.g., `/stock/stock-balance` or `/my/skills`) and asks about history, runs, skills, or configurations (e.g., *"bu skili nasıl test ederim"*), the model **MUST NEVER ask which screen or report**; it unconditionally grounds to the active screen and selected entity.

---

## 4. ReAct & Plan-and-Solve Dual-Scope Standard

- **ReAct Loop (Directed Flow):**
  `Reasoning` (screen context, schema contracts, live meta) $\rightarrow$ `Acting` (UI action via `dispatch_component_action`) $\rightarrow$ `Observation` (`onAction` output, DuckDB WASM, Zod preflight) $\rightarrow$ `Next Thought`.
- **Scope Segmentation:**
  - **Global Scope (`/`, `/dashboard`, `/stock`):** Runs in **Plan-First** mode. Unconfirmed `SUBMIT` is forbidden; a numbered plan and `ask_user_choice` card are required. For single-step page hops, use `app_router:NAVIGATE`.
  - **Screen Scope (`/stock/stock-balance`):** Runs in **Direct ReAct** mode (`SET_FIELDS` $\rightarrow$ `SUBMIT`).

### Agent Mode Badge (`YulaAgentModeChip`) & Screen Focus Button (`YulaFocusScreenButton`)
- **Mode Badge:** Displays `ReAct` (green) vs `Plan` (purple) when idle; displays `Reasoning…` (amber) vs `Acting…` (cyan) during active turns.
- **Focus Button:** When fullscreen overlay is open, clicking the focus button collapses the dock (`setExpanded(false)`) and fires `USER_FOCUS_SCREEN` telemetry so the user can inspect the underlying screen.

---

## 5. Core Reliability & Execution Capabilities (Pi Guard & Step Router)

The underlying runtime guarantees reliability via core execution primitives:
1. **SET_FIELDS**: Schema-validated typed form population.
2. **SUBMIT (Inline HITL)**: Confirmation cards without popup modals.
3. **Steer Queue**: Mid-turn user instruction injection.
4. **Follow-up Queue**: Post-turn follow-up task sequencing.
5. **Dual-Bound Truncation**: Line and byte-capped output pruning.
6. **Mutation Line**: FIFO atomic action queue.
7. **Adaptive Publisher**: 60 FPS UI state batching.
8. **Retry Backoff**: Exponential backoff on transient network failures.
9. **Memory**: Session and persistent preference storage.
10. **Plugin Registry**: Dynamic extension capability.
11. **Multi-Lane Scheduler**: Interactive vs. background worker lane isolation.
12. **Deferred Manager**: SSE suspend and resume for long-running jobs.
13. **Reconciliation Engine**: Startup orphan job cleanup.
14. **Remote RPC**: Secure JSON-RPC 2.0 transport.
15. **Tool Loadout Delta (`declareToolChanges`)**: Emits `[Tools Loadout Updated]` system notifications when mounted components change across routes.
16. **Dynamic Model Cascading (`prepareNextTurn`)**: Dynamically scales model selection and reasoning effort between turns.
17. **Dynamic Step Routing (`prepareStepRouting`)**: Prunes unneeded tools per execution phase (`workspace` vs `results`) to conserve tokens and block hallucinations.
18. **Provider Failover (`createFailoverLanguageModel`)**: Transparently falls back to secondary LLM endpoints on HTTP 429 quota exhaustion or 5xx server outages.
19. **Strict Output Schemas (`outputSchema`)**: Validates tool return structures via Zod schemas and executes `postflightValidate` in `IComponentRegistry` for end-to-end type safety.
20. **Component Event Contracts (`events`) & Topic-Segmented Upstream Telemetry (`TelemetryTopic`, `TELEMETRY_TOPICS`, `UIEvent` & `AppTelemetryEvent`)**: Declares telemetry and state events emitted by components over `uiEventBus` for observability, reflection tools (`inspect_ui_state`), and bounded ring-buffer memory. Type safety, starvation immunity, and causality tracking are enforced across:
    - *Topic Schema Catalog (`TELEMETRY_TOPICS` & `TopicDefinition`)*: Formally defines each topic (`jobs`, `data`, `form`, `navigation`, `system`) with semantics, typical events, and schemas, dynamically injected into the `inspect_ui_state` tool parameter description and return structure so models make precise filter choices without guessing.
    - *Relative Freshness & Age Indication (`formatRelativeAge`, `age`, `ageMs`)*: Attaches human- and LLM-readable relative age (`just now`, `3s ago`, `2m ago`) to all telemetry queries and system prompt snapshots, conserving tokens and preventing stale action misinterpretation.
    - *Causality & Traceability (`correlationId`)*: Binds report lifecycle (`REPORT_STARTED`, `REPORT_COMPLETED`, `REPORT_FAILED`) and spreadsheet interactions (`ROW_SELECTED`, `FILTER_APPLIED`) to a shared causal workflow ID (`jobId`), enabling end-to-end traceability in `inspect_ui_state({ correlation_id })`.
    - *Proactive Severity Alerts (`severity: 'info' | 'warn' | 'critical'` & `onCritical`)*: Classifies telemetry importance and emits proactive alerts over `uiEventBus.onCritical()` when background tasks fail (`REPORT_FAILED`), allowing the agent to inform the user without waiting for manual polling.
    - *Topic-Segmented Streams (`TelemetryTopic`)*: Groups events into domain topics, preventing high-frequency grid interactions from starving job completion or criteria events.
    - *In-Place Coalescing (`coalesceKey`)*: Replaces naive chronological spam with single-slot in-place updates for high-frequency user actions (e.g. keyboard row navigation `result_grid:row_selected`).
    - *Targeted Agent Inspection (`inspect_ui_state`)*: Enables LLMs to perform targeted queries by `topic`, `source`, `event_type`, `correlation_id`, or `min_severity` rather than blindly dumping unrelated system events.
    - *Live Developer Radar (`<TelemetryDetailView />` & `<YulaDetailToggleButton />`)*: Integrated right detail panel view in Yula full mode, replacing detached overlay drawers with a collapsible MDX-style log stream (`<Collapsible>`) and unified header toggle button (`<YulaDetailToggleButton />`).
    - *Persistent Live Selection State (`meta.selectedRow`)*: Grid maintains active selected row directly in component `meta`, ensuring visibility across turns independent of event retention limits.
    - *Component-Level Inferred Emitter (`ComponentEventEmitter`)*: Automatically extracts payload typings from Zod `EventContract` definitions via `z.infer`, returned as `{ emit }` from `useAgentComponent`.
21. **Deterministic Guard Conditions (`when`)**: Complements natural-language directives (`whenToCall` / `whenNotToCall`) with deterministic preflight checks matching current screen route and execution phase.
22. **3-Tier Diagnostic Triage & Sub-Agent Failure Analyst (`classifyDiagnosticError`, `DiagnosticRetryGuard`, `runDiagnosticSubagent`)**: Resolves `severity: 'critical'` telemetry and tool dispatch errors without polluting conversation context or entering infinite hallucination loops:
    - *Tier 1 (Deterministic Classifier)*: 0 ms latency, 0 token rule matcher identifying recoverable syntax/schema errors (`ZodError`, JSON parse errors, DuckDB parser typos) with `action: 'SELF_HEAL'` vs. unrecoverable business constraints (closed accounting periods, record not found), permissions (401/403), and infrastructure crashes (500/504/WASM OOM) with `action: 'ASK_USER_CHOICE'`.
    - *Tier 2 (Diagnostic Sub-Agent - Nested Worker)*: Isolated fast LLM worker (`runDiagnosticSubagent`) evaluating ambiguous errors with a 2500ms timeout guard, sanitizing stack traces and generating tailored Turkish explanations with actionable `ask_user_choice` chips.
    - *Tier 3 (Bounded Retry Guard)*: Enforces `maxSelfHealAttempts: 2` per correlation ID or error signature, automatically escalating to interactive Human-In-The-Loop (`ask_user_choice`) once the retry ceiling is reached.
23. **Non-Reasoning Scratchpad & Thinking Tool Integration (`synthesize_collected_information`)**: Following the ServiceNow AgentArch enterprise benchmark (arXiv:2509.10769), non-reasoning LLMs receive a zero-side-effect scratchpad tool for multi-step date arithmetic, fiscal quarter calculations, and inventory reconciliation before executing mutations. `prepareStepRouting` conditionally prunes this tool when native thinking tokens are enabled (`hasNativeThinking: true`) to avoid redundant token latency.
24. **Enterprise Evaluation & Reliability Benchmarking (`AcceptableScore`, `Strict/Lenient`, `Pass^k`)**: Embeds ServiceNow AgentArch and Vertex AI trajectory evaluation metrics into `evals.ts` (`EvalRunner`): calculates $C(r) \cdot A(r) \cdot O(r)$ Acceptable Score, separates strict tool order from lenient read-only allowances, and measures $k$-trial repeatability ($Pass@1$ and $Pass\text{^}k$) to safeguard against stochastic enterprise failure modes.

---

## 6. Hybrid Router & Multilingual LLM Guidelines

- **2-Stage Hybrid Router:** High-confidence report navigation requests resolve locally via schema matcher in **~12 ms**; free-text queries route to the LLM.
- **Intent Router & Classifier (`yula-intent-router.ts`):** Before invoking the language model, incoming user turns are classified into high-level intent categories (`WORKFLOW_CONSULTATION`, `DIRECT_EXECUTION`, `DATA_ANALYSIS`, `POLICY_LEARNING`, `GENERAL_CONVERSATION`). Tailored prompt directives are dynamically injected:
  - `WORKFLOW_CONSULTATION`: Enforces a clean, static Markdown plan (`| Plan`) and requires calling `ask_user_choice` with structured options containing `description` and `rationale`.
  - `DIRECT_EXECUTION`: Executes actions (`dispatch_component_action` with `SUBMIT`) immediately without redundant confirmation prompts.
- **Context Poisoning Prevention:** All system feedback in tool outputs (`message`, `hint`, `error`, `directive`, `note`) MUST stay in standard English. The final answer language is determined by user preference and LLM semantics.

---

## 7. Built-in Slash Commands Lifecycle & Layering Boundary

Commands starting with `/` operate across two strictly decoupled layers:

### A. Library Level (`@my-agent/core` & `@my-agent/react`)
- **Domain-Agnostic System Commands:** Canonical identifiers (`new`, `model`, `login`, `compact`, `plan`, `help`) with baseline English descriptions.
- **Dynamic Localization via `i18nManager`:** Localized command descriptions, aliases (`commandAliases`), and output messages (`commandResponses`) are driven entirely by the active `AgentDictionary` (`tr` vs `en`). No language-specific keywords are hardcoded in engine logic.
- **100% Client-Side Interception:** Handled synchronously in `useAgentChat` before message dispatch. They are NEVER converted into remote user turns or sent to the backend LLM.
- **Turkish Locale Normalization:** Both `ı` and `i` are normalized via `normalizeCommandToken`, ensuring `/yardım` and `/yardim` resolve to the canonical `help` command identically regardless of keyboard layout or language setting.
- **Targeted Argument Filtering & Localized Feedback:** When `/help` or `/yardim` is invoked with arguments (e.g. `/yardim model` or `/yardim skil create`), the library filters registered commands locally and returns targeted assistance or syntax guidance using localized templates without triggering server errors or tool prompts.

### B. Application Level (`yula.client`)
- **Domain Commands & User Skills:** Rerouted to workflows, report actions (`/analiz`, `/indir`), or user prompt templates.
- **No Synthetic Tool Execution:** `yula-worked-steps.tsx` strictly verifies `phase !== "system"`. Client-side system commands never produce synthetic `{ status: "ok" }` tool steps in server turn transcripts.

---

## 🔗 Traversable Neighbor Links
- Upstream Master Topology: [`src/yula-ai/agent.md`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md)
- Downstream Presentation Grid: [Core UI Components](file:///Users/tmr/Source/ArrowApi/.agents/architecture/core-ui-components.md)
- Downstream Job Engine: [Arrow Jobs Engine](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md)
- Analytics Cache: [DuckDB WASM & OPFS](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md)
- Engineering Standard: [Graph-Native Documentation Standard](file:///Users/tmr/Source/ArrowApi/.agents/standards/graph-documentation-standard.md)
