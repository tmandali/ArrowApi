---
name: ui-agent-dev
description: >-
  Use this skill whenever building, modifying, or integrating Headless React UI-Agent components,
  defining Zod action contracts (whenToCall/whenNotToCall), configuring UI event buses,
  or writing and running end-to-end agent simulations via `pnpm simulate`.
---

# UI-Agent Development Skill (for Autonomous Code Agents)

This skill provides step-by-step procedures, architectural guardrails, and templates for AI coding agents to integrate the **Headless React UI-Agent** architecture (`@my-agent/core` and `@my-agent/react`) into applications.

---

## 🎯 Primary Workflows

1. [Workflow 1: Making React Components "Agent-Ready"](#workflow-1-making-react-components-agent-ready)
2. [Workflow 2: Setting up & Running Agent Simulations (`pnpm simulate`)](#workflow-2-setting-up--running-agent-simulations-pnpm-simulate)
3. [Workflow 3: Router & Multi-Screen State Bridging](#workflow-3-router--multi-screen-state-bridging)
4. [Workflow 4: Verification & Clean Architecture Guardrails](#workflow-4-verification--clean-architecture-guardrails)

---

## Workflow 1: Making React Components "Agent-Ready"

When the user asks to create or adapt a React component for the agent:

### 1. Requirements Checklist
Every agent-controllable component MUST provide:
- **`id`** (string): Unique identifier across the entire application (e.g., `sales_filter_form`, `product_table`).
- **`actions`** (`Record<string, ActionContract>`): First-class action contract containing:
  - `schema`: Zod validation schema for action payload (mandatory for Preflight validation and Self-Healing).
  - `whenToCall`: Clear positive guidance instructing the LLM when to trigger this action.
  - `whenNotToCall`: Negative guardrails preventing premature, repeated, or destructive execution.
  - `description`: Optional concise explanation of the action.
- **`capabilities`** (string[], optional): Explicit list of uppercase action verbs (auto-inferred from `Object.keys(actions)` if omitted).
- **`onAction` callback**: Handler executing React state mutations and returning `{ success: boolean, message?: string, error?: string }`.

### 2. Component Implementation Pattern

```tsx
import React, { useState } from 'react';
import { z } from 'zod';
import { useAgentComponent } from '@my-agent/react';

// Step 1: Define strict Zod schemas for all actions
export const FilterActionSchema = z.object({
  storeId: z.string().min(1, 'storeId boş olamaz'),
  dateRange: z.string().regex(/^\d{4}-\d{2}$/, 'dateRange YYYY-MM formatında olmalıdır (örn: 2026-09)'),
});

export const FilterComponent: React.FC = () => {
  const [storeId, setStoreId] = useState('');
  const [dateRange, setDateRange] = useState('');

  // Step 2: Register with useAgentComponent
  useAgentComponent({
    id: 'filter_form',
    actions: {
      SET_FIELDS: {
        schema: FilterActionSchema,
        whenToCall: 'Kullanıcı mağaza veya tarih filtresi girmek istediğinde çağrılır.',
        whenNotToCall: 'Alanlar zaten doğru doldurulmuşsa tekrar çağrılmamalıdır.',
      },
      SUBMIT: {
        schema: z.object({}),
        whenToCall: 'storeId ve dateRange eksiksiz girildikten sonra raporu çalıştırmak için çağrılır.',
        whenNotToCall: 'Filtre alanlarından biri eksikken veya kullanıcı sadece soru sorduğunda ASLA çağrılmamalıdır.',
      },
    },
    onAction: (action, payload) => {
      if (action === 'SET_FIELDS') {
        if (payload.storeId) setStoreId(payload.storeId);
        if (payload.dateRange) setDateRange(payload.dateRange);
        return { success: true, message: 'Filtreler başarıyla güncellendi' };
      }
      if (action === 'SUBMIT') {
        executeSearch();
        return { success: true, message: 'Arama başlatıldı' };
      }
      return { success: false, error: `Bilinmeyen aksiyon: ${action}` };
    },
  });

  const executeSearch = () => { /* Business logic */ };

  return (
    <div>
      {/* UI rendering */}
    </div>
  );
};
```

---

## Workflow 2: Setting up & Running Agent Simulations (`pnpm simulate`)

> [!IMPORTANT]
> Headless UI-Agents cannot be tested solely with standard DOM unit tests. Every project MUST have a dedicated `agent-simulation.test.ts` test file and a `simulate` npm script.

### 1. Add `simulate` Script to `package.json`
```json
{
  "scripts": {
    "test": "vitest run",
    "simulate": "vitest run src/agent-simulation.test.ts"
  }
}
```

### 2. The 16 Simulation Phases Architecture
When authoring or updating `agent-simulation.test.ts`, ensure all core reliability and observability stages are covered:

1. **Aşama 1: Zod Preflight & Self-Healing** (Inject invalid payload, verify rejection, then replay healed payload).
2. **Aşama 2: Human-in-the-Loop (HITL)** (`hookPipeline.beforeToolCall` intercepting and approving/blocking).
3. **Aşama 3: Steering & Follow-up Queue** (`steeringManager.steer` and `followUp`).
4. **Aşama 4: Dual-Bound Truncation** (`truncateOutput` line and byte token guards).
5. **Aşama 5: MutationLine Ordering** (`mutationLine.enqueue` race condition prevention).
6. **Aşama 6: Time-Travel Undo/Redo** (`sessionManager.checkpoint`, `undo`, `redo`).
7. **Aşama 7: Pi 10-Scenario E2E Eval Benchmark** (`evalRunner.runSuite(defaultUiAgentEvalSuite)`).
8. **Aşama 8: Telemetry & Token Costing** (`telemetryTracker.setModelPricing` & `endTurn`).
9. **Aşama 9: Memory CRUD** (`agentMemory.remember`, `recall`, `forget`).
10. **Aşama 10: Modular Skills** (`skillsManager.getActiveSkills`, `formatSkillsPrompt`).
11. **Aşama 11: Multi-Lane Scheduler** (`multiLaneScheduler.enqueue('interactive' | 'background')`).
12. **Aşama 12: Tool Progress Streaming** (`progressManager.createReporter`, `report`, `done`).
13. **Aşama 13: State Reconciliation** (`reconciliationEngine.reconcile` recovery of orphan tasks).
14. **Aşama 14: CBOR Binary Compression** (`cborCodec.encode`, `decode`, `comparePayloadSizes`).
15. **Aşama 15: OAuth PKCE & Expiry Detection** (`generatePKCE`, `oauthManager.isExpiringSoon`).
16. **Aşama 16: Exponential Backoff Retry** (`retryWithBackoff` transient glitch recovery).

### 3. Running the Simulation
Run the command directly using the project workspace:
```bash
pnpm simulate
```
Expected output: 16 passed (16 tests) in < 600ms.

---

## Workflow 3: Router & Multi-Screen State Bridging

For multi-page flows (e.g. `/reports` $\leftrightarrow$ `/dashboard`):
1. **Do not create custom navigation tools.**
2. Use `useAgentRouter`:
```tsx
import { useAgentRouter } from '@my-agent/react';
import { useNavigate, useLocation } from 'react-router-dom';

export function NavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useAgentRouter({
    currentRoute: location.pathname,
    onNavigate: (path) => navigate(path),
    onBack: () => navigate(-1),
  });

  return null;
}
```
This automatically registers the `app_router` component with `NAVIGATE` and `BACK` capabilities, generating `ROUTE_CHANGED` telemetries.

---

## Workflow 4: Verification & Clean Architecture Guardrails

Before finishing any task, the agent MUST run:

1. **Strict File Length Guardrail:**
   Every single file MUST be under 500 lines of code. If a file approaches 450 lines, slice it into sub-components or utility modules.
   ```bash
   wc -l <changed_files>
   ```

2. **Zero TypeScript Errors:**
   ```bash
   pnpm -r typecheck
   ```

3. **100% Passing Tests & Simulation:**
   ```bash
   pnpm simulate
   pnpm -r test
   ```

4. **Runtime Boundary Enforcement:**
   - Client bundle (`packages/agent-react` or browser code): NEVER import `node:fs`, `node:path`, `node:os`.
   - Server code (API handlers): Use `createAgentToolsForServer(ui_context)` for DRY schema validation.
