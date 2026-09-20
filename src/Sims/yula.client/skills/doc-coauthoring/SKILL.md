---
name: doc-coauthoring
slash: doc-coauthoring
label: Doküman Birlikte Yazımı
description: Teknik şartname, PRD, mimari karar ve kılavuzları 3 aşamalı işbirliğiyle hazırlar
scope: global
---

# Collaborative Document Co-Authoring

This skill provides a structured workflow for guiding users through collaborative document creation (PRDs, architecture ADRs, specifications, and business proposals).

## 3-Stage Workflow

1. **Stage 1: Context Gathering**: User provides background while agent asks targeted clarifying questions.
2. **Stage 2: Refinement & Structure**: Iteratively build each section through brainstorming, curation, and precision edits.
3. **Stage 3: Reader Testing**: Review the document from an external perspective to catch ambiguities and missing context.

---

## Stage 1: Context Gathering

**Goal:** Close the gap between what the author knows and what the agent needs to know.

### 1. Initial Clarification
Ask the author for meta-context:
- **Type of document:** (e.g. Technical Spec, Architecture Decision Record / ADR, Product PRD, Business Proposal)
- **Primary audience:** (Engineers, management, operations, finance)
- **Desired impact:** What action or decision should this document drive?
- **Format or template constraints:** (e.g., ArrowApi ADR standard, markdown structure)

### 2. Context Ingestion
Encourage the user to dump raw thoughts, bullet points, constraints, and non-goals without worrying about polished formatting:
- Technical dependencies and existing architecture
- Why alternative approaches were rejected
- Key risks, trade-offs, and timeline constraints

---

## Stage 2: Refinement & Section Drafting

**Goal:** Build the document section by section.

For each section:
1. Identify key decisions, assumptions, and trade-offs.
2. Draft the section using concise, imperative language.
3. Highlight open questions or items requiring user confirmation.
4. Iterate until the author approves the section before moving to the next.

**Ordering:**
Start with the section with the most unknowns (core proposal / architecture), then follow with dependencies and operational details.

---

## Stage 3: Reader Testing & Final Review

Before finalizing:
1. Verify clarity: Does each section stand on its own without requiring tribal knowledge?
2. Check consistency: Do terminology and naming conventions match throughout?
3. Invariant check: In ArrowApi projects, ensure documentation strictly follows English-only and Graph-Native standards where applicable.
