# 04 — Extensibility, Plugins, Protocols & Evaluations

Source Modules: `packages/agent-core/src/{dynamic-tools,skills,plugins,lanes,steering,prompt-templates,model-catalog,rpc-protocol,vision-bridge,indexeddb-storage,cbor-codec,adaptive-publisher,progress,evals}.ts`

---

## 1. Dynamic Tools & Skills (`dynamic-tools.ts`, `skills.ts`)

- **Dynamic Tool Generation:** Automatically synthesizes custom tool signatures from live component schemas on the fly.
- **Skills Architecture (`skillsManager`):**
  - Modular skill definitions scoped by active route or mounted components (e.g., `reports-filtering-skill`, `dashboard-overview-skill`).
  - Registers slash commands (such as `/report`, `/summary`, `/clear`).
  - Dynamically injects available skill guidelines into LLM system prompts via `formatSkillsPrompt()`.

---

## 2. Plugin Ecosystem (`plugins.ts`)

- **Registry:** `pluginRegistry`
- **Capabilities:** Allows third-party logic to inject custom hooks, actions, and validation logic into the agent pipeline.
- **Demo Reference:** [`loyaltyDiscountPlugin.ts`](../apps/demo-app/src/plugins/loyaltyDiscountPlugin.ts), showcasing automatic coupon deduction when viewing high-value reports. Visualized in [`PluginShowcaseCard.tsx`](../apps/demo-app/src/components/PluginShowcaseCard.tsx).

---

## 3. Parallel Lanes & Concurrency (`lanes.ts`)

- **Purpose:** Segregates agent workloads into prioritized execution lanes (e.g., `ui-lane`, `background-analytics-lane`, `telemetry-lane`).
- **React Hook:** [`useAgentLanes`](../packages/agent-react/src/use-agent-lanes.ts).
- **Tested via:** `runLanesTest()` simulation.

---

## 4. Steering & Follow-up Injection (`steering.ts`)

- **Live Steering:** Allows user or system interrupts to redirect an ongoing multi-step reasoning plan midway.
- **Follow-up Queue:** Enqueues sequential commands to be processed immediately upon completion of the active turn.
- **Tested via:** `triggerSteerSimulation()` and `triggerFollowUpSimulation()`.

---

## 5. Transport Protocols: RPC & CBOR (`rpc-protocol.ts`, `cbor-codec.ts`)

- **JSON-RPC 2.0 Protocol:** Structured bidirectional communication for external headless runners, IDE sidecars, or microservices.
- **CBOR Codec:** Binary object representation for high-frequency telemetries, reducing payload overhead.

---

## 6. Vision Bridge & Persistent Client Storage (`vision-bridge.ts`, `indexeddb-storage.ts`)

- **Vision Bridge:** Captures DOM canvas snapshots and formats image blocks for multimodal LLMs (`claude-3-5-sonnet`, `gpt-4o`, `agnes-2.5-flash`).
- **IndexedDB Storage:** Persists offline session logs, traces, and large telemetry caches in the browser.
- **Demonstrated via:** [`VisionAndStorageDemo.tsx`](../apps/demo-app/src/components/VisionAndStorageDemo.tsx).

---

## 7. Task Progress & Evaluation Harness (`progress.ts`, `adaptive-publisher.ts`, `evals.ts`)

- **Task Progress:** Emits granular percentage and status updates during lengthy multi-step tool executions ([`ProgressDemo.tsx`](../apps/demo-app/src/components/ProgressDemo.tsx)).
- **Adaptive Publisher:** Throttles or debounces streaming telemetry updates based on browser framerate and network speed.
- **Evaluations Engine (`evals`):** Built-in automated testing suite comparing agent execution traces against expected outputs ([`EvalsRunnerView.tsx`](../apps/demo-app/src/components/EvalsRunnerView.tsx)).
