# Frontend Coding and Quality Standards

This document establishes mandatory rules and coding standards for developing the Yula Client (`src/Sims/yula.client/`).

---

## 1. 500-Line File Limit Rule

> [!IMPORTANT]
> **500-Line Limit:**
> No source code, test, or markdown file may exceed 500 lines (`wc -l`).

### Refactoring Strategies
- **Components:** Split large JSX hierarchies into focused sub-components (`<ReportHeader />`, `<ReportFilterSection />`, `<ReportSummaryCards />`).
- **Logic:** Extract state machines and business logic into custom hooks (`useReportLogic.ts`, `useGridActions.ts`).
- **Utilities:** Move formatting, calculations, and pure helper functions into `lib/` or `utils/`.

---

## 2. Fast Refresh & Hook/Provider Separation

To prevent Next.js and React Fast Refresh from breaking:
- Custom hooks (`use*.ts`) and Context Providers (`*Provider.tsx`) **MUST ALWAYS reside in separate files**.
- Never export an inline hook (`export const useMyContext = ...`) from within the same file that defines the Provider component.

---

## 3. Shadcn UI Immutability

Files under `src/components/ui/*` belong to shadcn/ui.
- Modifying, styling, or adding manual logic inside these files is **strictly forbidden**.
- This directory is protected by `.oxlintrc.json` rules.
- To customize appearance or behavior, build a custom wrapper component outside `components/ui/`.

---

## 4. Internationalization & Localization (`next-intl`)

- User-facing text must NEVER be hardcoded as static strings in JSX.
- All labels and messages must be resolved from `src/messages/*.json` using `next-intl` (`useTranslations`).

```tsx
// WRONG
<button>Apply Filters</button>

// CORRECT
const t = useTranslations("reportCriteria");
<button>{t("applyFilters")}</button>
```

---

## 5. Domain-Agnostic & Language-Agnostic UI Primitives

Platform UI controls (`YulaChoiceCard`, `YulaQuestionnaireCard`, `ArrowReportGrid`, `ArrowJobExecutionsPanel`, etc.):
- Must NEVER contain hardcoded domain terminology (retail, manufacturing, accounting) or language-specific text.
- Must render purely from contract inputs.
- Static UI chrome labels must resolve parametrically from internationalization dictionaries.

---

## 6. Yula AI Side Dock Standard

The Yula AI interface must always retain its **side dock/drawer** form factor regardless of viewport resolution; it must never switch to a disruptive fullscreen overlay modal.

---

## 7. English-Only Documentation & Evolutive Wiki Protocol

- All architecture guides, guidelines, checklists, and `.agents/**/*.md` documents must be authored and maintained strictly in English.
- Whenever coding agents receive a new architectural directive or rule correction from the user, they must record it in the corresponding `.agents/*.md` document in English and append a dated entry to `.agents/log.md`.

