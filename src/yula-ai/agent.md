# System Architecture & Graph Topology: Yula AI (@my-agent)

This document is the **Canonical Graph Architecture Index** for the Yula AI ecosystem. The entire architecture is modeled as a **Directed Graph (Digraph)** where runtime engines, UI elements, tools, and background services are **Nodes**, and telemetry, tool dispatches, SSE streams, and feedback loops are **Edges**.

---

## 1. System Graph Diagram (Mermaid)

The following directed graph illustrates the complete runtime topology, interactive control loops, and Human-in-the-Loop (HITL) checkpoints.

```mermaid
graph TD
    %% Styling and Classes
    classDef runtime fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef hitl fill:#701a75,stroke:#f472b6,stroke-width:2px,color:#fdf2f8;
    classDef tool fill:#0f766e,stroke:#2dd4bf,stroke-width:2px,color:#f0fdfa;
    classDef ui fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#eef2ff;
    classDef backend fill:#14532d,stroke:#4ade80,stroke-width:2px,color:#f0fdf4;

    User([👤 User / UI Interaction]):::hitl

    subgraph OrchestrationLayer ["🧠 Orchestration & Intelligence Layer"]
        HybridRouter[🔀 HybridRouterNode<br/>~12ms Local Matcher vs LLM]:::runtime
        AgentLoop[⚡ AgentLoopNode<br/>streamText / Autonomous ReAct Loop]:::runtime
        PiGuard[🛡️ PiReliabilityNode<br/>Stagnation, Truncation & FIFO Queue]:::runtime
        PlaybookMem[(📚 ProceduralMemoryNode<br/>Playbook Rules System/Workspace/User)]:::runtime
    end

    subgraph StandardToolsLayer ["🧰 Standard Executable Tools (Nodes)"]
        DispatchBridge[🌉 DispatchBridgeNode<br/>dispatch_component_action]:::tool
        StateInspector[🔍 StateInspectorNode<br/>inspect_ui_state]:::tool
        ChoiceCardTool[🛑 ChoiceCardToolNode<br/>ask_user_choice]:::tool
        MemoryTool[(💾 MemoryToolNode<br/>remember_fact / recall_fact)]:::tool
        RouterTool[🧭 AppRouterToolNode<br/>app_router:NAVIGATE]:::tool
    end

    subgraph HeadlessUILayer ["🖥️ Registered Headless UI Components (Nodes)"]
        CriteriaForm[📝 CriteriaFormNode<br/>criteria_form:activeScope]:::ui
        ResultGrid[📊 ResultGridNode<br/>result_grid:active]:::ui
        JobHistory[⏱️ JobHistoryNode<br/>job_history]:::ui
        ActiveScreen[📱 ActiveScreenContextNode<br/>Route, Phase & Schema Grounding]:::ui
    end

    subgraph BackendEngines ["⚙️ Backend & Analytic Engines (Nodes)"]
        ArrowEngine[🚀 ArrowJobsEngineNode<br/>.NET Distributed Worker & SSE Bus]:::backend
        DuckDBEngine[(🦆 DuckDbEngineNode<br/>In-Browser WASM & OPFS Parquet Cache)]:::backend
    end

    %% Inbound & Outbound Edges
    User -->|1. Prompt / Click / Steer| HybridRouter
    ActiveScreen -.->|Grounding Metadata 0ms| HybridRouter
    PlaybookMem -.->|0ms Screen Rules| AgentLoop

    HybridRouter -->|Deterministic Pattern Match| DispatchBridge
    HybridRouter -->|Intent Inference Needed| AgentLoop

    AgentLoop -->|Pi Interceptor| PiGuard
    PiGuard -->|Validated Step| AgentLoop

    %% Tool Dispatches
    AgentLoop -->|Execute Tool| DispatchBridge
    AgentLoop -->|Read State| StateInspector
    AgentLoop -->|Trigger HITL Prompt| ChoiceCardTool
    AgentLoop -->|Persist Fact| MemoryTool
    AgentLoop -->|Switch View| RouterTool

    %% UI Component Mutators
    DispatchBridge -->|SET_FIELDS / SUBMIT| CriteriaForm
    DispatchBridge -->|RUN_SQL / FILTER / SORT| ResultGrid
    DispatchBridge -->|SELECT / CANCEL / REFRESH| JobHistory
    RouterTool -->|Transition Route| ActiveScreen

    %% State Inspection
    StateInspector -.->|Read Live Props| CriteriaForm
    StateInspector -.->|Read Grid State| ResultGrid
    StateInspector -.->|Read Runs Total| JobHistory

    %% Backend Execution Flow
    CriteriaForm -->|2. Enqueue Job POST| ArrowEngine
    ArrowEngine -->|3. SSE Progress & Batches| ResultGrid
    ResultGrid -->|4. Query & Aggregate| DuckDBEngine

    %% Feedback & Control Loops (Dashed Red/Cyan Lines)
    ResultGrid -.->|Feedback: Row Count & SQL Result| AgentLoop
    CriteriaForm -.->|Feedback: Zod Preflight Error (Self-Healing)| AgentLoop
    PiGuard -.->|Circuit Breaker: Stagnation Detected Halt| AgentLoop
    ChoiceCardTool ==>|Pause Loop (stopWhen)| User
    User ==>|Resume Loop: Selected Option| AgentLoop
```

---

## 2. Nodes Catalog

Every participant in the system is documented below with its role, registration contract, inbound edges, outbound edges, and fallback loops.

### 2.1. Orchestration & Intelligence Nodes

#### 🏷️ `HybridRouterNode`
- **Role:** 2-Stage Query Router. Resolves high-confidence screen navigation and standard actions locally in **~12 ms** using deterministic schema matching; routes conversational intents to the LLM.
- **Inbound Edges:**
  - Upstream: [`UserNode`](#user-node) via prompt input or slash commands.
  - Upstream: [`ActiveScreenContextNode`](#activescreencontextnode) via current pathname grounding.
- **Outbound Edges:**
  - Downstream: [`DispatchBridgeNode`](#dispatchbridgenode) on deterministic match.
  - Downstream: [`AgentLoopNode`](#agentloopnode) on generative reasoning needed.
- **Neighbor References:** [Headless React Agent ADR](file:///Users/tmr/Source/ArrowApi/.agents/architecture/headless-react-agent.md#6-hybrid-router--multilingual-llm-guidelines).

#### 🏷️ `AgentLoopNode`
- **Role:** Autonomous ReAct State Machine (`streamText` in Next.js API route `/api/agent/chat` and `agentLoop` in `@my-agent/core`). Orchestrates multi-step reasoning, tool invocations, dynamic step routing, and context pruning.
- **Inputs & State Contract:** `AgentContext` (messages, tools, system prompt, `playbookRules`, active screen grounding).
- **Inbound Edges:**
  - Upstream: [`HybridRouterNode`](#hybridrouternode).
  - Upstream: [`ChoiceCardToolNode`](#choicecardtoolnode) on user choice submission.
  - Upstream: [`ProceduralMemoryNode`](#proceduralmemorynode) for dynamic injection of rules.
- **Outbound Edges:**
  - Downstream: [`PiReliabilityNode`](#pireliabilitynode) for step safety, loadout delta tracking, and loop health.
  - Downstream: Standard Tool Nodes ([`DispatchBridgeNode`](#dispatchbridgenode), [`StateInspectorNode`](#stateinspectornode), [`ChoiceCardToolNode`](#choicecardtoolnode), [`MemoryToolNode`](#memorytoolnode), [`AppRouterToolNode`](#approutertoolnode)).
- **Dynamic Step Routing & Resilience:**
  - `prepareStep`: Uses `prepareStepRouting` to dynamically prune tools based on screen phase (`workspace` vs `results`) and token budgets.
  - `createFailoverLanguageModel`: Transparent provider failover (e.g. Azure OpenAI $\rightarrow$ OpenAI/Agnes) on HTTP 429 rate-limits or 5xx outages.
- **Feedback & Stop Conditions:**
  - `stopWhen`: Halts turn when `isStepCount(6)` or `hasToolCall("ask_user_choice")`.
- **Neighbor References:** [`route.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/app/api/agent/chat/route.ts), [`agent-loop.ts`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/packages/agent-core/src/agent-loop.ts), [`yula-step-router.ts`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/lib/yula-step-router.ts).

#### 🏷️ `PiReliabilityNode`
- **Role:** Pi Reliability and Safety Interceptor. Implements core reliability capabilities:
  - **Tool Loadout Delta (`declareToolChanges`):** Injects explicit `[Tools Loadout Updated]` system notifications when mounted tools change across turns.
  - **Model Cascading (`prepareNextTurn`):** Dynamically escalates or de-escalates model selection and thinking effort across sequential turns.
  - **Stagnation Detection:** Circuit breaker halting on 3 identical consecutive tool signatures.
  - **Dual-Bound Truncation:** Line and byte bounds on large outputs before feeding observations back to context.
  - **FIFO Mutation Line & Effect Gate:** Serialized, non-conflicting UI executions.
- **Inbound Edges:**
  - Upstream: Intercepts all dispatches from [`AgentLoopNode`](#agentloopnode).
- **Outbound Edges:**
  - Downstream: Emits to [`AgentLoopNode`](#agentloopnode) (proceed or abort).
- **Feedback Loop:** Emits Stagnation Halt message if identical tool signatures repeat 3 times consecutively.
- **Neighbor References:** [`agent-loop.ts`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/packages/agent-core/src/agent-loop.ts#L141-L161).

#### 🏷️ `ProceduralMemoryNode`
- **Role:** 3-Tier Layered Wiki & Playbook Service (System $\rightarrow$ Workspace $\rightarrow$ User). Delivers pre-verified screen rules at 0 ms without vector search latency.
- **Inbound Edges:**
  - Upstream: Triggered during `/api/agent/chat` request initialization with `workspaceId` and `pathname`.
- **Outbound Edges:**
  - Downstream: Directly injects rules into [`AgentLoopNode`](#agentloopnode) prompt context.
- **Neighbor References:** [Playbook Procedural Memory](file:///Users/tmr/Source/ArrowApi/.agents/knowledge/playbook-procedural-memory.md).

---

### 2.2. Standard Executable Tool Nodes

#### 🏷️ `DispatchBridgeNode` (`dispatch_component_action`)
- **Role:** Universal dispatch bridge that triggers state mutations on registered UI components without DOM scraping.
- **Contract:** `{ targetId: string, action: string, payload?: Record<string, unknown> }`.
- **Inbound Edges:**
  - Upstream: [`AgentLoopNode`](#agentloopnode), [`HybridRouterNode`](#hybridrouternode).
- **Outbound Edges:**
  - Downstream: Dispatches targeted mutations to [`CriteriaFormNode`](#criteriaformnode), [`ResultGridNode`](#resultgridnode), [`JobHistoryNode`](#jobhistorynode).
- **Feedback Loop (Self-Healing & Validation):**
  - Runs `uiRegistry.preflightValidate()` checking component mounting, deterministic `when` conditions (`route`, `phase`), and `inputSchema`.
  - Runs `uiRegistry.postflightValidate()` against `outputSchema` on action completion. Returns structured errors to [`AgentLoopNode`](#agentloopnode) for self-correction.

#### 🏷️ `StateInspectorNode` (`inspect_ui_state`)
- **Role:** Live state inspection tool. Reads synchronous snapshot metadata, capability schemas, and circular ring-buffer telemetry events from registered components at 0 ms.
- **Contract:** `{ component_id?: string }` $\rightarrow$ returns component live state, active components, and `recent_events`.
- **Inbound Edges:** Upstream: [`AgentLoopNode`](#agentloopnode).
- **Outbound Edges:** Downstream: Reads live state and telemetry of UI component nodes.

#### 🏷️ `ChoiceCardToolNode` (`ask_user_choice`)
- **Role:** Human-in-the-Loop (HITL) Inline Decision Card generator. Renders interactive choice buttons (`YulaChoiceCard`) directly inside the chat stream.
- **Contract:** `{ question: string, choices: Array<{ id: string, label: string, variant?: string }> }`.
- **Inbound Edges:** Upstream: [`AgentLoopNode`](#agentloopnode).
- **Outbound Edges:** Downstream: Presents selectable options to [`UserNode`](#user-node).
- **Feedback Loop (Pause & Resume):**
  - Triggers `stopWhen: hasToolCall("ask_user_choice")`, freezing agent turn execution until the user clicks an option.

#### 🏷️ `MemoryToolNode` (`remember_fact`, `recall_fact`, `forget_fact`)
- **Role:** Session and persistent memory manager for user preferences and ad-hoc facts.
- **Inbound Edges:** Upstream: [`AgentLoopNode`](#agentloopnode).
- **Outbound Edges:** Downstream: LocalStorage / Session memory store.

#### 🏷️ `AppRouterToolNode` (`app_router:NAVIGATE`)
- **Role:** Headless route navigation executor. Changes Next.js routes and switches active workspaces.
- **Contract:** `{ targetPath: string, replace?: boolean }`.
- **Inbound Edges:** Upstream: [`AgentLoopNode`](#agentloopnode), [`HybridRouterNode`](#hybridrouternode).
- **Outbound Edges:** Downstream: Updates [`ActiveScreenContextNode`](#activescreencontextnode).

---

### 2.3. Headless UI Component Nodes (Registered in React)

#### 🏷️ `CriteriaFormNode`
- **Registration ID:** `criteria_form:<activeScope>` (e.g. `criteria_form:stock-balance`).
- **Role:** Schema-generated report filter and criteria form. Handles input validation, preset loading, and job submission.
- **Actions:** `SET_FIELDS`, `SUBMIT`, `RESET_FIELDS`, `LOAD_PRESET`.
- **Inbound Edges:**
  - Upstream: [`DispatchBridgeNode`](#dispatchbridgenode) via `SET_FIELDS` and `SUBMIT`.
- **Outbound Edges:**
  - Downstream: Dispatches job execution request to [`ArrowJobsEngineNode`](#arrowjobsenginenode).
- **Neighbor References:** [Core UI Components ADR](file:///Users/tmr/Source/ArrowApi/.agents/architecture/core-ui-components.md).

#### 🏷️ `ResultGridNode`
- **Registration ID:** `result_grid:active`.
- **Role:** VirtualSpreadsheet / ArrowReportGrid. High-performance data grid backed by Canvas 2D sizing, bi-directional virtualization, and DuckDB WASM.
- **Actions:** `RUN_SQL`, `FILTER`, `APPLY_FILTERS`, `SORT`, `COLUMNS`, `PIN`, `RESET_LAYOUT`, `EXPORT`, `VISUALIZE`, `ANALYZE`, `PROFILE`.
- **Inbound Edges:**
  - Upstream: [`DispatchBridgeNode`](#dispatchbridgenode) via grid actions.
  - Upstream: [`ArrowJobsEngineNode`](#arrowjobsenginenode) via SSE data stream.
- **Outbound Edges:**
  - Downstream: Executes SQL queries on [`DuckDbEngineNode`](#duckdbenginenode).
- **Feedback Loop:** Sends query execution results and row counts back to [`AgentLoopNode`](#agentloopnode) as ReAct observations.
- **Neighbor References:** [DuckDB WASM & OPFS ADR](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md).

#### 🏷️ `JobHistoryNode`
- **Registration ID:** `job_history`.
- **Role:** Execution history panel for Arrow background jobs.
- **Actions:** `LIST`, `SELECT`, `CANCEL`, `REFRESH`.
- **Inbound Edges:** Upstream: [`DispatchBridgeNode`](#dispatchbridgenode).
- **Outbound Edges:** Downstream: Interacts with [`ArrowJobsEngineNode`](#arrowjobsenginenode) to query status or cancel active runs.

---

### 2.4. Backend & Analytical Engine Nodes

#### 🏷️ `ArrowJobsEngineNode`
- **Role:** .NET distributed asynchronous job execution engine (`Arrow.Jobs.*`).
- **Inbound Edges:**
  - Upstream: [`CriteriaFormNode`](#criteriaformnode) via HTTP POST enqueue request.
- **Outbound Edges:**
  - Downstream: Streams batch data and status events to [`ResultGridNode`](#resultgridnode) via Server-Sent Events (SSE).
- **Neighbor References:** [Arrow Jobs Engine ADR](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md), [Report Lifecycle SSE](file:///Users/tmr/Source/ArrowApi/.agents/architecture/report-lifecycle-sse.md).

#### 🏷️ `DuckDbEngineNode`
- **Role:** Client-side embedded analytics engine (DuckDB WASM + OPFS disk storage).
- **Inbound Edges:**
  - Upstream: Query dispatch from [`ResultGridNode`](#resultgridnode).
- **Outbound Edges:**
  - Downstream: Returns filtered record sets, aggregations, and profiling statistics to [`ResultGridNode`](#resultgridnode).

---

## 3. Edges & Flow Dynamics

The system's execution flows along three primary lifecycle graphs:

### 3.1. ReAct Loop & Observation Flow
```
AgentLoopNode (Thought)
   └──> DispatchBridgeNode (Action: dispatch_component_action)
          └──> Preflight Validation (Zod Schema & Mounted Check)
                 ├── [Valid]   ──> CriteriaFormNode / ResultGridNode
                 │                    └──> Component State Mutation
                 │                           └──> Observation Payload ──> AgentLoopNode (Next Thought)
                 └── [Invalid] ──> Structured Error ───────────────────> AgentLoopNode (Self-Healing Step)
```

### 3.2. Human-In-The-Loop (HITL) Execution Flow
1. `AgentLoopNode` reasons that user confirmation or choice is required.
2. `AgentLoopNode` invokes `ChoiceCardToolNode` (`ask_user_choice`).
3. The API route halts multi-step streaming (`stopWhen: hasToolCall("ask_user_choice")`).
4. Client renders an inline, non-modal choice card (`YulaChoiceCard`).
5. User selects an option $\rightarrow$ sends a new message turn back to `AgentLoopNode`.
6. `AgentLoopNode` resumes execution with user's verified intent.

### 3.3. Long-Running Job & SSE Pipeline
1. `AgentLoopNode` issues `SUBMIT` action to `CriteriaFormNode`.
2. `CriteriaFormNode` verifies form values and issues POST to `ArrowJobsEngineNode`.
3. `ArrowJobsEngineNode` enqueues job and returns a `jobId`.
4. Client opens an SSE connection (`/api/jobs/{jobId}/events`).
5. Real-time chunks stream directly into `ResultGridNode` and local `DuckDbEngineNode`.
6. Completion event updates `JobHistoryNode` and informs `AgentLoopNode`.
