# Procedural Memory & LLM Playbook Architecture

This document explains the procedural memory system inspired by Karpathy's "LLM Wiki / Playbook" pattern, its multi-tiered hierarchy, and its integration with `@my-agent`.

---

## 1. Why Procedural Memory?

Semantic memory (vector search/RAG) stores user preferences ("User prefers dark mode"), whereas **procedural memory (playbook)** records actionable execution steps ("When running the stock variance report, always select warehouse 01 and sort descending by variance in the result grid").

Procedural memory prevents repetitive trial-and-error reasoning, guiding the agent to follow verified workflows immediately.

---

## 2. Multi-Tiered Wiki Architecture (System $\rightarrow$ Workspace $\rightarrow$ User)

Operational rules are stored and merged across a 3-tier hierarchy:

1. **System Tier (`storage/wiki/system/`):** Baseline operating procedures and platform defaults.
2. **Workspace Tier (`storage/wiki/<workspace>/`):** Domain-specific guidelines (stock, sales, accounting).
3. **User Tier (`storage/wiki/users/<userId>/`):** User customizations and explicit corrections.

> [!TIP]
> **Precedence Order:**
> `User Rule` $>$ `Workspace Rule` $>$ `System Rule`. More specific scopes override higher-level defaults.

---

## 3. Library vs. Application Layer Separation

The playbook architecture is decoupled cleanly:
- **Library Layer (`@my-agent/core` & `@my-agent/react`):**
  - `AgentPlaybookStorage` contract: Storage-agnostic abstraction.
  - `RestPlaybookStorage` (server API) and `LocalStoragePlaybookStorage` (browser storage).
  - `AgentProvider` Dependency Injection: Easily overridden via the `playbookStorage` prop in any React app.
  - `useAgentPlaybook` hook: Enables components to read and propose rule updates.
- **Application Layer (`yula.client`):**
  - `PlaybooksManagementView.tsx`: User interface for reviewing and managing operational playbooks.
  - `/api/agent/playbook/*`: Next.js endpoints persisting Markdown files to server storage.

---

## 4. Transparent Worked Steps

As the agent runs, playbook access and updates are rendered transparently in `yula-worked-steps.tsx`:
- **Read Step:** `📖 Read 2 rules from Workspace Wiki (stock)`
- **Update Step:** `📝 Proposed Wiki Rule Update (stock:balance)`

---

## 5. Graph-Native Workflow Recipes (DAG Architecture)

While single-screen guidelines (`screen_rule`) remain flat Markdown items, multi-step execution plans (`workflow_recipe`) are modeled as **Directed Acyclic Graphs (DAGs)** to ensure zero-hallucination deterministic ReAct execution and live observability.

```mermaid
graph TD
    classDef action fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef hitl fill:#701a75,stroke:#f472b6,stroke-width:2px,color:#fdf2f8;
    classDef cond fill:#b45309,stroke:#fbbf24,stroke-width:2px,color:#fef3c7;
    classDef term fill:#14532d,stroke:#4ade80,stroke-width:2px,color:#f0fdf4;

    Step1["Step 1: Navigate Screen<br/>(ActionNode)"]:::action
    Step2["Step 2: Set Form Criteria<br/>(ActionNode)"]:::action
    Step3["Step 3: Run Engine Query<br/>(ActionNode)"]:::action
    Step4{"Step 4: Check Variance<br/>(ConditionNode)"}:::cond
    Step5["Step 5: Manager Approval<br/>(HitlNode)"]:::hitl
    Step6["Step 6: Finalize Batch<br/>(TerminalNode)"]:::term

    Step1 -->|dependsOn| Step2
    Step2 -->|dependsOn| Step3
    Step3 -->|dependsOn| Step4
    Step4 -->|variance > threshold| Step5
    Step4 -->|variance <= threshold| Step6
    Step5 -->|Approved| Step6
```

### 5.1. Engine & Canvas Architecture
- **Pure Core Engine (`@my-agent/core`):**
  - [`PlaybookDAG`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/packages/agent-core/src/playbook-graph.ts): Zero-dependency typed DAG container implementing Tarjan DFS cycle detection, Kahn's topological sorting, predecessor/successor lookups, and Markdown step serialization.
  - Mathematical Linting: `PlaybookService.lint()` detects circular dependencies and orphaned workflow steps during static validation.
- **Client Canvas (`yula.client`):**
  - [`WorkflowGraphCanvas.tsx`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/workspaces/my/components/playbooks/workflow-graph-canvas.tsx): Interactive React Flow (`@xyflow/react`) canvas styled with Shadcn UI cards.
  - Auto-Layout Engine: `@dagrejs/dagre` calculates hierarchical layout coordinates dynamically in-browser, keeping disk Markdown files clean, human-readable, and git-diff friendly without hardcoding pixel coordinates.
  - Dual Mode View: [`PlaybooksManagementView.tsx`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/src/workspaces/my/components/playbooks/playbooks-management-view.tsx) supports instant switching between the list Card View and the interactive Graph (DAG) View.

---

## 6. Two-Tier Retrieval & Tool-as-a-Subagent Pattern

To prevent **Context Window Bloat** as corporate recipe catalogs scale to hundreds of entries, the system uses a **Two-Tier Retrieval Architecture** based on the Vercel AI SDK "Tool-as-a-Subagent" (Nested Worker) pattern:

```mermaid
graph TD
    classDef client fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef main fill:#0f172a,stroke:#818cf8,stroke-width:2px,color:#f8fafc;
    classDef subagent fill:#4c1d95,stroke:#c084fc,stroke-width:2px,color:#f5f3ff;
    classDef store fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#ecfdf5;

    User["User Turn"]:::client --> Main["Main UI Agent (Level 0)"]:::main
    Main -- "1. query_playbook(task, ws)" --> Sub["Playbook Retrieval Sub-Agent"]:::subagent
    
    subgraph SubagentSandbox ["Isolated Worker Sandbox (generateText)"]
        Sub --> Search["search_catalog (Fuzzy Index)"]:::subagent
        Sub --> Inspect["inspect_recipe (DAG Inspection)"]:::subagent
        Sub --> Match["Semantic Intent Matchmaking"]:::subagent
    end

    Search <--> WikiStore[("Workspace Wiki Storage")]:::store
    Inspect <--> WikiStore

    Match -- "2. Curated DAG & Verified Steps" --> Main
    Main -- "3. HITL Action Card (Approval)" --> User
```

### Key Architectural Benefits:
1. **Zero Context Bloat:** Only active screen rules (1–3 lines) reside in Level-0 prompt. Workflow recipes are decoupled from the system prompt, saving 30k–100k tokens per request.
2. **Semantic Intent Resolution:** Natural language business requests (e.g., *"ay sonu depo sayımını eşitle"*) are mapped to verified corporate recipe IDs (`recipe-stock-reconciliation`) via isolated subagent reasoning rather than brittle keyword overlap.
3. **Resilient Pi Fallback:** If the subagent fails or times out (3500 ms limit), execution seamlessly drops into local deterministic index search without UI disruption.

