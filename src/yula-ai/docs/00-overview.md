# 00 — System Overview & Architecture

> Canonical Index: [`agent.md`](../agent.md)

---

## Core Architectural Principles

1. **DOM Independence (Headless React UI Operation):**
   - Eliminates fragile visual selectors (CSS/XPath) and slow headless browsers (Playwright/Puppeteer/Selenium).
   - The AI agent directly controls the user interface through state mutation contracts orchestrated by `uiEventBus` and `uiRegistry`.
2. **Bi-Directional Reactive Bridge:**
   - **Upstream (UI → Agent):** Every meaningful user interaction generates an event via `uiEventBus.recordTelemetry()`, stored in a 10-event ring-buffer telemetries snapshot and streamed through `piEventStream`.
   - **Downstream (Agent → UI):** The agent inspects state and executes actions using the 6 Standard Tools, primarily `dispatch_component_action` and `time_travel`.
3. **Preflight Validation & Self-Healing:**
   - Before any action is executed, `uiRegistry.preflightValidate()` confirms that the target component is currently mounted, supports the requested action capability, and that the payload conforms to the component's Zod schema.
   - If validation fails, an informative, structured error is returned, allowing the agent to self-heal and re-evaluate without breaking the UI.
4. **Action Behavioral Contracts (`ActionContract`):**
   - Each registered action explicitly defines `whenToCall` (positive activation trigger) and `whenNotToCall` (negative guardrail), preventing hallucinatory or premature tool dispatching.
5. **Runtime Boundary & Security:**
   - Client bundle (`@my-agent/core`) contains zero Node.js built-ins.
   - Server-only modules (`auth.ts`, `models-config.ts`) reside in `@my-agent/core/server`.
   - Sensitive credentials never leak into git or model definitions; permissions are strictly managed (`0600`).

---

## Monorepo Topology

- **`packages/agent-core` (`@my-agent/core`):**
  - Framework-agnostic agent runtime consisting of 37 modules (primitives, reliability gates, observability, and extensions).
  - Subpath export `./server` provides file-backed auth and model configuration resolvers.
- **`packages/agent-react` (`@my-agent/react`):**
  - 100% Headless React bindings and state hooks (`AgentProvider`, `useAgentChat`, `useAgentComponent`, `useAgentRouter`, and 8 auxiliary hooks).
  - Pure state and event machines with zero CSS/styling dependencies, allowing any consuming application to connect its own UI, design system (Tailwind, Shadcn, MUI, etc.), and themes.
- **`apps/demo-app`:**
  - Modern Vite + React demonstration workspace.
  - Implements a reference sliding `AgentWidget` UI with 7 diagnostic tabs, multi-screen retail flow (`/reports` and `/dashboard`), simulation panels, and Vite server middleware (`/api/chat`).
