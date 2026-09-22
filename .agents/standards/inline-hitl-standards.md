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

---

## 5. Active Suspension & Interruption Lifecycle (Steering & `respondToChoice`)

- **Suspended Execution State:** When `ask_user_choice` is triggered, the interaction does NOT finish into an idle "done" state. Instead, the turn transitions into `isSuspended: true` with a `pendingChoice` object.
- **Pulsing Status Indicator:** The uncompleted choice card displays an active pulsing badge (`⏸️ Onay Bekleniyor` / `Waiting for Approval`), making it immediately obvious that the agent has paused its multi-step execution to await user confirmation.
- **Composer & Textarea Synchronization:**
  - **Running & Typing (`isLoading`):** While the agent is actively executing, typing in the textarea switches the primary action button to `⚡ Araya Gir (Steer)` (with Enter invoking `agent.steer()`). The user can interrupt and redirect ongoing execution mid-flight.
- **Seamless Resumption via Steering (No Redundant LLM Runs):** Clicking a choice button, suggestion chip, or submitting custom text invokes `respondToChoice(value)` or `steer(value)`.
  - **No New LLM Run:** The action does NOT invoke `sendMessageText` or start a new independent LLM conversation run (`POST /api/agent/chat`).
  - **Ongoing ReAct Continuity:** The user's input is delivered directly into the active agent loop's steering queue (`chat.steer(value)`). The suspended loop wakes up, ingests the steering input into its context, and immediately executes the subsequent ReAct steps in the exact same turn/accordion.

---

## 6. Run & Turn Status Indicator Standard

The top-level run execution header (`{timeLabel} saniye çalıştı` / `Worked for {timeLabel}s`) in [`YulaWorkedAccordion`](file:///c:/Users/TIMUR.MANDALI/source/git.tmandali/ArrowApi/src/Sims/yula.client/src/components/layout/yula-worked-accordion.tsx) visually reflects the macro Run State on its immediate left:

| Run State | Visual Indicator | Status Meaning |
| :--- | :--- | :--- |
| **Running** | `<Loader2 className="animate-spin text-primary" />` | LLM generation, thinking, or tool execution actively in progress. |
| **Suspended (HITL)** | `<PauseCircle className="text-amber-500 animate-pulse" />` + Badge | Execution paused awaiting human confirmation or choice (`isSuspended`). |
| **Completed** | `<CheckCircle2 className="text-emerald-500" />` | All ReAct steps and response generation finished cleanly without warnings or errors. |
| **Warning (Step)** | `<TriangleAlert className="text-amber-500" />` | A tool step failed or triggered self-correction, but the overall run completed and produced text. Accordion auto-collapses normally. |
| **Error (Run)** | `<AlertCircle className="text-rose-500" />` | Fatal run failure (network/stream error, provider 401/quota, or crash without text). Accordion stays open for inspection. |
| **Stopped** | `<CircleSlash className="text-amber-500" />` | User explicitly aborted or stopped the turn mid-execution. |



