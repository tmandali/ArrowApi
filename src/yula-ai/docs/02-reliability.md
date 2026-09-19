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
  - `beforeToolCall`: Intercepts actions before they reach the component handler.
  - `afterToolCall`: Audits action outcomes and triggers secondary workflows.
- **Human-in-the-Loop (HITL):**
  When an action requires user consent (such as `filter_form.SUBMIT`), `beforeToolCall` pauses execution, opens [`HitlModal.tsx`](../apps/demo-app/src/components/HitlModal.tsx), and blocks the agent loop (`{ block: { reason, terminate } }`) until explicit approval is granted.

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
