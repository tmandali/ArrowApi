<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Yula Client Architect & Report Checklist

## 🤖 Declarative YAML Agent Manifest Standards
- Kod içerisinde komut veya prompt metni hardcode olarak yazılmaz.
- Tüm sistem, grid ve workspace ajan yetenekleri `src/features/<workspace>/agents/*.agent.yaml` manifest dosyalarında saklanır.
- Manifest yüklemeleri Webpack/Turbopack `raw-loader` altyapısı ve `js-yaml` ile `yula-commands.ts` üzerinden dinamik olarak yürütülür.

## 📋 Yeni Bir Rapor / Ajan Eklenirken Yapılması Gerekenler (Adım Adım Checklist)

Projeye yeni bir rapor veya ajan yeteneği eklendiğinde aşağıdaki adımlar eksiksiz uygulanmalıdır:

1. **JSON Schema Tanımı (`schemas/<report>-criteria.schema.json`):**
   - `x-scope`, `x-page-path`, `x-job-endpoint` ve `x-ai` (`aliases`, `quickPrompts`, `resultsPrompts`, `columnHints`) alanları içeren kriter şemasını tanımla.
2. **YAML Agent Manifest Tanımı (`src/features/<workspace>/agents/<name>.agent.yaml`):**
   - Yeni workspace veya feature için komut/ajan yeteneği gerektiğinde `src/features/<workspace>/agents/<name>.agent.yaml` manifest dosyasını tanımla.
3. **Rapor Kaydı (`src/features/reports/report-registry.ts`):**
   - Oluşturulan JSON şemasını `REGISTERED_REPORTS` dizisine `scope`, `workspace`, `title`, `pagePath`, `aliases` ve `fullSchema` ile ekle.
4. **Next.js Rota Sayfaları (`src/app/`):**
   - Kriter / Karşılama Sayfası: `src/app/<workspace>/<report>/page.tsx`
   - GUID Sonuç Ekranı: `src/app/<workspace>/<report>/[jobId]/page.tsx`
5. **Sonuç Ekranı Bileşeni (`<Report>JobView.tsx`):**
   - Rapor sonuç bileşenini standart OPFS + DuckDB WASM destekli `<ArrowReportGrid jobId={jobId} jobUrl={reportUrl} reportScope="<scope>" ... />` ile oluştur.
6. **Yol & Başlık Biçimlendirme (`src/lib/workspace-paths.ts`):**
   - `formatPathnameLabel(pathname)` fonksiyonuna raporun Türkçe etiketini ekle (`if (pathname.includes("/<workspace>/<report>")) return "<Rapor Adı>"`).

## Yula AI (sohbet SDK & sağlayıcı)

- **Sohbet yolu sağlayıcı-agnostiktir.** `/api/agent/chat` yalnız `getYulaLanguageModel(...)` + `streamText({ model, tools })` kullanır. Araç çağrısı prompt metnine yazılmaz; `streamText({ tools })` + `extractReasoningMiddleware({ tagName: "think" })`.
- **Sağlayıcı SDK’sı yalnızca adaptörde:** `src/lib/yula-provider.ts`. Chat/UI koduna `createOllama` / `createAzure` / `createOpenAI` veya `ollama:` `providerOptions` gömülmez.
  - Microsoft Foundry → `@ai-sdk/azure` `createAzure({ baseURL, apiKey })` (Foundry `/openai/v1` ucu). Foundry için `createOpenAI` kullanılmaz.
  - OpenAI → `@ai-sdk/openai` `createOpenAI`.
  - Yerel → `ollama-ai-provider-v2` `createOllama` (keep_alive / num_ctx bu katmanın `fetch` sarmalayıcısında).
- **Aktif sağlayıcı:** `AI_PROVIDER` / `NEXT_PUBLIC_AI_PROVIDER` (`foundry` ≡ `azure`). Env’de Azure kimliği varsa varsayılan Microsoft Foundry’dir. Kullanıcı seçimi `yula_ai_config` (localStorage) + model popover’daki sağlayıcı listesi (`listConfiguredProviders`). Kayıt yoksa istek gövdesine `provider` yazılmaz; sunucu env’e güvenir.
- **Asistan metni:** `sanitize-assistant-text` sızıntı/yazı sistemi çöpünü temizler; akışta kelime yutmamak için metni `trim` etmez.
- **Öneri / bulgu maddeleri:** `Başlık: kısa açıklama`. Başlık tıklanınca sohbete **yalnızca başlık** gider (`findingItemPrompt`) — uzun açıklama kullanıcı balonuna yazılmaz. Model yanıtları dar dock’ta kısa tutulur (1–3 cümle + en fazla 4 madde). Kolon adı geçti diye otomatik filtre komutuna sapılmaz. Bilinen rapor adları (`KNOWN_SYSTEM_ACTIONS`) ayrı yoldur.
