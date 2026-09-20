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

> [!IMPORTANT]
> **Active Screen Grounding Rule:**
> When the user is on a specific screen (e.g., `/stock/stock-balance`) and asks about history, runs, or filters (e.g., *"how many runs completed"*), the model **MUST NEVER ask which report**; it unconditionally grounds to the active screen.

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

## 5. 14 Core Reliability Capabilities (Pi Guard)

The underlying runtime guarantees reliability via 14 core primitives:
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

---

## 6. Hybrid Router & Multilingual LLM Guidelines

- **2-Stage Hybrid Router:** High-confidence report navigation requests resolve locally via schema matcher in **~12 ms**; free-text queries route to the LLM.
- **Context Poisoning Prevention:** All system feedback in tool outputs (`message`, `hint`, `error`, `directive`, `note`) MUST stay in standard English. The final answer language is determined by user preference and LLM semantics.

---

## 🔗 Traversable Neighbor Links
- Upstream Master Topology: [`src/yula-ai/agent.md`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md)
- Downstream Presentation Grid: [Core UI Components](file:///Users/tmr/Source/ArrowApi/.agents/architecture/core-ui-components.md)
- Downstream Job Engine: [Arrow Jobs Engine](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md)
- Analytics Cache: [DuckDB WASM & OPFS](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md)
- Engineering Standard: [Graph-Native Documentation Standard](file:///Users/tmr/Source/ArrowApi/.agents/standards/graph-documentation-standard.md)
