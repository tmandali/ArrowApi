# ArrowApi Developer Agent Wiki

This is the modular knowledge base, Architectural Decision Record (ADR) repository, and engineering standards catalog for AI coding agents (Antigravity, Cursor, Claude Code, etc.) and software engineers across the ArrowApi and Yula ecosystem.

> [!TIP]
> Do NOT load all documents into your prompt at once. Read only the specific topic relevant to your active task using `view_file`.

---

## ⚡ Documentation Language & Maintenance Protocol

1. **English-Only Mandate:** All files under `.agents/` and all `AGENTS.md` router files MUST be written and updated exclusively in technical English. Communicating with the user remains in the user's preferred language (e.g. Turkish).
2. **Evolutive Maintenance:** When a new architectural decision, permanent convention, or user rule correction occurs during conversation:
   - Update the relevant focused `.agents/*.md` document in English.
   - Append a dated entry describing the rationale and decision to [`.agents/log.md`](file:///Users/tmr/Source/ArrowApi/.agents/log.md).
   - Inform the user that the knowledge base and decision log have been updated.
3. **Graph-Native (Node & Edge) Mandate:** All architectural documentation, agent workflows, and component interaction maps MUST be structured as Directed Graphs containing:
   - Section 1: Mermaid System Graph Topology.
   - Section 2: Nodes Catalog with roles, schemas/contracts, and inbound/outbound edges.
   - Section 3: Edges & Flow Dynamics with feedback loops, HITL pauses, and reciprocal neighbor links.
   - Detailed specification: [Graph Documentation Standard](file:///Users/tmr/Source/ArrowApi/.agents/standards/graph-documentation-standard.md).

---

## 🧭 Repository Layers & Workspace Routers

Follow the operational guide corresponding to your current development layer:

- 🌐 **Master Graph Topology:** [`src/yula-ai/agent.md`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md)  
  *Role:* Canonical system graph, node/edge catalog, and ReAct/HITL feedback loops.
- 📦 **Core Library Layer:** [`src/yula-ai/AGENTS.md`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/AGENTS.md)  
  *Role:* Pure `@my-agent` UI-Agent engine, React hooks, Pi reliability layer, and Playbook adapters. Strictly domain-agnostic (ERP terms forbidden).
- 🖥️ **Application Layer:** [`src/Sims/yula.client/AGENTS.md`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/AGENTS.md)  
  *Role:* Yula ERP/Sims views, DuckDB reports, single-page report lifecycle, and Next.js routes.

---

## 🗺️ Topic Catalog & Reference Map

| Category | Topic / Document | When to Read? |
| :--- | :--- | :--- |
| **Standards** | [Graph Documentation Standard](file:///Users/tmr/Source/ArrowApi/.agents/standards/graph-documentation-standard.md) | Authoring or refactoring any agent or architecture doc into the Node & Edge graph format (**Enforced Rule**). |
| **Architecture (ADR)** | [Master System Graph](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md) | Understanding the full topological flow, ReAct cycles, HITL gates, and component interactions across the ecosystem. |
| **Architecture (ADR)** | [Headless React Agent](file:///Users/tmr/Source/ArrowApi/.agents/architecture/headless-react-agent.md) | Working on Yula AI, `@my-agent`, ReAct/Plan modes, telemetry, or UI action integration. |
| **Architecture (ADR)** | [Core UI Components & Platform](file:///Users/tmr/Source/ArrowApi/.agents/architecture/core-ui-components.md) | Working on VirtualSpreadsheet (Airtable/Excel grid), Schema-Generated Criteria Forms, or Yula Client shell. |
| **Architecture (ADR)** | [Arrow Jobs Engine](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md) | Working on .NET background job execution, `Arrow.Jobs.*` backend, or client job integration. |
| **Architecture (ADR)** | [Report Lifecycle & SSE](file:///Users/tmr/Source/ArrowApi/.agents/architecture/report-lifecycle-sse.md) | Working on single-page report streams, Server-Sent Events (SSE), anti-buffering, or job lifecycle. |
| **Architecture (ADR)** | [Big Data & DuckDB WASM](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md) | Working on `<ArrowReportGrid />`, OPFS disk cache, DuckDB SQL queries, or the 10-row sampling rule. |
| **Architecture (ADR)** | [Module Federation & Workspaces](file:///Users/tmr/Source/ArrowApi/.agents/architecture/module-federation.md) | Adding/modifying workspaces (`src/workspaces/<workspace>`), module boundaries, or Public API `index.ts`. |
| **Standards** | [Frontend Coding Standards](file:///Users/tmr/Source/ArrowApi/.agents/standards/frontend-rules.md) | Reviewing the 500-line rule, Fast Refresh (hook/provider separation), shadcn immutability, or i18n rules. |
| **Standards** | [Development Operations & Ports](file:///Users/tmr/Source/ArrowApi/.agents/standards/dev-operations.md) | Known local development ports (56402, 5168, 7137, 3000) and instant shutdown commands. |
| **Standards** | [New Report / Agent Checklist](file:///Users/tmr/Source/ArrowApi/.agents/standards/new-report-checklist.md) | Adding a new report screen, criteria schema, or YAML agent manifest (**Mandatory Checklist**). |
| **Standards** | [Inline HITL Standards](file:///Users/tmr/Source/ArrowApi/.agents/standards/inline-hitl-standards.md) | Designing user confirmations, decision chips (`ask_user_choice`), choice cards, and modal ban. |
| **Knowledge (TO-BE)** | [Tauri Hybrid Desktop](file:///Users/tmr/Source/ArrowApi/.agents/knowledge/tauri-hybrid.md) | **TO-BE / Inactive**: Future desktop shell roadmap; currently out of scope. |
| **Knowledge (TO-BE)** | [Python AI Sidecar](file:///Users/tmr/Source/ArrowApi/.agents/knowledge/python-sidecar.md) | **TO-BE / Inactive**: Future embedded Python engine roadmap; currently out of scope. |
| **Knowledge** | [Procedural Memory & Playbook](file:///Users/tmr/Source/ArrowApi/.agents/knowledge/playbook-procedural-memory.md) | Karpathy LLM Wiki pattern, `storage/wiki/...`, screen rules, and `useAgentPlaybook` adapters. |
| **History** | [Decision Audit Log](file:///Users/tmr/Source/ArrowApi/.agents/log.md) | Historical record and rationale of all architectural decisions taken in this project. |
