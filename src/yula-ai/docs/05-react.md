# 05 — React Integration & UI Bindings

Source Directory: `packages/agent-react/src/`

---

## 1. Provider Context (`agent-provider.tsx`)

- **Component:** `AgentProvider({ apiEndpoint, systemName, children })`
- **Context Hook:** `useAgentContext()` exposes `systemName`, `apiEndpoint`, and connection state across the component tree.

---

## 2. Chat Streaming Hook (`use-agent-chat.ts`)

- **Hook:** `useAgentChat(route)`
- **Vercel AI SDK Integration:** Wraps `useChat` to automatically construct and append the dynamic `uiContext` payload to every outgoing user turn:
  ```typescript
  body: {
    uiContext: {
      route,
      active_components: uiRegistry.getActiveComponents(),
      recent_events: uiEventBus.getRecentEvents(),
    }
  }
  ```
- **Real-time Synchronization:** Ensures the LLM receives immediate, fresh knowledge of mounted buttons, inputs, and recent telemetries.
- **Client-Side Tool Dispatching (SSE Streams):**
  Automatically monitors the streaming chunks from the AI backend:
  - Intercepts both modern protocol events (`tool-input-available`, `tool-call`) and legacy markers (`9:`, `b:`).
  - Automatically executes client-side tools (`dispatch_component_action`, `inspect_ui_state`, `remember_fact`, etc.) via `executeToolCall(toolCall)`.
  - Seamlessly updates message parts to `'output-available'` with the action result, ensuring immediate UI responsiveness without dropping tool invocations.

---

## 3. Event-Driven Router Hook (`use-agent-router.ts`)

- **Hook:** `useAgentRouter({ currentRoute, onNavigate })`
- **Component Identity:** Mounts as `app_router` in `uiRegistry`.
- **Supported Actions & Contracts:**
  - `NAVIGATE`: Switches page views (e.g. `/reports` ↔ `/dashboard`). Guarded by `whenToCall` (only on explicit navigation requests) and `whenNotToCall` (never during form filling or simple queries).
  - `BACK`: Steps back to previous views.
- **Telemetry:** Automatically dispatches `ROUTE_CHANGED` events to `uiEventBus`.

---

## 4. Headless UI Architecture & Custom Styling

`@my-agent/react` is **100% Headless (UI-Agnostic)**. It ships zero CSS, zero hardcoded styles, and zero fixed themes, giving consuming applications total freedom over styling (Tailwind CSS, Shadcn/UI, CSS Modules, MUI, Ant Design, styled-components, etc.).

### Building Custom UI with Headless Hooks
```tsx
import { useAgentChat } from '@my-agent/react';

export function CustomChat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useAgentChat();
  return (
    <div className="flex flex-col h-full bg-slate-900 text-white rounded-lg p-4">
      <div className="flex-1 overflow-y-auto space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span className="inline-block p-2 rounded bg-slate-800">{m.content}</span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
        <input value={input} onChange={handleInputChange} className="flex-1 bg-slate-800 rounded px-3" />
        <button type="submit" disabled={isLoading} className="bg-blue-600 px-4 py-2 rounded">
          Gönder
        </button>
      </form>
    </div>
  );
}
```

### Reference Implementation: `AgentWidget` (`apps/demo-app/src/components/agent-widget/`)
For inspiration, `apps/demo-app` provides a fully functional floating widget reference implementation:
- **`AgentWidget.tsx`:** Floating drawer panel consuming `useAgentChat`, `useAgentProgress`, and telemetry.
- **`WidgetHeader.tsx`:** Displays status, context gauge, model switcher, and tab navigation.
- **7 Diagnostic Tabs:** `ChatTab.tsx`, `PiEventsTab.tsx`, `SkillsTab.tsx`, `MemoryTab.tsx`, `SteeringTab.tsx`, `SessionsTab.tsx`, `MetricsTab.tsx`.

---

## 5. Domain-Specific Auxiliary Hooks

| Hook | File | Responsibility |
| :--- | :--- | :--- |
| `useAgentSkill` | `use-agent-skill.ts` | Registers route-scoped skills and slash commands. |
| `useAgentPlugin` | `use-agent-plugin.ts` | Attaches third-party plugins to the agent runtime. |
| `useAgentProgress` | `use-agent-progress.ts` | Listens to multi-step task progress events. |
| `useAgentReplay` | `use-agent-replay.ts` | Steps forward and backward through recorded sessions. |
| `useAgentLanes` | `use-agent-lanes.ts` | Manages concurrent, prioritized execution lanes. |
| `useAgentVision` | `use-agent-vision.ts` | Captures and transmits canvas screenshots. |
| `useAgentIndexedDb` | `use-agent-indexeddb.ts` | Bridges session state to local browser IndexedDB storage. |
