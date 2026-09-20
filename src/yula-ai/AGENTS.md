# AGENT WORKBOOK: Headless React UI-Agent (@my-agent)

This document is the **library-level operational guide** for AI coding agents and human engineers developing `@my-agent` (`@my-agent/core` & `@my-agent/react`).

> [!IMPORTANT]
> **Domain-Agnostic Purity Rule:**
> This library is strictly domain-agnostic. NEVER introduce ERP, stock, invoicing, customer, or accounting business logic or terminology into this codebase. Develop only pure UI-Agent runtime primitives (EventBus, State Machine, Pi Reliability Layer, Playbook adapters, etc.).

---

## 🗺️ Documentation Map

Detailed architectural documentation is located in the `docs/` directory:

| Document | Scope & Contents |
| :--- | :--- |
| [`agent.md`](./agent.md) | **Master System Graph (Topology):** Canonical Node/Edge catalog, ReAct loops, and HITL flow. |
| [`docs/00-overview.md`](./docs/00-overview.md) | Core pillars (DOM independence, bidirectional bridge, preflight validation), monorepo topology, and runtime boundaries. |
| [`docs/01-core.md`](./docs/01-core.md) | Primitives: `types`, `event-bus`, `component-registry`, `ActionContract` (`whenToCall` / `whenNotToCall`), and the 6 Standard Tools. |
| [`docs/02-reliability.md`](./docs/02-reliability.md) | Reliability & Safety: `execution-queue`, `retry`, `effect-gate`, `hooks` (HITL approval pipeline), `mutation-line`, `deferred`. |
| [`docs/03-observability.md`](./docs/03-observability.md) | Observability: `pi-event-stream`, telemetry metrics, session branching, and context management (`memory`, `truncate`). |
| [`docs/04-extensions.md`](./docs/04-extensions.md) | Extensibility: `skills`, `plugins`, `lanes`, `steering`, `prompt-templates`, `model-catalog`, `playbook`. |
| [`docs/05-react.md`](./docs/05-react.md) | React Bindings: `AgentProvider`, `useAgentChat`, `useAgentComponent`, `useAgentPlaybook`, and headless React hooks. |
| [`docs/06-demo-app.md`](./docs/06-demo-app.md) | Demo App: `App.tsx` state machine, component breakdown, 14 Pi simulation tests. |
| [`docs/INTEGRATION_GUIDE.md`](./docs/INTEGRATION_GUIDE.md) | Integration Guide: Step-by-step instructions for adding the library to external React applications. |

---

## ⚡ Library Development Guidelines

1. **6 Core Tools Contract:** `dispatch_component_action`, `inspect_ui_state`, `remember_fact`, `recall_fact`, `forget_fact`, `time_travel`.
2. **Environment Boundary (Isomorphic Safety):** Never import Node.js built-ins (`node:fs`, `node:path`) into the core client bundle (`@my-agent/core`). Server-only modules belong exclusively in `@my-agent/core/server`.
3. **500-Line Limit:** No source code or test file may exceed 500 lines (`wc -l`).
4. **Verification Commands:**
   - Typecheck: `pnpm -r typecheck`
   - Unit tests: `pnpm -r test`
   - Demo app build: `pnpm --filter demo-app build`
