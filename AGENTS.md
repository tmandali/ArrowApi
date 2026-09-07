# ArrowApi

## Yula Client (Next.js frontend)

Mimari kararlar ve dizin yapısı kuralları için bak: **`src/Sims/yula.client/AGENTS.md`**
(her oturumda mutlaka oku).

Kısa özet:
- **Shell (host)** = root iskelet: routing, layout, sidebar, Yula, global sayfalar.
- **Workspace** = bağımsız iş alanı; kendi içeriği `src/workspaces/<workspace>/` altında, `src/app/` sadece ince wrapper.
- **Domain Workspace vs. Platform Core**: Platform altyapı modülleri (`auth`, `jobs`, `reports`, `report-criteria`, `system`, `settings`) `src/features/<feature>/` altında yaşar. Bağımsız iş alanları (`stock`, `selling`, `subcontracting`, `accounting`, `manufacturing`) `src/workspaces/<workspace>/` altındadır.
- **Workspace Rota Standardı**: Workspace kökü (`/<workspace>`) genel karşılama (landing) ekranıdır; özet pano ve KPI ekranları ise (`/<workspace>/dashboard`) standart alt rotasında yer alır.
- Her workspace kendini `workspace.config.ts` + `routes.ts` + `index.ts` ile **register eder**; `src/lib/workspace-registry.ts` tüm modülleri dinamik toplar.
- **Declarative YAML Agent Manifest & Command Registry**: Kod içerisinde hardcoded komut veya prompt tutulmaz. Sistem, grid ve workspace seviyesindeki tüm ajan/komut yetenekleri ilgili `src/workspaces/<workspace>/agents/*.agent.yaml` (veya `src/features/system/agents/`) manifest dosyalarında tanımlanır ve `yula-commands.ts` tarafından dinamik yüklenir.
- shadcn `components/ui/*`'a dokunma; `.oxlintrc.json` overrides ile korunur.
- Hook + Provider ayrı dosyalarda (Fast Refresh).
- **Workspace'ler ileride module federation ile ayrışacak** (her biri ayrı React remote'u);
  her değişiklikte workspace sınırlarını koru, cross-workspace import yasaktır, dışarıdan sadece workspace'in `index.ts` (Public API) kapısı tüketilir.
- **Büyük Veri Raporları**: Ortak `<ArrowReportGrid />` bileşeni, W3C OPFS yerel disk önbelleği ve DuckDB WASM motoru kullanılır. Raporlar F5 sonrası sıfır internet maliyetiyle diskten açılır.
- **Tauri 2.0 Masaüstü & Hibrit Web**: Proje hem tarayıcıda (`npm run dev`) hem masaüstünde (`npm run tauri:dev`) çalışır. Tauri bağımlılıkları `isTauriEnv` ile dinamik izoledir.
- **Gömülü Python AI Sidecar**: `sys.stdin`/`sys.stdout` JSON akışıyla çift yönlü Tool Calling ve `toolRegistry` köprüsü.
- **Context-Aware & Scoped AI Ajanı**: 3 kademeli hiyerarşik kapsam (Global > Workspace > Page Scope), `useScreenAgentContext` ile dinamik araç kaydı/temizliği, çift yönlü canlı React state paylaşımı, State-Driven Tool Swapping (Kriter vs Sonuç modu), Few-Shot Data Grounding (örnek satır ile kolon eşleme) ve akıllı çapraz workspace yönlendirmesi.
- **3 Katmanlı Yula AI Agent Core Araç Mimarisi**:
  - **Katman 1 (Virtual Spreadsheet UI Tools)**: `set_grid_query` (DuckDB görünümü/GROUP BY), `set_grid_sort`, `configure_grid_columns`, `pin_grid_columns`, `apply_grid_filters`, `reset_grid_layout`, `export_grid_data`.
  - **Katman 2 (DuckDB SQL Tools)**: `run_expert_sql` (salt okunur SQL analitiği), `profile_grid_table` (veri kalitesi/anomali), `analyze_grid_data` (hızlı KPI), `visualize_grid_data` (grafik).
  - **Katman 3 (Criteria Input Engine & Job Lifecycle)**: `validate_criteria_input` (D365/BC sözdizimi: `100..200`, `..2026-08-31`, `dün`, `geçen hafta`, `required`, `enum`), `get_current_criteria` (canlı form taslağı okuma & doğrulama), `apply_criteria`, `run_job` / `run_report`, `list_report_executions`, `cancel_job`, `open_last_report`.
- **2 Kademeli Hibrit AI Yönlendirici (Fast Intent Router + seçili LLM)**: Yüksek güvenilirlikli rapor ve öneri istekleri yerel şema eşleştiriciyle anında (**~12 ms**); serbest dilli talepler aktif sağlayıcıdaki modele gider (varsayılan Microsoft Foundry / Azure, ayrıca OpenAI veya yerel Ollama). Sohbet `streamText({ tools })` ile provider-agnostiktir; SDK seçimi `yula-provider.ts` adaptöründedir. DevTools konsolunda AI telemetrisi (`🤖 [Yula AI Telemetry]`) basılır.
- **Tak-Çalıştır Workspace Rapor Kaydı**: Workspace'ler raporlarını `YulaReportCardConfig` ve JSON Schema'nın yapılandırılmış `x-ai` bloğu (`aliases`, `quickPrompts`, `columnAliases`) ile tanımlar; AI iç kodlarına dokunmadan hem Fast Router'a hem de LLM'e otomatik kaydolur.
- **Native Auto-Updater**: Güncelleme kontrolleri web UI'ı kirletmeden sadece macOS/Windows native menüsü (`Check for Updates...`) ve Rust diyalogları üzerinden yürütülür.

### 📋 Yeni Bir Rapor / Ajan Eklenirken Yapılması Gerekenler (Adım Adım Checklist)
Projeye yeni bir rapor veya ajan komutu eklendiğinde aşağıdaki adımlar eksiksiz uygulanmalıdır:

1. **JSON Schema Tanımı (`schemas/<report>-criteria.schema.json`):**
   - `x-scope`, `x-page-path`, `x-job-endpoint` ve `x-ai` (`aliases`, `quickPrompts`, `resultsPrompts`, `columnHints`) alanları içeren kriter şemasını tanımla.
2. **YAML Agent Manifest Tanımı (`src/workspaces/<workspace>/agents/<name>.agent.yaml`):**
   - Yeni workspace veya feature komutu/ajan yeteneği gerektiğinde hardcode kod yazmak yerine ilgili `agents/` klasöründe YAML manifest dosyasını tanımla.
3. **Rapor Kaydı (`src/features/reports/report-registry.ts`):**
   - Oluşturulan JSON şemasını ilgili workspace'in `index.ts` Public API'sinden dışa aç ve `REGISTERED_REPORTS` dizisine `scope`, `workspace`, `title`, `pagePath`, `aliases` ve `fullSchema` ile ekle.
4. **Next.js Rota Sayfası (`src/app/`):**
   - Rapor Ekranı: `src/app/<workspace>/<report>/page.tsx` (Tek sayfa standardı: kriter filtreleri, yürütme geçmişi ve sonuç DuckDB gridi aynı sayfada birleşiktir; doğrudan iş bağlantıları `?jobId=<guid>` parametresi ile açılır).
5. **Sonuç Ekranı Bileşeni (`<Report>ResultGrid.tsx`):**
   - Rapor sonuç bileşenini standart OPFS + DuckDB WASM destekli `<ArrowReportGrid jobId={jobId} jobUrl={reportUrl} reportScope="<scope>" ... />` ile oluştur ve Form içinde `renderResult` prop'una bağla.
6. **Yol & Başlık Biçimlendirme (`src/lib/workspace-paths.ts`):**
   - `formatPathnameLabel(pathname)` fonksiyonuna raporun Türkçe etiketini ekle (`if (pathname.includes("/<workspace>/<report>")) return "<Rapor Adı>"`).

### 📊 Rapor Yaşam Döngüsü, Tek Sayfa Mimarisi ve SSE Akışı

#### 1. Tek Sayfa Mimarisi (Single-Page Unified Report Flow)
- Rapor rotası daima `src/app/<workspace>/<report>/page.tsx` altındadır. Eski ayrı `[jobId]` sayfaları yerine `?jobId=<guid>` URL sorgu parametresi kullanılır (`/[jobId]` klasörleri geriye dönük uyumluluk için `redirect` ile `?jobId=` formatına yönlendirir).
- Rapor ekranı 3 temel bloktan oluşur:
  1. **Kriter Filtreleri Formu (`<Report>Form.tsx` & `<Report>Filter.tsx`)**: Kullanıcı kriterlerini girer veya AI üzerinden şema tabanlı doldurur.
  2. **Birleşik Yürütme Paneli (`<ArrowJobExecutionsPanel />`)**:
     - Sol tarafta geçmiş yürütmeler listesi (tarih, süre, satır sayısı, durum ikonu).
     - Sağ tarafta seçili işin kriterleri (JSON veya kriter tablosu) ve canlı ilerleme akışı (`<RunProgressSteps />`).
     - `Completed`, `Failed` ve `Cancelled` işler üzerinde hover yapıldığında silme çöp kutusu görünür.
     - Çalışan işler için iptal etme (`Cancel`), sonlanmış işler için silme (`Delete`) aksiyonları sayfa başlığında ve panelde entegredir.
  3. **Sonuç Grid Paneli (`<ArrowJobResultPanel />` & `<ArrowReportGrid />`)**: DuckDB WASM ve W3C OPFS disk önbelleğiyle büyük veriyi sıfır bellek yüküyle sunar.

#### 2. SSE Canlı Olay Akışı (Server-Sent Events)
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
