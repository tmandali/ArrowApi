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

When the model requires user confirmation, clarification, or presents multiple workflow alternatives, it triggers `@my-agent/core`'s `ask_user_choice` tool:

- The UI renders a clean, inline `YulaChoiceCard` inside the conversation thread immediately below the assistant's turn text or plan.
- **Choice Contract (`UserChoiceOption`):**
  - `label`: Concise button and option title (mandatory).
  - `value`: Optional machine-readable action code or parameter.
  - `description`: Optional brief inline phrase explaining what action will be taken.
  - `badge`: Optional visual indicator (e.g. `Önerilen` / `Recommended`).
- **Sleek Single-Line Shadcn Presentation:**
  - **Single-Line Action Rows (`hasDescriptions`):** When options include brief `description` texts, each option renders as a sleek, single-line shadcn button item (`h-8 w-full justify-between`) displaying the label, inline description (`— description`), and badge. No bulky multi-level cards or separate "Gerekçe / Etki" boxes are displayed.
  - **Compact Action Bar:** When options are brief labels without descriptions (e.g. "Evet / Hayır", company codes, or quick presets), options render as a compact horizontal chip bar of shadcn buttons.
- Clicking an option enqueues the selection into the action stream, allowing the agent to resume its ReAct loop.

```json
{
  "question": "Planı nasıl başlatmak istersiniz?",
  "options": [
    {
      "label": "Kriterleri Belirle",
      "value": "set_criteria",
      "description": "Hedef mağaza ve tarih aralığı filtrelerini ayarlar",
      "badge": "Önerilen"
    },
    {
      "label": "Doğrudan Raporu Çalıştır",
      "value": "run_directly",
      "description": "Mevcut kriterlerle işi başlatır"
    }
  ],
  "allow_custom": true,
  "custom_placeholder": "Farklı bir mağaza veya kriter belirtin…"
}
```

---

## 3. Plan-First vs. Direct ReAct Approval Rules

- **Global Scope (`/`, `/dashboard`):** Unconfirmed `SUBMIT` actions are forbidden. The agent MUST generate a structured plan and present an `ask_user_choice` card before executing changes.
- **Screen Scope (`/stock/stock-balance`):** If the user is already on the target screen and criteria are validated, execution proceeds via Direct ReAct (`SET_FIELDS` $\rightarrow$ `SUBMIT`).

---

## 4. Strict Ban on Regex Text-to-Button Heuristics

> [!IMPORTANT]
> **No Fake Buttons from Assistant Prose:**
> Assistant markdown text is strictly a read-only presentation medium. The frontend MUST NEVER parse assistant text or bullet points looking for action verbs (`"sorgula"`, `"filtrele"`, `"aç"`, `"çalıştır"`, quotes, etc.) to fabricate clickable prompt buttons.
> All interactive decisions and user choices MUST be emitted natively by the LLM as structured `ask_user_choice` tool calls.
