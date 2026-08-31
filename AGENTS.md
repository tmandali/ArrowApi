# ArrowApi

## Yula Client (Next.js frontend)

Mimari kararlar ve dizin yapısı kuralları için bak: **`src/Sims/yula.client/AGENTS.md`**
(her oturumda mutlaka oku).

Kısa özet:
- **Shell (host)** = root iskelet: routing, layout, sidebar, Yula, global sayfalar.
- **Workspace** = bağımsız iş alanı; kendi içeriği `features/<workspace>/` altında, `pages/` sadece ince wrapper.
- **Workspace Rota Standardı**: Workspace kökü (`/<workspace>`) genel karşılama (landing) ekranıdır; özet pano ve KPI ekranları ise (`/<workspace>/dashboard`) standart alt rotasında yer alır.
- Her workspace kendini `index.ts` + `routes.ts` ile **register eder**; shell route'ları toplar.
- Workspace'e özgü ekranlar `features/<workspace>/`, global ekranlar `features/<feature>/`.
- **Declarative YAML Agent Manifest & Command Registry**: Kod içerisinde hardcoded komut veya prompt tutulmaz. Sistem, grid ve workspace seviyesindeki tüm ajan/komut yetenekleri ilgili `src/features/<workspace>/agents/*.agent.yaml` manifest dosyalarında tanımlanır ve `yula-commands.ts` tarafından dinamik yüklenir.
- shadcn `components/ui/*`'a dokunma; `.oxlintrc.json` overrides ile korunur.
- Hook + Provider ayrı dosyalarda (Fast Refresh).
- **Workspace'ler ileride module federation ile ayrışacak** (her biri ayrı React remote'u);
  her değişiklikte workspace sınırlarını koru, cross-workspace import minimal olsun.
- **Büyük Veri Raporları**: Ortak `<ArrowReportGrid />` bileşeni, W3C OPFS yerel disk önbelleği ve DuckDB WASM motoru kullanılır. Raporlar F5 sonrası sıfır internet maliyetiyle diskten açılır.
- **Tauri 2.0 Masaüstü & Hibrit Web**: Proje hem tarayıcıda (`npm run dev`) hem masaüstünde (`npm run tauri:dev`) çalışır. Tauri bağımlılıkları `isTauriEnv` ile dinamik izoledir.
- **Gömülü Python AI Sidecar**: `sys.stdin`/`sys.stdout` JSON akışıyla çift yönlü Tool Calling ve `toolRegistry` köprüsü.
- **Context-Aware & Scoped AI Ajanı**: 3 kademeli hiyerarşik kapsam (Global > Workspace > Page Scope), `useScreenAgentContext` ile dinamik araç kaydı/temizliği, çift yönlü canlı React state paylaşımı, State-Driven Tool Swapping (Kriter vs Sonuç modu), Few-Shot Data Grounding (örnek satır ile kolon eşleme) ve akıllı çapraz workspace yönlendirmesi.
- **2 Kademeli Hibrit AI Yönlendirici (Fast Intent Router + Gemma 4 LLM)**: Yüksek güvenilirlikli rapor ve öneri istekleri yerel şema eşleştiriciyle anında (**~12 ms**), serbest dilli karmaşık talepler **Gemma 4 LLM** ile işlenir. DevTools konsolunda renkli AI telemetrisi (`🤖 [Yula AI Telemetry]`) basılır.
- **Tak-Çalıştır Workspace Rapor Kaydı**: Workspace'ler raporlarını `YulaReportCardConfig` ve JSON Schema'nın yapılandırılmış `x-ai` bloğu (`aliases`, `quickPrompts`, `columnAliases`) ile tanımlar; AI iç kodlarına dokunmadan hem Fast Router'a hem de LLM'e otomatik kaydolur.
- **Native Auto-Updater**: Güncelleme kontrolleri web UI'ı kirletmeden sadece macOS/Windows native menüsü (`Check for Updates...`) ve Rust diyalogları üzerinden yürütülür.

### 📋 Yeni Bir Rapor / Ajan Eklenirken Yapılması Gerekenler (Adım Adım Checklist)
Projeye yeni bir rapor veya ajan komutu eklendiğinde aşağıdaki adımlar eksiksiz uygulanmalıdır:

1. **JSON Schema Tanımı (`schemas/<report>-criteria.schema.json`):**
   - `x-scope`, `x-page-path`, `x-job-endpoint` ve `x-ai` (`aliases`, `quickPrompts`, `resultsPrompts`, `columnHints`) alanları içeren kriter şemasını tanımla.
2. **YAML Agent Manifest Tanımı (`src/features/<workspace>/agents/<name>.agent.yaml`):**
   - Yeni workspace veya feature komutu/ajan yeteneği gerektiğinde hardcode kod yazmak yerine ilgili `agents/` klasöründe YAML manifest dosyasını tanımla.
3. **Rapor Kaydı (`src/features/reports/report-registry.ts`):**
   - Oluşturulan JSON şemasını `REGISTERED_REPORTS` dizisine `scope`, `workspace`, `title`, `pagePath`, `aliases` ve `fullSchema` ile ekle.
4. **Next.js Rota Sayfaları (`src/app/`):**
   - Kriter / Karşılama Sayfası: `src/app/<workspace>/<report>/page.tsx`
   - GUID Sonuç Ekranı: `src/app/<workspace>/<report>/[jobId]/page.tsx`
5. **Sonuç Ekranı Bileşeni (`<Report>JobView.tsx`):**
   - Rapor sonuç bileşenini standart OPFS + DuckDB WASM destekli `<ArrowReportGrid jobId={jobId} jobUrl={reportUrl} reportScope="<scope>" ... />` ile oluştur.
6. **Yol & Başlık Biçimlendirme (`src/lib/workspace-paths.ts`):**
   - `formatPathnameLabel(pathname)` fonksiyonuna raporun Türkçe etiketini ekle (`if (pathname.includes("/<workspace>/<report>")) return "<Rapor Adı>"`).
