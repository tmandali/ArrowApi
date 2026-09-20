# 01 — Core Runtime: EventBus, Registry, Tools & Auth

Source Modules: `packages/agent-core/src/{types,event-bus,component-registry,standard-tools,auth,models-config,server}.ts`

---

## 1. Type Definitions (`types.ts`)

- **`ComponentSchema`:** Metadata definition for registered UI components (`id`, `capabilities?`, `actions?`, `meta?`).
- **`ActionContract`:** Strict behavior contract for each action:
  - `schema?`: Optional Zod schema defining payload syntax.
  - `whenToCall`: Explicit positive condition instructing when the agent MUST invoke the action.
  - `whenNotToCall`: Explicit negative boundary instructing when the agent MUST NEVER invoke the action.
- **`UIEvent` & `UIAction`:** Event payload (`source`, `type`, `payload?`, `timestamp`) and dispatched action descriptor (`component_id`, `action`, `payload?`).
- **`UIContextSnapshot`:** Complete context injected into LLM system prompts (`route`, `active_components`, `recent_events`).

---

## 2. Event Bus (`event-bus.ts`)

- **Singleton:** `uiEventBus`
- **Subscription:** `subscribe(id, handler) => unsubscribe` connects mounted React components or headless fallback listeners to downstream agent actions. Supports **stacked/layered handlers** (LIFO); the most recently registered active handler receives dispatched actions.
- **Dispatching:** `dispatch({ component_id, action, payload }) => any` dispatches an action to the active component handler and returns its result (supports both synchronous and `Promise<any>` asynchronous results).
- **Telemetry Buffer:** `recordTelemetry(event)` appends to a 10-event circular ring buffer.
- **Accessors:** `getRecentEvents()` returns chronological events for UI context snapshots; `onTelemetry(listener)` streams live events to monitoring widgets.

---

## 3. Component Registry (`component-registry.ts`)

- **Singleton:** `uiRegistry`
- **Hierarchical / Stacked Lifecycle:** `register(schema)` and `unregister(id)` manage active components. Multiple instances can share an `id` across layers (e.g. root shell headless fallback vs. page-specific DOM instance). When a page component unregisters on unmount, the registry safely falls back to the underlying schema in the stack.
- **Introspection:** `getActiveComponents()`, `hasCapability(id, action)`, `get(id)` (resolves the top-of-stack active schema).
- **Preflight Validation:** `preflightValidate(componentId, action, payload)` verifies:
  1. Target component exists and is mounted (or has an active headless fallback).
  2. Target action is registered in the component's `capabilities`.
  3. Action payload passes the component's Zod schema (returning detailed issue messages on failure).
- **Dynamic Prompt Formatting:** `formatActiveComponentsPrompt()` translates mounted components and their `whenToCall` / `whenNotToCall` contracts into formatted XML for the LLM system prompt.

---

## 4. The 6 Standard Core Tools (`standard-tools.ts`)

The agent operates through a canonical set of 6 tools:

| Tool Name | Domain | Primary Responsibility |
| :--- | :--- | :--- |
| `dispatch_component_action` | UI Bridge | Dispatches actions to active components after preflight validation. Fully awaits asynchronous handler results (`Promise<ActionResult>`). |
| `inspect_ui_state` | Reflection | Reads currently mounted components, active capabilities, and ring-buffer telemetries. |
| `remember_fact` | Memory (C) | Stores user preferences or facts into `session` or `persistent` storage. |
| `recall_fact` | Memory (R) | Queries stored memory facts. |
| `forget_fact` | Memory (D) | Deletes obsolete facts from agent memory. |
| `time_travel` | Replay | Restores application state backward (`undo`) or forward (`redo`). |

- **Server Tool Factory & Schemas:**
  - Standard tools define strict Zod `outputSchema` alongside `inputSchema` ensuring runtime type integrity for downstream clients.
  - Dynamically builds tools for Vercel AI SDK (`streamText`) using runtime UI context, custom action schemas, and server-side validation callbacks (`onValidateAction`).
- **Dynamic Step Routing (`prepareStepRouting`):**
  - Prunes inactive tools dynamically during multi-step execution based on screen phase (`workspace` criteria setting vs `results` grid querying) to save prompt tokens and prevent hallucinated tool dispatches.
- **Async Safety:** `executeComponentAction` securely awaits asynchronous execution pipelines through the `EffectGate` boundary.

---

## 5. React Integration (`use-agent-component.ts`)

- Hook: `useAgentComponent({ id, capabilities, executionMode?, meta?, actions?, onAction })`
- Automatically registers the component with `uiRegistry` and attaches listeners to `uiEventBus` on mount.
- Automatically unregisters and cleans up event listeners on unmount.

---

## 6. Server Authentication & Models Configuration (`auth.ts`, `models-config.ts`, `server.ts`)

- **Pi Coding Agent Compatibility:**
  - `auth.json`: Supports both `api_key` and `oauth` credentials, automatic alias resolution (`agnes-ai` ↔ `agnes`), and `0600` file permission enforcement.
  - `models.json`: Supports JSONC comments, optional `defaultProvider` and `defaultModel` with automatic resolution via `settings.json` or first provider fallback.
  - Secret Isolation: Zod schema strictly forbids `apiKey` in `models.json` to prevent accidental credential exposure.
- **Server Module Export:** Exposed through `@my-agent/core/server` to prevent Node.js built-ins (`fs`, `path`, `os`) from leaking into browser bundles.
