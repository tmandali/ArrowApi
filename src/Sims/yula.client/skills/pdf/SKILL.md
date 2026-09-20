---
name: pdf
slash: pdf
label: PDF ve Fatura Ayrıştırma
description: PDF dosyalarından tablo ve metin ayıklar, form doldurur, fatura ve ekstreleri çözümler
scope: global
---

# PDF Processing & Extraction Guide

Use this skill whenever processing, reading, or extracting structured tables from PDF files (such as e-invoices, bank statements, or receipts).

## Quick Start

```python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract raw text
text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Extraction Approaches

| Task | Library | Approach |
|---|---|---|
| **Fast text & page operations** | `pypdf` | Read metadata, split/merge pages, rotate |
| **Table & tabular data extraction** | `pdfplumber` | Extract tables, convert to pandas DataFrame |
| **Invoice / form field inspection** | `pdfplumber` / `pypdf` | Inspect form fields, extract key-value pairs |

## Table Extraction to Pandas

```python
import pdfplumber
import pandas as pd

def extract_tables_from_pdf(pdf_path):
    all_tables = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            for table in tables:
                if table and len(table) > 1:
                    headers = [str(c).strip() if c is not None else f"col_{i}" for i, c in enumerate(table[0])]
                    df = pd.DataFrame(table[1:], columns=headers)
                    df['page'] = page_idx + 1
                    all_tables.append(df)
    
    if all_tables:
        return pd.concat(all_tables, ignore_index=True)
    return pd.DataFrame()
```

## Basic PDF Operations (pypdf)

### Merge PDFs
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

### Split PDF
```python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

### Extract Metadata
```python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}, Author: {meta.author}")
```

## Invariant Guidelines
- Always verify column headers when parsing financial statements or invoices.
- Clean numeric columns: remove currency symbols (`₺`, `$`, `€`) and thousand separators before computing sums.
- Handle multi-page tables where headers only appear on the first page.
