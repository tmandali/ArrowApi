# ArrowApi Developer Agent Guidelines

This file is the **lightweight Master Router** for AI coding agents and human engineers. Detailed architectural decisions (ADRs), coding standards, and step-by-step checklists are maintained modularly in the [Developer Agent Wiki](file:///Users/tmr/Source/ArrowApi/.agents/index.md).

---

## ⚡ 5 Golden Rules (Enforced)

1. **Shadcn UI Immutability:** Never modify `components/ui/*` directly (strictly protected by `.oxlintrc.json`).
2. **500-Line Limit:** No source code, test, or documentation file may exceed 500 lines (`wc -l`).
3. **Module Boundaries (Public API):** Cross-workspace direct imports are strictly forbidden; external modules must consume only the workspace's `index.ts` entry point.
4. **English-Only Docs & Evolutive Wiki Protocol:** All repository documentation, instructions, and `.agents/**/*.md` files MUST be written and updated exclusively in technical English (while conversing with the user in their preferred language, e.g. Turkish). Whenever a permanent architectural decision or rule correction is made, the agent MUST update the relevant `.agents/*.md` document in English and append an entry to `.agents/log.md`.
5. **Graph-Native (Node & Edge) Documentation Standard:** All architecture, agent workflows, and component interactions MUST be documented using the Directed Graph standard (Mermaid topology, Nodes with Inbound/Outbound contracts, Edges with feedback/safety loops, and traversable neighbor markdown links) per [Graph Documentation Standard](file:///Users/tmr/Source/ArrowApi/.agents/standards/graph-documentation-standard.md).

---

## 🧭 Repository Map & Submodule Routers

Read the specialized instructions for your active scope before writing any code:

| Scope | Module / File | Responsibility Area |
| :--- | :--- | :--- |
| 🌐 **Master Graph Topology** | [`src/yula-ai/agent.md`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md) | Canonical system graph, node/edge catalog, and ReAct/HITL feedback loops. |
| 📦 **Core Library** | [`src/yula-ai/AGENTS.md`](file:///Users/tmr/Source/ArrowApi/src/yula-ai/AGENTS.md) | Pure `@my-agent` UI-Agent runtime, headless React hooks, Pi reliability layer (domain/ERP terms forbidden). |
| 🖥️ **Yula Client App** | [`src/Sims/yula.client/AGENTS.md`](file:///Users/tmr/Source/ArrowApi/src/Sims/yula.client/AGENTS.md) | Next.js ERP/Sims views, DuckDB reports, single-page report lifecycle, and business workspaces. |
| 📚 **Central Architecture Wiki** | [`.agents/index.md`](file:///Users/tmr/Source/ArrowApi/.agents/index.md) | System-wide ADRs, quality standards, new report checklist, and decision audit log. |

---

## 🗺️ Quick Wiki Reference Catalog

- **Master System Graph:** [Canonical System Graph Index](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md)
- **Graph Documentation Standard:** [Graph-Native Standards & Node Templates](file:///Users/tmr/Source/ArrowApi/.agents/standards/graph-documentation-standard.md)
- **Agent Architecture & Tools:** [Headless React Agent & ReAct Modes](file:///Users/tmr/Source/ArrowApi/.agents/architecture/headless-react-agent.md)
- **Core UI Components:** [Virtual Spreadsheet, Criteria Forms & Yula Client](file:///Users/tmr/Source/ArrowApi/.agents/architecture/core-ui-components.md)
- **Arrow Jobs (.NET Backend):** [Distributed Job Engine & Execution](file:///Users/tmr/Source/ArrowApi/.agents/architecture/arrow-jobs-engine.md)
- **Report Lifecycle:** [Single-Page Reports & SSE Stream](file:///Users/tmr/Source/ArrowApi/.agents/architecture/report-lifecycle-sse.md)
- **Big Data & Tables:** [DuckDB WASM & OPFS Disk Cache](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md)
- **Workspaces & Remotes:** [Module Federation Standards](file:///Users/tmr/Source/ArrowApi/.agents/architecture/module-federation.md)
- **Bounded Contexts & Menus:** [1 Menu Item = 1 Bounded Context Architecture](file:///Users/tmr/Source/ArrowApi/.agents/standards/bounded-context-menu-standard.md)
- **Workspace Orchestration & Sagas:** [Multi-Orchestrator & Saga Workflow Architecture](file:///Users/tmr/Source/ArrowApi/.agents/standards/workspace-orchestration-saga-standard.md)
- **Coding Standards:** [Frontend Rules & i18n](file:///Users/tmr/Source/ArrowApi/.agents/standards/frontend-rules.md)
- **Dev Operations & Ports:** [Process Lifecycle & Fast Shutdown](file:///Users/tmr/Source/ArrowApi/.agents/standards/dev-operations.md)
- **Adding Reports:** [6-Step Report/Agent Checklist](file:///Users/tmr/Source/ArrowApi/.agents/standards/new-report-checklist.md)
- **Human In The Loop:** [Inline HITL Standards](file:///Users/tmr/Source/ArrowApi/.agents/standards/inline-hitl-standards.md)
- **Procedural Memory:** [Playbook & Layered Wiki](file:///Users/tmr/Source/ArrowApi/.agents/knowledge/playbook-procedural-memory.md)
- **Decision History:** [Architecture Decision Log](file:///Users/tmr/Source/ArrowApi/.agents/log.md)
