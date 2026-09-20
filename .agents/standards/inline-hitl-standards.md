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
- **Rich Choice Contract (`UserChoiceOption`):**
  - `label`: Button and option title.
  - `value`: Machine-readable action code or parameter.
  - `description`: Detailed explanation of what action will be taken.
  - `rationale`: Business rationale or justification explaining why the option is proposed and its operational impact.
  - `badge`: Optional visual indicator (e.g. `Önerilen` / `Recommended`).
- **Dual Presentation Modes:**
  - **Detailed Decision Cards (`hasDetailedChoices`):** When options include `description` or `rationale`, options render as an informative vertical card list where users can compare trade-offs, descriptions, and rationales before clicking.
  - **Compact Action Bar:** When options are brief and lack descriptions (e.g. binary "Yes / No"), options render as a compact horizontal chip bar.
- Clicking an option enqueues the selection into the action stream, allowing the agent to resume its ReAct loop.

```json
{
  "question": "Planı nasıl başlatmak istersiniz?",
  "options": [
    {
      "label": "Kriterleri Belirle",
      "value": "set_criteria",
      "description": "Hedef mağaza ve tarih aralığı filtrelerini form alanlarına uygular.",
      "rationale": "Sorguyu çalıştırmadan önce odaklanılacak veri kümesini daraltır ve performansı artırır.",
      "badge": "Önerilen"
    },
    {
      "label": "Doğrudan Raporu Çalıştır",
      "value": "run_directly",
      "description": "Mevcut varsayılan kriterlerle işi başlatır.",
      "rationale": "Zaman kazandırır ancak geniş veri kümesi getirebilir."
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
