---
name: pptx
slash: pptx
label: PowerPoint Sunum Üretimi
description: PowerPoint (.pptx) sunumlarını tasarlar, yönetim özetlerini ve görsel slaytları oluşturur
scope: global
---

# PowerPoint Presentation & Slide Design Guide

Use this skill whenever creating or editing PowerPoint presentation slide decks (`.pptx`), executive closing summaries, or performance reports.

## Core Design Principles

### 1. Structure & Narrative
- **Sandwich Structure**: Dark background for title and conclusion slides, crisp light backgrounds for content slides.
- **Rule of Visual Balance**: Every slide must have a clear visual anchor (a chart, stat callout, icon group, or comparison grid). Avoid text-only bullet walls.
- **One Dominant Message**: Each slide should convey one primary takeaway with a bold headline, supported by 2-3 data points.

### 2. Curated Color Palettes

| Theme | Primary | Secondary | Accent | Use Case |
|---|---|---|---|---|
| **Midnight Executive** | `#1E2761` (Navy) | `#CADCFC` (Ice Blue) | `#FFFFFF` (White) | Corporate, C-Level, Financial Reviews |
| **Charcoal Minimal** | `#36454F` (Charcoal) | `#F2F2F2` (Off-White) | `#00A896` (Mint Accent) | Tech, Product, Modern Reports |
| **Forest & Moss** | `#2C5F2D` (Forest) | `#97BC62` (Moss) | `#F5F5F5` (Cream) | Operations, Inventory, Sustainability |
| **Warm Terracotta** | `#B85042` (Terracotta) | `#E7E8D1` (Sand) | `#2F3C7E` (Navy) | Retail, Customer Experience, Marketing |

### 3. Data & KPI Displays
- **Large Stat Callouts**: Emphasize big numbers (60-72pt bold font) with concise 12pt explanatory labels below (e.g., `+24.5%` with label `Stok Devir Hızı Artışı`).
- **Comparison Grids**: Use 2-column or 3-column side-by-side cards for before/after or target vs. actual metrics.

## Automation Approaches

- **TypeScript / Browser**: Use `pptxgenjs` to generate decks programmatically in client-side environments.
- **Python / Worker**: Use `python-pptx` to build or populate slides with tabular and chart data.

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()
slide_layout = prs.slide_layouts[0] # Title Slide
slide = prs.slides.add_slide(slide_layout)
title = slide.shapes.title
subtitle = slide.placeholders[1]

title.text = "Ay Sonu Kapanış ve Finansal Değerlendirme"
subtitle.text = "Sims ERP Yönetim Raporu"
prs.save("rapor.pptx")
```

## Quality Checklist
- Never use more than 3 font sizes per slide.
- Avoid cluttered tables: highlight top 5 items and summarize the rest.
- Ensure all text labels maintain high contrast against slide background.
