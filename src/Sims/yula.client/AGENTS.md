<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Yula Client Architect & Report Checklist

## 📋 Yeni Bir Rapor Eklenirken Yapılması Gerekenler (Adım Adım Checklist)

Projeye yeni bir rapor eklendiğinde (örn. `StockLedger`, `SalesInvoice` vb.) aşağıdaki 5 adım eksiksiz uygulanmalıdır:

1. **JSON Schema Tanımı (`schemas/<report>-criteria.schema.json`):**
   - `x-scope`, `x-page-path`, `x-job-endpoint` ve `x-ai` (`aliases`, `quickPrompts`, `resultsPrompts`, `columnHints`) alanları içeren kriter şemasını tanımla.
2. **Rapor Kaydı (`src/features/reports/report-registry.ts`):**
   - Oluşturulan JSON şemasını `REGISTERED_REPORTS` dizisine `scope`, `workspace`, `title`, `pagePath`, `aliases` ve `fullSchema` ile ekle.
3. **Next.js Rota Sayfaları (`src/app/`):**
   - Kriter / Karşılama Sayfası: `src/app/<workspace>/<report>/page.tsx`
   - GUID Sonuç Ekranı: `src/app/<workspace>/<report>/[jobId]/page.tsx`
4. **Sonuç Ekranı Bileşeni (`<Report>JobView.tsx`):**
   - Rapor sonuç bileşenini standart OPFS + DuckDB WASM destekli `<ArrowReportGrid jobId={jobId} jobUrl={reportUrl} reportScope="<scope>" ... />` ile oluştur.
5. **Yol & Başlık Biçimlendirme (`src/lib/workspace-paths.ts`):**
   - `formatPathnameLabel(pathname)` fonksiyonuna raporun Türkçe etiketini ekle (`if (pathname.includes("/<workspace>/<report>")) return "<Rapor Adı>"`).
