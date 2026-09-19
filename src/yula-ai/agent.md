# AGENT WORKBOOK: Headless React UI-Agent (Index)

This document is a lightweight **index** and operational guide for autonomous coding agents and developers. It contains no embedded duplicate code; the single source of truth is always the code under `packages/*/src/` and `apps/demo-app/src/`.
Comprehensive architectural documentation is located in the `docs/` directory.

---

## Documentation Map

| Document | Scope & Contents |
| :--- | :--- |
| [`docs/00-overview.md`](./docs/00-overview.md) | Architectural pillars (DOM-independence, bi-directional bridge, preflight validation), monorepo topology, Pi compatibility, and runtime boundary. |
| [`docs/01-core.md`](./docs/01-core.md) | Core primitives: `types`, `event-bus`, `component-registry`, `ActionContract` (`whenToCall` / `whenNotToCall`), the 6 Standard Tools, `auth.ts`, `models-config.ts`, and `server.ts`. |
| [`docs/02-reliability.md`](./docs/02-reliability.md) | Reliability & Safety: `execution-queue`, `retry`, `effect-gate`, `hooks` (HITL / approval pipeline), `reconcile`, `mutation-line`, `deferred`, and `isolated-runner`. |
| [`docs/03-observability.md`](./docs/03-observability.md) | Observability: `pi-event-stream`, `telemetry-metrics`, `session-harness`, `session-branch` (Undo/Redo checkpoints), `session-replay`, and context budget management (`memory`, `compaction`, `truncate`). |
| [`docs/04-extensions.md`](./docs/04-extensions.md) | Extensibility: `dynamic-tools`, `skills`, `plugins`, `lanes`, `steering`, `prompt-templates`, `model-catalog`, `rpc-protocol`, `vision-bridge`, `indexeddb-storage`, `progress`, and `evals`. |
| [`docs/05-react.md`](./docs/05-react.md) | React Bindings: `AgentProvider`, `useAgentChat`, `useAgentComponent`, `useAgentRouter`, and 8 headless React hooks. |
| [`docs/06-demo-app.md`](./docs/06-demo-app.md) | Demo Application: `App.tsx` state machine, component breakdown, `/api/chat` streaming endpoint, 14 Pi simulation tests, and CLI workflows. |
| [`docs/INTEGRATION_GUIDE.md`](./docs/INTEGRATION_GUIDE.md) | Integration Guide: Step-by-step instructions for adding the library to existing projects, component contracts, and mandatory `pnpm simulate` setup. |

---

## Agent Operational Guidelines

When interacting with this codebase as an AI agent:

1. **Bootstrap Sequence:**
   - Always read `docs/00-overview.md` and `docs/01-core.md` before performing architectural modifications.
   - Jump directly to the relevant specialized document (`02` for safety/HITL, `03` for sessions/replay, `05` for React hooks, `06` for UI flows).
2. **Behavioral Contracts & Tooling:**
   - Adhere strictly to the 6 Core Tools: `dispatch_component_action`, `inspect_ui_state`, `remember_fact`, `recall_fact`, `forget_fact`, `time_travel`.
   - Never bypass preflight validation or the `ActionContract` (`whenToCall` and `whenNotToCall`).
3. **Clean Architecture Constraints:**
   - **Single Responsibility & Size Limits:** No file should exceed 500 lines. Break large components into dedicated slices under `components/` or `widget/tabs/`.
   - **Environment Boundary:** Never import Node.js built-ins (`node:fs`, `node:path`, `node:os`) into client bundles (`@my-agent/core`). Server-only modules belong in `@my-agent/core/server`.
4. **Verification Commands:**
   - Verify typing: `pnpm -r typecheck`
   - Run unit tests: `pnpm -r test`
   - Build client bundle: `pnpm --filter demo-app build`
