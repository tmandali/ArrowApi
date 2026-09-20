---
name: xlsx
slash: xlsx
label: Excel ve Tablo Analizi
description: Excel (.xlsx) dosyalarını açar, formülleri denetler, openpyxl ve pandas ile veri modelleri üretir
scope: global
---

# XLSX creation, editing, and analysis

| Task | Approach |
|---|---|
| **Create** or **edit** with formulas/formatting | `openpyxl` — see gotchas below |
| **Bulk data** in or out | `pandas` (`read_excel`, `to_excel`) |
| **Quick look** at a sheet | `markitdown file.xlsx` — `## SheetName` per sheet; reads `.xlsm` too |
| **Read** a model (formulas *and* values) | two `load_workbook` passes — see gotchas |

> `openpyxl` and `pandas` are preinstalled in our Pyodide Web Worker runtime.

## Requirements for every output

- **Professional font** (Arial, Segoe UI) throughout, unless the user specifies otherwise.
- **Zero formula errors.** Never deliver spreadsheets with `#REF!`, `#VALUE!`, or `#NAME?`. If you suspect an error predates your edit, load the original with `data_only=True` to verify.
- **Use formulas, never hardcoded totals.** Write `sheet['B10'] = '=SUM(B2:B9)'`, not the Python-computed total. The sheet must recalculate when inputs change.
- **Follow the user's spec literally.** Exact tab names, exact column headers, and specified formulas.
- **Document every assumption and hardcoded number** where the reader will see it — a cell comment, or an adjacent note cell at a table's end.
- **A workbook created for someone to fill in** needs a short legend naming which cells to edit, and one example row of realistic values showing the expected format.
- **Editing an existing file: match its conventions exactly.** Find its designated input cells first — a distinct font color, fill, or shading marks them — write only there, and leave existing formulas untouched.

## Choosing formulas that survive verification

- **Prefer standard functions** — `SUMIFS`, `INDEX`, `MATCH`, `IFERROR`, `SUMPRODUCT` — which need no prefix.
- **Post-2007 functions work with an `_xlfn.` prefix**, because openpyxl writes your formula into the XML verbatim: `_xlfn.TEXTJOIN`, `_xlfn.CONCAT`, `_xlfn.IFS`, `_xlfn.SWITCH`, `_xlfn.MAXIFS`, `_xlfn.MINIFS`.
- Use `INDEX`/`MATCH` for lookups, and sort, filter, and de-duplicate in Python/pandas before writing the cells.

## openpyxl gotchas

- **Reading a model takes two loads.** `data_only=True` yields cached values with formulas gone; the default yields formula strings with no values.
- **`data_only=True` is destructive if you save.** That workbook has no formulas left, so saving replaces every formula with a literal value permanently.
- **Merged cells: write the top-left anchor only.** Every other cell in the range is a `MergedCell` whose `.value` is read-only.
- **`.xlsm` loses its macros unless you pass `keep_vba=True`** to `load_workbook`.
- **A sheet name containing a space must be quoted** in a cross-sheet reference: `='Assumptions Inputs'!$B$5`.

## Financial models

- **Color:** blue text (`0,0,255`) for hardcoded inputs and scenario levers · black for formulas · green (`0,128,0`) for links to another sheet · yellow fill (`255,255,0`) for key assumptions and cells the user should fill in.
- **Numbers:** currency `$#,##0`, unit named in the header (`Revenue ($mm)`) · zeros render as `-` · negatives in parentheses `(1,000)` · percentages `0.0%`, stored as fractions (`0.15` renders `15.0%`).
- **Structure:** every assumption in its own labeled cell, referenced by the formulas that use it (`=B5*(1+$B$6)`, never `=B5*1.05`).
