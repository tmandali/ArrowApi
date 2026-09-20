---
name: frontend-design
slash: frontend-design
label: Frontend ve Arayüz Tasarımı
description: Özgün arayüz, tipografi, renk hiyerarşisi ve kaliteli UI tasarım rehberi
scope: global
---

# Frontend Design & UI Excellence

Guidance for distinctive, intentional visual design when building new UI components or reshaping existing screens.

## Core Design Principles

### 1. Ground Designs in Subject Matter
- Avoid generic "AI-generated" templates (e.g., identical cards with soft grey shadows, gratuitous purple/blue gradient buttons, unnecessary ALL-CAPS eyebrows).
- In an ERP/Sims context, design for high information density, rapid scanning, clean tabular alignments, and unambiguous interactive states.

### 2. Typography & Hierarchy
- Use one or at most two typefaces with clear distinction.
- Set intentional weights, widths, and spacing following a consistent type scale.
- Default to line lengths under 80 characters for body copy.
- Avoid common generated tells:
  - Accenting a single word in a headline with italic/bold.
  - Adding redundant category labels above content.

### 3. Visual Structure is Information
- Structural devices (borders, dividers, tabs) should encode relationships, not serve as pure decoration.
- Use motion sparingly and purposefully: transitions should indicate an expanded/collapsed state or confirmed action, never arbitrary entrance fades on every card.

### 4. Copywriting in UI
- Words in an interface exist to make it easier to understand and use.
- Use active, specific labels for buttons: "Değişiklikleri Kaydet" instead of "Gönder", "Raporu Çalıştır" instead of "Tamam".
- Error states and empty states must provide clear direction: explain what happened and what the next action is.

## Invariant Design Constraints
- Respect **Shadcn UI Immutability**: Never modify `components/ui/*` directly.
- Use Tailwind CSS classes with semantic design tokens (`bg-card`, `text-muted-foreground`, `border-border`).
- Ensure contrast accessibility and dark/light theme consistency.
