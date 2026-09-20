# Inline Human-in-the-Loop (HITL) Standards

This document establishes the interaction rules for user confirmations, multi-choice decision cards, and the strict ban on modal dialogs in Yula AI.

---

## 1. Strict Modal Dialog Ban

> [!WARNING]
> **Modal Dialogs Are Strictly Forbidden:**
> Never render intrusive popup modals, blocking dialogs, or lightbox overlays during Yula AI interactions.

### Rationale
- **Preserving Context:** Screen-blocking modals break the user's focus on the underlying report and active criteria.
- **Audit Trail Integrity:** User approvals and tool recommendations must remain chronologically logged directly within the conversation stream.

---

## 2. Inline Interactive Choice Cards (`YulaChoiceCard`)

When the model requires user confirmation or presents multiple alternatives, it triggers `@my-agent/react`'s `ask_user_choice` tool:

- The UI renders a clean, inline `YulaChoiceCard` inside the conversation thread.
- The card displays a title, description, and action buttons (chips).
- Clicking an option enqueues the selection into the action stream, allowing the agent to resume its ReAct loop.

```tsx
// Typical ask_user_choice payload
{
  title: "Run Stock Variance Report?",
  description: "Warehouse: Central (01), Period: Current Month-End",
  options: [
    { id: "confirm", label: "Yes, Run Report", variant: "default" },
    { id: "modify", label: "Edit Criteria", variant: "outline" },
    { id: "cancel", label: "Cancel", variant: "ghost" }
  ]
}
```

---

## 3. Plan-First vs. Direct ReAct Approval Rules

- **Global Scope (`/`, `/dashboard`):** Unconfirmed `SUBMIT` actions are forbidden. The agent MUST generate a structured plan and present an `ask_user_choice` card before executing changes.
- **Screen Scope (`/stock/stock-balance`):** If the user is already on the target screen and criteria are validated, execution proceeds via Direct ReAct (`SET_FIELDS` $\rightarrow$ `SUBMIT`).
