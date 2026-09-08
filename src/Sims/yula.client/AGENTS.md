<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Yula Client Architect & Report Checklist

## 🤖 Declarative YAML Agent Manifest Standards
- Kod içerisinde komut veya prompt metni hardcode olarak yazılmaz.
- Tüm sistem, grid ve workspace ajan yetenekleri `src/workspaces/<workspace>/agents/*.agent.yaml` (veya `src/features/system/agents/`, `src/features/reports/agents/`) manifest dosyalarında saklanır.
- Manifest yüklemeleri Webpack/Turbopack `raw-loader` altyapısı ve `js-yaml` ile `yula-commands.ts` üzerinden dinamik olarak yürütülür.

## 📋 Yeni Bir Rapor / Ajan Eklenirken Yapılması Gerekenler (Adım Adım Checklist)

Projeye yeni bir rapor veya ajan yeteneği eklendiğinde aşağıdaki adımlar eksiksiz uygulanmalıdır:

1. **JSON Schema Tanımı (`schemas/<report>-criteria.schema.json`):**
   - `x-scope`, `x-page-path`, `x-job-endpoint` ve `x-ai` (`aliases`, `quickPrompts`, `resultsPrompts`, `columnHints`) alanları içeren kriter şemasını tanımla.
2. **YAML Agent Manifest Tanımı (`src/workspaces/<workspace>/agents/<name>.agent.yaml`):**
   - Yeni workspace veya feature için komut/ajan yeteneği gerektiğinde `src/workspaces/<workspace>/agents/<name>.agent.yaml` manifest dosyasını tanımla.
3. **Rapor Kaydı (`src/features/reports/report-registry.ts`):**
   - Oluşturulan JSON şemasını ilgili workspace'in `index.ts` kapısından dışa aktar ve `REGISTERED_REPORTS` dizisine `scope`, `workspace`, `title`, `pagePath`, `aliases` ve `fullSchema` ile ekle.
4. **Next.js Rota Sayfası (`src/app/`):**
   - Rapor Ekranı: `src/app/<workspace>/<report>/page.tsx` (Tek sayfa standardı: kriter filtreleri, yürütme geçmişi ve sonuç DuckDB gridi aynı sayfada birleşiktir; doğrudan iş bağlantıları `?jobId=<guid>` parametresi ile açılır).
5. **Sonuç Ekranı Bileşeni (`<Report>ResultGrid.tsx`):**
   - Rapor sonuç bileşenini standart OPFS + DuckDB WASM destekli `<ArrowReportGrid jobId={jobId} jobUrl={reportUrl} reportScope="<scope>" ... />` ile oluştur ve Form içinde `renderResult` prop'una bağla.
6. **Yol & Başlık Biçimlendirme (`src/lib/workspace-paths.ts`):**
   - `formatPathnameLabel(pathname)` fonksiyonuna raporun Türkçe etiketini ekle (`if (pathname.includes("/<workspace>/<report>")) return "<Rapor Adı>"`).

## 📊 Rapor Yaşam Döngüsü, Tek Sayfa Mimarisi ve SSE Akışı

### 1. Tek Sayfa Mimarisi (Single-Page Unified Report Flow)
- Rapor rotası daima `src/app/<workspace>/<report>/page.tsx` altındadır. Eski ayrı `[jobId]` sayfaları yerine `?jobId=<guid>` URL sorgu parametresi kullanılır (`/[jobId]` klasörleri geriye dönük uyumluluk için `redirect` ile `?jobId=` formatına yönlendirir).
- Rapor ekranı 3 temel bloktan oluşur:
  1. **Kriter Filtreleri Formu (`<Report>Form.tsx` & `<Report>Filter.tsx`)**: Kullanıcı kriterlerini girer veya AI üzerinden şema tabanlı doldurur.
  2. **Birleşik Yürütme Paneli (`<ArrowJobExecutionsPanel />`)**:
     - Sol tarafta geçmiş yürütmeler listesi (tarih, süre, satır sayısı, durum ikonu).
     - Sağ tarafta seçili işin kriterleri (JSON veya kriter tablosu) ve canlı ilerleme akışı (`<RunProgressSteps />`).
     - `Completed`, `Failed` ve `Cancelled` işler üzerinde hover yapıldığında silme çöp kutusu görünür.
     - Çalışan işler için iptal etme (`Cancel`), sonlanmış işler için silme (`Delete`) aksiyonları sayfa başlığında ve panelde entegredir.
  3. **Sonuç Grid Paneli (`<ArrowJobResultPanel />` & `<ArrowReportGrid />`)**: DuckDB WASM ve W3C OPFS disk önbelleğiyle büyük veriyi sıfır bellek yüküyle sunar.

### 2. SSE Canlı Olay Akışı (Server-Sent Events)
- **Backend (`src/Arrow.Jobs.AspNetCore/ArrowJobSse.cs`)**:
  - Endpoint: `GET /api/arrow/jobs/{jobId}/events` (`Content-Type: text/event-stream`).
  - **Anti-Buffering Başlıkları**: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Connection: keep-alive`. Proxy/Next.js katmanlarının küçük olayları tutmasını engeller.
  - Her olay yazıldıktan sonra `await response.Body.FlushAsync(cancellationToken)` ile anında istemciye fırlatılır.
  - Desteklenen olaylar: `status`, `info`, `progress`, `completed`, `failed`, `cancelled`.
  - Bağlantı anında geçmiş olaylar (`event-log`) replay edilir; sonrasında canlı akış başlar.
- **İstemci Olay Dağıtıcısı (`src/features/jobs/services/arrow-job-event-hub.ts`)**:
  - `ArrowJobEventHub`: Native `EventTarget` tabanlı, React yaşam döngüsünden bağımsız singleton Pub/Sub servisidir (`arrowJobEventHub`).
  - **Deduplication**: Aynı `jobId` için birden fazla bileşen bağlansa dahi tek bir SSE bağlantısı açılır.
  - **Replay**: `arrowJobEventHub.subscribe(jobId, callback, { replay: true })` ile yeni abone olan bileşenler son snapshot'ı derhal alır.
  - **Anında İlk Adım**: `startStream` tetiklendiğinde (`initialPhase === "running"`), ağ el sıkışması bitmeden önce `Running — status` adımı `0ms` ile snapshot'a işlenerek UI'a derhal yansıtılır.
  - **Mikro-Ritim (`arrow-job-client.ts` -> `readJobSseEvents`)**: Backend'in 2ms içinde peş peşe fırlattığı hazırlık adımları (`status`, `info`) aynı TCP paketinde gelse bile, adımlar arasına ~70ms görsel tempo bırakılarak React'in hepsini tek karede patlatması önlenir.
  - **Progress Hızı**: Yüksek frekanslı `progress` (satır sayısı) adımları hiçbir gecikmeye takılmadan tam hızda akar; UI bildirimleri ~60ms throttle ile akıcı render edilir.
- **İş Durumu Yönetimi (`src/store/slices/active-jobs-store.ts`)**:
  - Zustand tabanlı store aktif işleri (`Queued`, `Running`, `Completed`, `Failed`, `Cancelled`) globalde takip eder.
  - `isTerminalJobStatus(status)`: `Completed`, `Failed`, `Cancelled` durumlarında işin sonlandığını doğrular.

## Yula AI (sohbet SDK & sağlayıcı)

- **Sohbet yolu sağlayıcı-agnostiktir.** `/api/agent/chat` yalnız `getYulaLanguageModel(...)` + `streamText({ model, tools })` kullanır. Araç çağrısı prompt metnine yazılmaz; `streamText({ tools })` + `extractReasoningMiddleware({ tagName: "think" })`.
- **Sağlayıcı SDK’sı yalnızca adaptörde:** `src/lib/yula-provider.ts`. Chat/UI koduna `createOllama` / `createAzure` / `createOpenAI` veya `ollama:` `providerOptions` gömülmez.
  - Microsoft Foundry → `@ai-sdk/azure` `createAzure({ baseURL, apiKey })` (Foundry `/openai/v1` ucu). Foundry için `createOpenAI` kullanılmaz.
  - OpenAI → `@ai-sdk/openai` `createOpenAI`.
  - Yerel → `ollama-ai-provider-v2` `createOllama` (keep_alive / num_ctx bu katmanın `fetch` sarmalayıcısında).
- **Aktif sağlayıcı:** `AI_PROVIDER` / `NEXT_PUBLIC_AI_PROVIDER` (`foundry` ≡ `azure`). Env’de Azure kimliği varsa varsayılan Microsoft Foundry’dir. Kullanıcı seçimi `yula_ai_config` (localStorage) + model popover’daki sağlayıcı listesi (`listConfiguredProviders`). Kayıt yoksa istek gövdesine `provider` yazılmaz; sunucu env’e güvenir.
- **Asistan metni:** `sanitize-assistant-text` sızıntı/yazı sistemi çöpünü temizler; akışta kelime yutmamak için metni `trim` etmez.
- **Rapor evreleri (karıştırma):** `/<workspace>/<rapor>` = kriter/job oluşturma (`apply_criteria` / `run_job`). `/<workspace>/<rapor>/<jobGuid>` = sonuç tablosu analizi (grid araçları). Sohbet geçmişi `pathname` + `jobId` tutar; analiz sohbeti açılınca GUID URL’ye dönülür. Kayıt, kullanıcının gerçekte kaldığı URL formunu korur (GUID path / `?job=`). Sohbet KENDİ aracıyla (`navigate_to_page` / `run_report` / `run_job` ve grid-slash kuyruğu) sayfa değiştirirse: push öncesi `beginConversationFollow` bayrağı konur, hedefe VARILDIĞINDA ekran-eşleme efekti `followArrivedConversation` ile kaydı yeni sayfaya bağlar (son açılan sayfa kazanır, aktif sohbet korunur, yeni sohbet AÇILMAZ, dock otomatik açılır). Bağlama push’tan ÖNCE YAPILMAZ — persist efekti eski sayfada kaydedip ezer. `saveMessages` içerik değişmeden sayfa bağını oynatmaz. Kullanıcı ELLE (breadcrumb/link/menü) sayfa değiştirirse KATI kural: her URL değişimi taze sohbet açar (normalizePath birebir eşleşme; gevşek baz-rota/rapor eşleşmesi yok); history tıklaması kaydın birebir sayfasına gittiği için korunur. Açılışta `healConversationRecords` ana sayfaya kalmış eski kayıtları mesajlardaki son navigasyon hedefine bağlar.
- **Çok Dilli LLM & Context Poisoning (Bağlam Zehirlenmesi) Önleme Standardı**:
  - Araçların (tools) LLM modeline geri döndürdüğü sistem geri bildirimleri, ipuçları ve hata mesajları (`message`, `hint`, `error`, `directive`, `note`) **tarafsız ve standart İngilizce** olmalıdır.
  - Araç çıktılarına asla *"doğrudan Türkçe sun"* vb. tek bir dili dayatan yönergeler yazılamaz; aksi takdirde model kullanıcının konuştuğu dili yansıtamaz ve bağlam zehirlenmesi (context poisoning) oluşur. Yanıt dilini daima kullanıcının konuşma dili ve LLM'in doğal dil yeteneği belirler.
  - İstemci tarafında `apply_criteria` vb. araç çağrılarının önüne yapay Türkçe fiil regex kapıları (`gatedApply`) konulmaz; çok dilli ortamda modelin niyet doğrulamasına ve Criteria Input Engine'in şema kurallarına güvenilir.
- **Yula AI Panel (Side Dock) Davranışı**: Yula AI paneli mobil veya küçük ekranlarda zorunlu tam ekrana geçmez (`isAutoFullscreen` kaldırılmıştır); tüm çözünürlüklerde yan çekmece (side dock / sheet) formunu ve genişlik kontrolünü korur.

## 🤖 Yula AI Agent Core: 3 Katmanlı Araç Mimarisi

Yula AI Agent Core, ekran evrelerine (State-Driven Tool Swapping) göre 3 ana araç katmanıyla çalışır:

```
                          ┌─────────────────────────────┐
                          │     Yula AI Agent Core      │
                          └──────────────┬──────────────┘
                                         │
     ┌───────────────────────────────────┼───────────────────────────────────┐
     ▼                                   ▼                                   ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│ Katman 1: Spreadsheet   │   │ Katman 2: DuckDB SQL    │   │ Katman 3: Criteria &    │
│ (UI / Görünüm & Odak)   │   │ (Analitik & Hesaplama)  │   │ Job Lifecycle Engine    │
├─────────────────────────┤   ├─────────────────────────┤   ├─────────────────────────┤
│ • set_grid_query        │   │ • run_expert_sql        │   │ • inspect_criteria_schema│
│ • set_grid_sort         │   │ • profile_grid_table    │   │ • get_current_criteria   │
│ • configure_grid_columns│   │ • analyze_grid_data     │   │ • validate_criteria_input│
│ • pin_grid_columns      │   │ • visualize_grid_data   │   │ • apply_criteria         │
│ • apply_grid_filters    │   │                         │   │ • run_job / run_report   │
│ • export_grid_data      │   │                         │   │ • list_report_executions │
│ • reset_grid_layout     │   │                         │   │ • cancel_job             │
└─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

### 1. Katman 1: Virtual Spreadsheet UI Tools
- İstemci tarafında çalışan, kullanıcının gördüğü tablo görünümünü anında değiştiren araçlar.
- `set_grid_query` (DuckDB görünümü / türetilmiş kolon / GROUP BY), `set_grid_sort` (sıralama), `configure_grid_columns` (kolon gizle/göster/sırala), `pin_grid_columns` (kolon sabitleme), `apply_grid_filters` (D365 süzgeçleri), `reset_grid_layout` (varsayılan düzene dönme), `export_grid_data` (Parquet/Excel/CSV dışa aktarım).

### 2. Katman 2: DuckDB SQL Tools
- Büyük veri üzerinde analitik, istatistiksel ve özet hesaplamalar yürüten araçlar.
- `run_expert_sql` (salt okunur SQL analitiği), `profile_grid_table` (veri kalitesi, boş değerler, min/max metrikleri), `analyze_grid_data` (hızlı KPI hesaplamaları), `visualize_grid_data` (grafik veri çıkarımı).

### 3. Katman 3: Criteria Input Engine & Job Lifecycle Tools
- Rapor kriter formunu canlı denetleyen, D365/BC sözdizimini doğrulayan ve iş yaşam döngüsünü yöneten araçlar.
- **Criteria Input Engine (`src/features/report-criteria/lib/criteria-input-engine.ts`)**:
  - D365 / Business Central Sözdizimi: Tarih ve sayı aralıkları (`100..200`, `2026-08-01..2026-08-31`, `..2026-08-31`), göreli tarihler (`dün`, `bugün`, `geçen hafta`, `bu ay`), karşılaştırmalar (`>100`, `<=50`, `<>0`) ve seçenekler (`10|20|30`).
  - Şema & Zorunluluk Kontrolü: JSON Schema'daki `required` alanların eksiklik tespiti, `enum` kontrolü ve tip uyumu.
  - Canlı Form Senkronizasyonu: `get_current_criteria` / `evaluateCurrentDraftCriteria` ile ekrandaki form taslağının içeriği okunur ve anlık doğrulama raporu (`errors`, `warnings`, `sanitizedCriteria`, `summary`) üretilir.
- **Job Lifecycle**:
  - `apply_criteria`: Doğrulanmış kriterleri forma yazar ve vurgular.
  - `run_job` / `run_report`: Doğrulanmış kriterlerle backend job başlatır.
  - `list_report_executions`: Raporun geçmiş çalışmalarını listeler.
  - `cancel_job`: Çalışan işi backend ve UI seviyesinde iptal eder.

