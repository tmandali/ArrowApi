---
name: docx
slash: docx
label: Word Dokümanı Üretimi
description: Microsoft Word (.docx) belgelerini docx-js ile oluşturur, tabloları ve antetleri biçimlendirir
scope: global
---

# DOCX Creation and Formatting Guide

Use this skill whenever creating or formatting Microsoft Word documents (`.docx`), official letters, contracts, or executive summaries.

## Core Approach (TypeScript / docx-js)

In Node.js / TypeScript environments, use the `docx` npm library to construct documents programmatically.

```typescript
import { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from "docx";

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4 dimensions in DXA
        },
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "Şirket İçi Yönetim Özeti",
              bold: true,
              size: 32, // 16pt
            }),
          ],
        }),
      ],
    },
  ],
});
```

## Essential Rules & Gotchas for `docx`

1. **Page Size Defaults**:
   - Default is Letter if omitted. For European/Turkish A4, set `width: 11906, height: 16838` (in DXA; 1440 DXA = 1 inch).
2. **Table Widths**:
   - Set both `columnWidths` on the `Table` AND `width` on every `TableCell`, both in `WidthType.DXA`.
   - The sum of cell widths must exactly equal the table's total width.
3. **Paragraphs and Line Breaks**:
   - Never use raw `\n` inside a `TextRun`. Always create separate `Paragraph` elements or use `new TextRun({ break: 1 })`.
4. **Bullet & Numbered Lists**:
   - Do not insert raw bullet characters (`•`). Use `numbering` configuration with `LevelFormat.BULLET`.
5. **Table of Contents (TOC)**:
   - Headings must use built-in `HeadingLevel.HEADING_1`, `HeadingLevel.HEADING_2` to be automatically picked up by TOC.
6. **Images**:
   - Wrap images inside an `ImageRun` specifying dimensions (`transformation: { width: 300, height: 200 }`).
