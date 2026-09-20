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
- **Actions:** `LIST`, `SELECT`, `REFRESH`, `CANCEL`.
- **Live Metadata:** Supplies `recentExecutions`, `itemsCount`, `total` to the model at 0 ms without extra queries.
- **Inbound Edges:** Triggered by `[DispatchBridgeNode](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md#dispatchbridgenode)`.
- **Outbound Edges:** Dispatches to `[ArrowJobsEngineNode](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md)`.

### 🏷️ `ResultGridNode` (`result_grid:active`)
- **Type:** Registered Headless UI Component ([`<ArrowReportGrid />`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/features/jobs/components/report-grid/arrow-report-grid.tsx)).
- **Actions:** `RUN_SQL`, `FILTER`, `APPLY_FILTERS`, `SORT`, `COLUMNS`, `PIN`, `RESET_LAYOUT`, `EXPORT`, `VISUALIZE`, `ANALYZE`, `PROFILE`.
- **Inbound Edges:** Triggered by `[DispatchBridgeNode](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md#dispatchbridgenode)` and streams from `[ArrowJobsEngineNode](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md)`.
- **Outbound Edges:** Queries `[DuckDbEngineNode](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md)`.
- **Feedback Loop:** Emits row counts, applied filter states, and aggregation statistics back to `[AgentLoopNode](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md#agentloopnode)` as observations.

```tsx
// Typical registration pattern
useAgentComponent({
  id: "job_history",
  name: "Execution History",
  description: "Report execution history, status, and selection",
  actions: {
    SELECT: async ({ jobId }) => selectJob(jobId),
    CANCEL: async ({ jobId }) => cancelJob(jobId),
    REFRESH: async () => refetchHistory(),
  },
  getState: () => ({ selectedJobId, count: history.length }),
});
```

---

## 3. Prompt Pruning & Single Active Form Rule

Inactive report forms MUST NOT be injected into the system prompt (`filterRelevantComponents`). Only:
1. The active route/screen form (`criteria_form:<activeScope>`)
2. Universal components (`job_history`, `app_router`)
3. The active result grid (`result_grid:active`)

are transferred. This saves ~4000 tokens per turn. Entity/master-data screens register as `entity_form:<name>`.

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
3. **Dedicated Binding Hook Pattern (`use-*-agent-binding.ts`):**
   To strictly enforce Golden Rule 2 (500-line ceiling), agent bindings for management views must be isolated into separate `use-*-agent-binding.ts` hook files.

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
19. **Strict Output Schemas (`outputSchema`)**: Validates tool return structures via Zod schemas for end-to-end client type safety.

---

## 6. Hybrid Router & Multilingual LLM Guidelines

- **2-Stage Hybrid Router:** High-confidence report navigation requests resolve locally via schema matcher in **~12 ms**; free-text queries route to the LLM.
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
