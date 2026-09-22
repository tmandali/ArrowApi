# 02 — Reliability & Safety Infrastructure

Source Modules: `packages/agent-core/src/{execution-queue,retry,effect-gate,reconcile,mutation-line,deferred,isolated-runner,hooks}.ts`

---

## 1. Execution Queue (`execution-queue.ts`)

- **Purpose:** Controls action dispatch concurrency and sequence.
- **Modes:**
  - `sequential`: Enforces FIFO execution order for components requiring predictable state transitions (e.g., `filter_form` setting `storeId` before submitting).
  - `parallel`: Dispatches actions immediately for independent or non-conflicting components.
- **Tested via:** `runExecutionQueueTest()` simulation.

---

## 2. Retry Logic (`retry.ts`)

- **Purpose:** Handles transient action execution failures through configurable exponential backoff and jitter.
- **Behavior:** Automatically retries actions that fail due to temporary UI state locks or async component re-renders.
- **Tested via:** `runRetryTest()` simulation.

---

## 3. Side-Effect Gating (`effect-gate.ts`)

- **Purpose:** Distinguishes between idempotent read actions and mutating, side-effecting actions.
- **Policy:** Side-effecting operations (e.g., placing orders, submitting financial reports) must pass gate clearance before execution proceeds.

---

## 4. Lifecycle Hooks & Human-in-the-Loop (`hooks.ts`)

- **Pipeline:** `hookPipeline`
- **Interceptors:**
  - `beforeToolCall`: Intercepts actions before execution. Guarantees **fail-closed** safety (exceptions block the tool instead of crashing the loop) and supports **argument rewriting** (`{ args }`) to sanitize parameters before dispatch.
  - `afterToolCall`: Audits action outcomes, patches details/results, and triggers secondary workflows.
- **Human-in-the-Loop (HITL) & Policy-as-Metadata:**
  When an action requires user consent (such as `filter_form.SUBMIT`), `beforeToolCall` pauses execution, opens [`HitlModal.tsx`](../apps/demo-app/src/components/HitlModal.tsx), and blocks the agent loop (`{ block: { reason, terminate } }`) until explicit approval is granted. The built-in `installSkillPolicyHook` automatically enforces `requiredFields` and approval gates declared in active `SkillMetadata`.

---

## 5. State Reconciliation (`reconcile.ts`)

- **Purpose:** Validates that downstream UI state correctly reflects upstream agent actions.
- **Mechanism:** Compares expected post-action component properties with observed state, issuing corrective adjustments on drift.
- **Tested via:** `runReconcileTest()` simulation.

---

## 6. Mutation Line & Deferred Execution (`mutation-line.ts`, `deferred.ts`)

- **`mutation-line`:** Linearizes atomic state mutations across distinct components, guaranteeing deterministic replayability.
- **`deferred`:** Handles delayed or conditional executions (e.g. actions waiting for network data or modal visibility).
- **Tested via:** `runMutationLineTest()` and `runDeferredTest()` simulations.

---

## 7. Isolated Runner (`isolated-runner.ts`)

- **Purpose:** Executes high-risk or external plugin actions within a sandboxed boundary.
- **Fault Tolerance:** Traps uncaught exceptions within plugin code to prevent global React tree unmounting.

---

## 8. Tool Loadout Delta (`agent-loop.ts`)

- **Purpose:** Tracks tool set modifications as components mount and unmount across page transitions.
- **Mechanism:** `declareToolChanges(context, lastToolNames)` detects added and removed tools, injecting a transparent system event (`[Tools Loadout Updated]: Added: [...], Removed: [...]`) to prevent unmounted component execution errors.

---

## 9. Dynamic Model Cascading (`prepareNextTurn`)

- **Purpose:** Dynamically scales model capability and reasoning effort between conversation turns.
- **Mechanism:** `prepareNextTurn` context hook allows lightweight models (e.g. `gpt-4o-mini`, `gemini-flash`) for routine forms, promoting to heavy analytical reasoning models (e.g. `claude-3-7-sonnet`, `high` effort) during complex SQL or aggregation steps.

---

## 10. Provider Resilience & Failover (`yula-provider-failover.ts`)

- **Purpose:** Provides zero-downtime execution against cloud rate-limits and outages.
- **Mechanism:** `createFailoverLanguageModel` wraps AI SDK language models. On HTTP 429 quota exhaustion or 5xx server errors, execution transparently switches to secondary fallbacks (Azure $\rightarrow$ OpenAI $\rightarrow$ Agnes) without dropping the client connection.
