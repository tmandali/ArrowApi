# AGENTS.md — Sims Client Mimari Kuralları

Bu dosya, `src/Sims/sims.client` (Vite + React 19 + TypeScript + Tailwind v4) için alınmış
mimari kararların tek kaynağıdır. **Her yeni oturumda bu dosyayı oku ve aşağıdaki kurallara uy.**

## Çalışma Komutları

```bash
cd src/Sims/sims.client
npm run dev          # Web dev sunucusu (https, port 56402)
npm run tauri:dev    # Tauri 2.0 Masaüstü uygulaması + dev sunucusu
npm run tauri:build  # Tauri 2.0 Masaüstü production bundle
npm run build        # tsc -b && vite build (Web bundle)
npm run lint         # oxlint
npx tsc -b --noEmit  # TypeScript tip kontrolü
```

## Mimari Model

```
┌─────────────────────────────────────────────────────────────┐
│  SHELL (host) — uygulama iskeleti, workspace'ten bağımsız     │
│  App · routes · layout · sidebar · header · Yula · providers  │
│  context/ · store/ · services/ · lib/ · hooks/ · components/  │
└─────────────────────────────────────────────────────────────┘
        ▲                          ▲
        │ kontrat                  │ public API
        │ (ui, context, services)  │ (index.ts + routes.ts)
┌───────┴────────┐  ┌──────────────┴────────┐
│  WORKSPACE A   │  │   WORKSPACE B          │
│  features/A/   │  │   features/B/          │
└────────────────┘  └────────────────────────┘
```

### Workspace Nedir?
- **Workspace** = bağımsız bir iş alanı (ör. stok, satış, muhasebe, üretim). Kendi sayfalarını,
  formlarını, servislerini, tiplerini barındırır.
- **Shell** = root/host. Workspace'lerin yaşadığı iskelet: routing, sidebar/nav, page header,
  AI dock, auth, user settings gibi **workspace'ten bağımsız** genel özellikler.
- Workspace **kendini register eder**: içeriğini shell'e `index.ts` + `routes.ts` üzerinden sunar.
- **Gelecek hedefi:** her workspace ileride module federation ile **ayrı bir React uygulaması
  (remote)** olarak deploy edilir; shell host olur. Bu yüzden workspace sınırları her değişiklikte korunur.

## Dizin Yapısı ve Sorumluluklar

```
src/
├── pages/          → SADECE ince route wrapper'ları. İçerik yok, feature'a yönlendirir.
├── features/<feature>/
│   ├── components/ → sayfa/form bileşenleri
│   ├── hooks/ · services/ · types/ · schemas/
│   ├── routes.ts   → workspace kendi route'larını buradan register eder
│   └── index.ts    → feature'ın public API'si
├── shell katmanı:
│   ├── components/ui/      → shadcn primitives (DOKUNMA, güncellemelerde çakışır)
│   ├── components/layout/  → sidebar, page header/dock/shell, Yula
│   ├── components/common/  → genel yeniden kullanılabilir bileşenler
│   └── context/ · store/ · services/ · lib/ · hooks/ · routes/
```

## Kritik Mimari Kurallar

1. **Global vs Workspace**
   - Workspace'e özgü ekranlar → `features/<workspace>/`
   - Workspace'ten bağımsız, tüm workspace'lerde ortak ekranlar → `features/<feature>/` (auth, settings, vb.)
   - Kural: hangi workspace'e ait olduğu path'ten belli olan ekran workspace'tir; workspace'ten bağımsız olan global'dir.

2. **`src/pages/` sadece wrapper**
   ```tsx
   import { XxxForm } from "@/features/<workspace>"
   export default function XxxPage() { return <XxxForm /> }
   ```
   Sayfa mantığı asla `pages/` içinde tutulmaz.

3. **shadcn `components/ui/*`'a DOKUNMA.** Paket güncellemelerinde çakışır. `.oxlintrc.json`'daki
   `overrides` bu klasörde `react/only-export-components`'ı zaten kapatır.

4. **Hook + Provider ayrı dosyalarda.** Bileşen dosyasından hook export edilmez (Fast Refresh).
   - Provider `XxxProvider` → ayrı `xxx-context.ts` (context + hook), provider dosyası sadece bileşen.
   - Sabitler/yardımcılar ayrı `*-data.ts` / `*-utils.ts` / `*-hooks.ts` dosyalarında.

5. **Aktif workspace korunur.** Global sayfalarda (user-settings, dashboard, login vb.) workspace
   değişmez; son ziyaret edilen korunur. Kaynak: `src/hooks/use-active-workspace.ts`
   (`useActiveWorkspaceId`, `workspaceIdFromPath`). `WorkspaceSwitcher` + `AppSidebar` bunu kullanır.

6. **Workspace sayfaları ortak shell kullanır.**
   `src/components/layout/workspace-page-shell.tsx` → header (breadcrumb + actions + search) +
   AI dock'u tek kontrata toplar. Sayfa formları sadece içerik + breadcrumb/actions prop'larını verir;
   header/dock yapısını kendileri kurmaz. Yeni sayfa eklerken bu shell'i kullan.

7. **Workspace route kaydı veri odaklıdır.**
   Her workspace `features/<workspace>/routes.ts` içinde `WorkspaceRouteConfig[]` export eder
   (`{ path, Component: lazy(...), fullHeight? }`), `index.ts`'ten re-export edilir.
   `src/routes/AppRoutes.tsx` bunları toplar ve render eder.
   - Yeni sayfa eklemek: `pages/XxxPage.tsx` (wrapper) + `features/<ws>/routes.ts`'e satır.
   - Workspace home path'leri (`/`, `/selling`, `/accounting`, `/stock`, `/manufacturing`) shell'de ortak tanımlıdır.

8. **Workspace sınırları her değişiklikte korunur (ZORUNLU).**
   - Workspace içeriği sadece kendi `features/<workspace>/` altında; `pages/` yalnızca wrapper.
   - Workspace → shell bağımlılığı sadece "kontrat" üzerinden: `components/ui/*`,
     `components/layout/panel-chrome` + `workspace-page-shell`, `lib/empty-module`, `services`,
     `context/*-context.ts` + store'lar. Workspace kendi iç mantığını shell'de tutmaz.
   - Cross-workspace bağımlılığı **minimal** tut; bir workspace başka workspace'in özelliğini
     kullanmak zorundaysa bunu ortak bir global feature'a taşı.
   - Nav/route kaydı shell'de toplanır; ileride dinamik remote map'e dönüşür.

## Routing

- Route'lar `features/<ws>/routes.ts` kaynaklıdır; `AppRoutes.tsx` toplar.
- Global sayfalar (login, user-settings, not-found, home) shell'de tanımlıdır.
- Workspace home path'leri ortak HomePage'e gider.
- **Route bileşenleri eager import edilir** (`WorkspaceRouteConfig.Component = ComponentType`,
  `lazy`/`Suspense` yok). Neden: Suspense fallback'i geçişte sayfayı boşaltıyordu;
  eager import ile geçişte içerik asla kaybolmaz. Code-splitting ileride module federation
  remote'larına taşınır.

## Dashboard / Yula

- Workspace home: Yula varsayılan açık. Breadcrumb workspace linkleri `state={{ yulaClosed: true }}`
  ile gelince Yula kapalı açılır (HomePage `location.state` okur).
- Dashboard içeriği global bir feature'da; kutu yerine transparent Card kullanılır.

## Route Geçişleri

- Route değişiminde (pathname) sayfa **yerinde kalır**, üstte ince `RouteTopBar`
  (`components/layout/route-top-bar.tsx`) 350ms belirir. `AppRoutes` içinde `useEffect` + timeout ile.
- Yükleme ekranında şirket/marka adı gösterilmez (yalnızca şirket değiştirme overlay'i gösterir).

## Büyük Veri Raporlama Mimarisi (Arrow + OPFS + DuckDB WASM)

Tüm workspace'lerdeki (Stok, Satış, Muhasebe vb.) büyük raporlama ekranları ortak **Arrow & DuckDB** altyapısını kullanır:

1. **Ortak Rapor Bileşeni (`ArrowReportGrid` - `@/features/jobs`):**
   - Rapor ekranlarında doğrudan `<ArrowReportGrid jobId={id} jobUrl={url} title="Rapor Başlığı" expectedTotalRows={total} />` şeklinde kullanılır.
   - Kolonları, sayısal tipleri, hizalamaları ve formatlamaları otomatik algılar.

2. **OPFS (Origin Private File System) Kalıcı Disk Önbelleği (`@/services`):**
   - Sunucudan gelen Arrow akışı (`res.body.tee()`) JavaScript RAM'inde biriktirilmez; doğrudan tarayıcının yerel SSD diskine (`sims_arrow_reports/{jobId}.arrow`) yazılır.
   - Sayfa yenilendiğinde (`F5`), sekme kapatıldığında veya tarayıcı yeniden açıldığında **sunucuya sıfır (0) HTTP isteği** gönderilir; rapor yerel SSD'den saliseler içinde açılır.
   - Sağ üstteki "Yenile" (Refresh) butonu OPFS diskindeki eski dosyayı ve DuckDB tablosunu silerek sunucudan taze veri çeker.

3. **Arka Plan Akış Yöneticisi (`duckStreamManager` - `@/features/jobs`):**
   - Kullanıcı rapor inerken başka bir sayfaya veya workspace'e geçse dahi indirme ve diske yazma arka planda kesintisiz devam eder; geri dönüldüğünde kaldığı yerden otomatik bağlanır.

4. **DuckDB WASM & Sorgu Motoru (`@/services/duckdb`):**
   - Filtreleme, arama ve sıralama işlemlerini tarayıcı içinde C++ SIMD hızında yürütür.
   - Dynamics 365 / Business Central arama sözdizimini (`100..500`, `>100&<500`, `SKU*`, `|`, `!`) SQL sorgularına çevirir (`filter-parser.ts`).
   - `SET preserve_insertion_order=false;` ile bellek optimize edilir.
   - Devasa (100M+) satırlarda tarayıcının 32-bit WASM tavanına (3.1 GB) ulaşılması halinde inen onlarca milyon satır korunarak kullanıcıya sunulur.

## Tauri 2.0 Masaüstü & Hibrit Web Mimarisi

Uygulama hem web tarayıcısında (`npm run dev`) hem de Tauri 2.0 masaüstü sarmalayıcısında (`npm run tauri:dev`, `npm run tauri:build`) çalışacak şekilde **hibrit ve izole** tasarlanmıştır:

1. **Ortam Tespiti (`isTauriEnv` - `@/lib/api-url`):**
   - Kod tabanında `isTauriEnv` (`"__TAURI_INTERNALS__" in window || "__TAURI__" in window`) üzerinden dinamik kontrol yapılır.
   - `@tauri-apps/*` paketleri React bileşenlerinde statik `import` edilmez; sadece `isTauriEnv === true` iken dinamik (`await import(...)`) çağrılır.
   - Bu sayede React kodları web tarayıcısında sıfır import hatasıyla çalışır.

2. **Gömülü Python AI Sidecar & Bağımsız Binary (`binaries/main`):**
   - Masaüstü modunda yerel Python ajanı (`binaries/main`) bir child process (sidecar) olarak başlatılır.
   - **Sıfır Python Bağımlılığı (Zero-Dependency):** Canlı dağıtımda `npm run build:sidecar` (PyInstaller) ile Python motoru, Needle SLM ve tüm betikler tek bir bağımsız native binary'ye (`main-aarch64-apple-darwin`, `main-x86_64-pc-windows-msvc.exe`) derlenir. Son kullanıcının makinesinde Python kurulu olması gerekmez.
   - Ajan ile React arayüzü `sys.stdin` / `sys.stdout` JSON akışı üzerinden haberleşir.
   - **Tool Registry (`@/lib/tool-registry`):** Frontend'deki yetenekler (örn: `update_report_filters`) sisteme kaydedilir. Ajan stdout'a `{"type": "tool_call", "tool": "...", "arguments": {...}}` bastığında dinamik olarak yürütülür ve rapor/state otomatik güncellenir.
   - Web ortamında `useAgentBridge` otomatik olarak `browser_fallback` simülasyon moduna geçer.

3. **Native Auto-Updater & İşletim Sistemi Menüsü:**
   - **React UI Temizliği:** Güncelleme denetimi, indirme ve yeniden başlatma işlemleri React arayüzünde buton kalabalığı yaratmaz.
   - **Native OS Menüsü:** Yalnızca macOS Apple / Help menüsünde ve Windows Pencere Menüsünde (`Check for Updates...`) native olarak çalışır (`src-tauri/src/lib.rs`).
   - **Native Dialogs (`tauri-plugin-dialog`):** Güncelleme onayları ve hata bilgilendirmeleri işletim sisteminin native MessageBox pencereleri üzerinden gösterilir.
   - **Açılışta Sessiz Kontrol:** Uygulama açıldığında 3 saniye sonra arka planda sessizce yeni sürüm olup olmadığı kontrol edilir; sadece yeni sürüm varsa kullanıcıya native onay çıkar.

## Context-Aware (Bağlam Duyarlı) & Scoped Yula AI Ajanı Mimarisi

Yula AI asistanı; monolitik bir sohbet botu yerine, kullanıcının o an hangi **Workspace** ve hangi **Ekran/Rapor** üzerinde çalıştığını bilen, hiyerarşik kapsamlı (Scoped) ve React State'leri ile çift yönlü konuşabilen bir mimaride çalışır:

1. **3 Kademeli Hiyerarşik Kapsam (Scope Hierarchy):**
   - **Global / Shell Scope:** Her zaman aktif araçlar (tema değiştir, workspace değiştir, update kontrol et).
   - **Workspace Scope:** Aktif workspace (`stock`, `accounting`, `selling`, `manufacturing`) değiştikçe dinamik filtrelenen araçlar.
   - **Page / Screen Scope:** Kullanıcının baktığı ekrana/rapora özel anlık araçlar (Örn: `filter_current_grid`, `inspect_selected_row`).
   - **Öncelik Kuralı:** `Screen Scope > Workspace Scope > Global Scope`.

2. **Dinamik Ekran Bağlamı (`useScreenAgentContext` - `@/hooks/use-screen-agent-context`):**
   - Rapor ve form bileşenleri açıldığında Yula'ya `screenId`, `screenTitle`, `workspaceId`, `activeDataSummary` ve ekrana özel araç setini kaydeder.
   - Sayfadan çıkıldığında (`unmount`) ekrana ait tüm araçlar `toolRegistry`'den ve Yula bağlamından **otomatik temizlenir (`unregister`)**.

3. **Çift Yönlü Canlı React State Paylaşımı:**
   - Yula'dan gelen Tool Call (`filter_current_grid`), doğrudan ekranın React `setState` / form kancasını tetikler.
   - Ekrandaki filtre input kutuları (`sku`, `city`, `date_range`) canlı dolar ve veri tablosu/grid anında yeniden filtrelenir.
   - Kullanıcı da aynı inputları elle değiştirebilir (tam çift yönlü reaktif senkronizasyon).

4. **Context Envelope (Bağlam Zarfı):**
   - Kullanıcı her komut gönderdiğinde, arkadaki Python Sidecar (`binaries/main`) veya Browser NLP motoruna o an ekranda hangi veri ve filtrelerin açık olduğu bir `context` zarfı içinde iletilir.
   - Kullanıcı ekranda bir rapor açıkken *"SKU-102 filtrele"* dediğinde, AI başka bir rapora atlamak yerine **mevcut açık tablonun filtresini önceliklendirir**.

5. **Çapraz Workspace Yönlendirme & Farkındalığı (Cross-Workspace Awareness):**
   - Kullanıcı `Subcontracting` alanındayken `Stock` raporu istediğinde, AI *"Böyle bir rapor yok"* demez.
   - Raporun `Stock` alanına ait olduğunu belirten bilgilendirici not (`💡 Bu rapor **Stok (Stock)** çalışma alanı altında yer almaktadır`) döner ve kriter kartını üretir.
   - Karttaki "Sayfada Aç" tıklandığında hem ilgili rotaya yönlenir hem de Shell aktif workspace'i otomatik olarak hedef alana geçirir.

6. **Yula UI Rol Dağılımı:**
   - **Yandan Açılan Yula (Sağ Dock / Drawer):** Sayfa içi mikro asistan (Page Scope). Açık olan tabloyu ve filtreleri yönetir.
   - **Genel Yula Ekranı (Workspace AI Home / Fullscreen):** Workspace yöneticisi (Workspace Scope). Makro rapor keşfi ve yönlendirme yapar.

7. **Rapor Yaşam Evreleri & State-Driven Tool Swapping (Kriter vs Sonuç Tablosu):**
   - Bir rapor ekranı 2 temel yaşam evresine sahiptir ve `useScreenAgentContext` bu duruma göre araç setini dinamik değiştirir:
     1. **Kriter Belirleme Modu (Criteria Phase):** Ekranda henüz veri yokken `update_report_criteria` aracı aktiftir; tarih, şehir, depo form parametrelerini doldurur.
     2. **Sonuç İzleme Modu (Results / Grid Phase):** Rapor çalıştırılıp ekranda `<ArrowReportGrid />` açıldığında Yula'ya anında `filter_active_grid` aracı bağlanır. Kullanıcı *"SKU-001 filtrele"* dediğinde geriye dönüp yeni rapor oluşturmaz; doğrudan o anki açık tablonun/DuckDB'nin filtre state'ini günceller.

8. **Few-Shot Data Grounding (Canlı Örnek Satır ile Kolon & Veri Eşleştirme):**
   - Ekranda tablo/grid açıkken, `useScreenAgentContext` bağlamı içerisine tablonun ilk 3 satırı (`sampleRows: displayRows.slice(0, 3)`) yerleştirilir.
   - LLM (Ollama/Python Sidecar veya Browser Resolver); kullanıcının girdiği bir terimin (`SKU-001`, `Ankara`, `Vana`) hangi kolona ait olduğunu sadece kolon isimlerinden tahmin etmez; **örnek veri satırlarını inceleyerek** ilgili kolon adını (`item_code`, `warehouse`, `description`) %100 doğrulukla tespit eder.

9. **Doğal Dilden Business Central / D365 Filtre Sözdizimi Çevirici (`@/lib/bc-filter-synthesizer`):**
   - Kullanıcı karmaşık filtre operatörlerini bilmek zorunda kalmaz. Doğal dildeki istekler standart Business Central sözdizimine dönüştürülür:
     * *"100 ile 500 arası"* ➔ `100..500`
     * *"50000 üzeri"* ➔ `50000..`
     * *"1000 altı"* ➔ `..1000`
     * *"Ankara ve İzmir hariç"* ➔ `!Ankara&!İzmir`
     * *"Ankara veya İzmir"* ➔ `Ankara|İzmir`
     * *"SKU ile başlayanlar"* ➔ `SKU*`
     * *"Stokta bitenler"* ➔ `=0`
     * *"Stokta olanlar / Sıfır olmayan"* ➔ `<>0`
     * *"Boş olanlar"* ➔ `''`

10. **Sohbet İçi Canlı DuckDB SQL Analizi & Grafik / KPI Kartı (`YulaAnalyticsCard` & `analyze_grid_data`):**
    - Kullanıcı sadece filtrelemekle kalmayıp *"En yüksek bakiyeli 5 ürünü grafikle özetle"* veya *"Genel toplam ve metrikleri göster"* dediğinde:
    - `analyze_grid_data` aracı açık olan DuckDB/Arrow tablosu üzerinde toplama ve gruplama çalıştırır.
    - Yula, sohbet penceresi içerisinde dinamik Recharts (Pasta / Çubuk) ve KPI metrik kartlarını (`YulaAnalyticsCard`) canlı çizer.

11. **Dinamik Hızlı Aksiyon Butonları (`YulaQuickActionChips`):**
    - Kullanıcının bulunduğu ekrana ve yaşam evresine göre sohbet alanının üstünde proaktif öneri butonları belirir:
      * **Sonuç Tablosu Açıkken:** `[En Yüksek 5]`, `[Genel Toplam & KPI]`, `[Stokta Olanlar]`, `[Filtreleri Temizle]`
      * **Kriter Formundayken:** `[Son 7 Gün (TRY)]`, `[Sadece Aktifler]`, `[Raporu Çalıştır]`
      * **Genel Workspace Modundayken:** `[Stok Bakiye Raporu]`, `[Stok Analiz Raporu]`, `[Satış Raporu]`

12. **3 Kademeli Hibrit AI Yönlendirme (Fast Intent Router + Needle Micro SLM + LLM Fallback):**
    - **1. Kademe (Fast Intent Router - ~12 ms):** Net ve şemaya doğrudan eşleşen rapor/kriter istekleri (`x-ai-quick-prompts`, doğrudan komutlar) güven skoru > %80 ise sıfır gecikmeyle çalıştırılır.
    - **2. Kademe (Needle 2 Micro SLM - ~20-30 ms):** Kullanıcının doğal dilde ilettiği karmaşık parametreler (tarih aralıkları, Business Central filtre sözdizimi, slot-filling, durum enumları) ~14 MB boyutundaki yerel **Cactus Compute Needle 2** mikro modeli ve deterministik doğrulayıcı ile milisaniyeler içinde çıkarılır. Harici ağır Ollama/VRAM bağımlılığı olmadan yerel çalışır.
    - **3. Kademe (Gemma 4 LLM Fallback - ~2 sn):** Kullanıcı serbest dilli, derin akıl yürütme veya uzun diyalog gerektiren sorular sorduğunda devreye girer.

13. **DevTools AI Telemetri ve Şeffaflık Motoru (`🤖 [Yula AI Telemetry]`):**
    - Yapılan her AI etkileşiminde tarayıcı konsolunda renkli ve hiyerarşik bir telemetri kartı (`console.groupCollapsed`) basılır.
    - Çalışan model adı (Fast Intent, Needle 2 veya Gemma 4), giriş/çıkış/toplam token adetleri, uçtan uca milisaniye işlem süresi, AI'a gönderilen prompt/context ve tetiklenen Tool Call detayları anlık izlenebilir.

14. **Filtre Değeri Çözümleme Sözleşmesi (Öncelik Hiyerarşisi) — RAPOR-AGNOSTİK:**
    - Bu sözleşme uygulamanın TÜM raporları için tektir; yeni bir rapor eklemek bu katmanlarda kod değişikliği gerektirmez. Aşağıdaki kolon adları yalnızca temsilî örneklerdir.
    - Grid kolon seçimi (`resolveGridColumn` — `src/lib/grid-filter-resolver.ts`) KESİNLİKLE bu sırayla yapılır:
      1. **Örnek-set kanıtı** (Arrow/DuckDB `sampleRows`) — iki katman:
         - **Birebir/kod-ön eki** (`findSampleColumnMatch`): tam=3, kod-ön eki=2 → her şeyi EZER.
         - **Şekil-imzası** (`shapeSignature`: harf dizisi→`a`, sayı dizisi→`#`): örnek-sette değer yoksa bile veri dokusu uyuşan kolona gider ("Sample 222" ↔ ItemName örneği "Sample 8", imzalar "a #" =). İpucu kolonun dokusuyla çelişirse uyumlu kolon seçilir. Kaba imza (rakamsız tek parça, örn. `"MAIN"`→`a`) kanıt SAYILMAZ.
      2. **İpucu/kavram skorlaması**: skor ≥70 korunur; <70 ise zayıf kanıt (içerir=1) kazanır.
      3. Durum semantiği (aktif/pasif) → zayıf örnek kanıtı → tip odaklı (tarih/sayı) → desen koruması.
    - **Kelime-listesi guard ve rapor-özel kural YASAK.** Her koruma kolonun fiziksel tipinden türetilir; yeni rapor/kolon geldiğinde mevcut jenerik mekanizma otomatik çalışır ("her şeye özel guard yazmak sürdürülebilir değil" kararı).
    - Filtre değerinden hedef kolonun kendi ad/etiket kelimeleri `stripColumnTokensFromValue` ile sökülür: `"itemname timur"` + Item Code → `"timur"`.
    - **İki-Adımlı Model İşleyişi:** Dispatch anında `resolveColumnCandidates` (grid-filter-resolver.ts) yukarıdaki kanıt zinciriyle top-3 `columnCandidates` üretip bağlam zarfına ekler (`useAgentBridge.dispatchToSidecar`); Needle/Gemma **yalnızca bu dar listeden** seçer (`main.py` COLUMN CANDIDATES DIRECTIVE — listede yoksa `column` argümanını boş bırakır). Step-1 deterministik kodda, Step-2 modelde; yetkili çözüm yine execution'daki `resolveGridColumn`'dır.

15. **Şema-Tipi Grounding Zinciri (Arrow/DuckDB → Needle → Execution):**
    - `duckdb.worker` `DESCRIBE_TABLE` ham `duckType` döner → `ArrowReportGrid` bunu `columnTypes: {kolon: date|number|bool|text}` haritasına çevirir.
    - Bu harita üç yerden akar: (a) bağlam zarfı `activeDataSummary.columnTypes`, (b) `main.py` system prompt'una **SCHEMA TYPE DIRECTIVE** enjeksiyonu, (c) `filter_active_grid` tool açıklamasındaki tipli kolon özeti.
    - Jenerik doğrulama iki uca asılıdır: frontend `column-type-utils.ts` (`isDateLikeValue`/`isNumericLikeValue`) ve Python `schema_type_guard.py` (`self_correct_grid_filter`: DATE kolona serbest metin gelirse tool_call'ı `analyze_grid_data {chartType:kpi}` olarak öz-düzeltir).
    - Zincir tamamen şema-sürümlüdür: yüzlerce raporda tipler Arrow'dan okunduğu için rapor başına yapılandırma/kod yoktur.

16. **Bileşik Nitelik Grameri (Aile Bazlı, İki Kopya Tek Sözleşme):**
    - Dilbilgisi kavram-ailesi şeklindedir, rapor-ailesi değil: `<kavram ön eki> + <nitelik>` kalıbı. Mevcut aileler: item/ürün/malzeme (kod→item_code, ad/name→description), depo/warehouse, tarih/date... Nitelikler: `name/ad`→isim kavramı, `code/kod/no/id`→kod kavramı. Değer, ipucu kelimelerinden arındırılır.
    - Aynı gramer iki yerde yaşar: TS `bc-filter-synthesizer.ts` (web fast router + masaüstünde `synthesizeGridFilterArgs` düzeltme katmanı) ve Python `needle_engine.apply_compound_qualifier_args` (kriter formu araçları — grid kapalıyken Needle tek yetkili). **Biri değişirse diğeri de değişmeli**; grid araçları Python tarafında kasıtlı atlanır (frontend sözleşmesi yetkili).
    - YENİ BİR KAVRAM AİLESİ eklemek = iki dosyadaki ORTAK regex listesine tek satır; hiçbir zaman rapor/dosya başına kural yazılmaz.

17. **Araç-Halüsinasyonu Savunması:**
    - System prompt'ta araç isimleri koşulsuz emir olarak verilemez ("DAİMA X çağır" yalnızca o araç o ekranın verilen listesinde GERÇEKTEN varsa); genel kural: *"yalnızca verilen araç listesindeki isimlerle, birebir aynı yazımla çağrı yap"*.
    - Frontend son savunma: sidecar'dan kayıtsız bir araç adı gelirse hata baloncuğu yerine sessizce `browserSchemaFallback`'a düşülür (`useAgentBridge.ts`).

18. **Sayım Niyeti Yönlendirmesi:**
    - `"kaç kayıt var"` / `"how many"` gibi sorular herhangi bir tabloda filtre değeri OLAMAZ. Sözlükteki `count` intent'i (kelime-sınırı eşleşmeli, `"kac"` ≠ `"kaçak"`) promptu deterministik olarak `analyze_grid_data {chartType:"kpi"}` aracına çevirir (~12 ms); bu vaka için Gemma delegasyonu gerekmez. Tüm rapor gridlerinde otomatik geçerlidir.

19. **Yula Test Altyapısı ve Test Edilebilirlik Deseni:**
    - TS: `npm test` (vitest, `vitest.config.ts`, `@` alias'lı). Python: `src-tauri/binaries/test_*.py` (stdlib unittest).
    - Kural: AI karar mantığı saf, çerçevesiz modüllere yazılır (`features/jobs/lib/column-type-utils.ts`, `binaries/schema_type_guard.py` pattern'i) — bileşen/sidecar içine gömülü mantık test edilemez.

## Geliştirici & Kodlama Ajanı Rehberi (Yeni Özellik Ekleme Standartları)

Kodlama ajanları ve geliştiriciler yeni bir özellik eklerken aşağıdaki katı kuralları izler:

1. **Yeni Bir Ekran / Form Eklerken:**
   - **Bileşen Mantığı:** `src/features/<workspace>/components/XxxView.tsx` veya `XxxForm.tsx` içine yazılır.
   - **Sayfa Wrapper'ı:** `src/pages/XxxPage.tsx` SADECE feature bileşenini import edip döndürür (3 satır).
   - **Route Kaydı:** `src/features/<workspace>/routes.ts` dizisine eklenir (`WorkspaceRouteConfig`).
   - **Yula Entegrasyonu:** Ekrandaki filtre ve verileri `useScreenAgentContext(...)` ile bağlayarak Yula'ya çift yönlü aç.

2. **Yeni Bir Rapor Eklerken (Tak-Çalıştır / Plug & Play Standartı):**
   - **Kriter Şeması & Config:** `src/features/<workspace>/schemas/` veya rapor dosyasında `YulaReportCardConfig` tipinde yapılandırılır:
     ```typescript
     export const xxxReportConfig: YulaReportCardConfig = {
       scope: "xxx-report",
       workspace: "stock", // veya "selling", "accounting", "manufacturing"
       title: "Rapor Başlığı",
       pagePath: "/stock/reports/xxx-report",
       kind: "yula_criteria_form",
       schema: XxxReportCriteriaSchema, // JSON Schema
     };
     ```
   - **Gelişmiş AI Şema Direktifleri (JSON Schema Extensions):**
     * `x-ai-aliases`: `["stok bakiye", "depo dökümü", "malzeme bakiye"]` ➔ Fast Intent Router ve LLM sinonim sözlüğü.
     * `x-ai-quick-prompts`: `["Sadece AKTIF kayıtlar", "50.000 TL üzeri"]` ➔ Karta eklenen hızlı tıklama önerileri.
     * `x-date-behavior`: `range_start`, `range_end`, `range_string` ➔ Tarih alanlarının göreceli bağlanma kuralları.
   - **Otomatik Kayıt:** `registerReportSchemaTool(xxxReportConfig)` veya `initAutoReportRegistry()` çağrıldığı anda rapor hem Fast Intent Router'a (12 ms) hem de Python Sidecar'a otomatik kaydolur. AI iç kodlarında hiçbir değişiklik gerekmez.
   - **Büyük Veri Tablosu:** Doğrudan `<ArrowReportGrid />` bileşenini kullan (DuckDB WASM + OPFS disk önbelleği otomatik çalışır).
   - **AI Sözleşmeleri Otomatik Geçerlidir (Yukarı madde 14-18):** Yeni rapor; şema-tipi grounding, örnek-set kanıtı, bileşik nitelik grameri, sayım niyeti ve araç-halüsinasyonu savunmalarından SIFIR ek kodla yararlanır. Rapora özel filtre kuralı/guard/kelime listesi YAZILMAZ — ihtiyaç görülürse ilgili JENERİK mekanizma (ortak regex ailesi, tip doğrulayıcı) genişletilir.

3. **UI & Stil Kuralları:**
   - **Tailwind v4:** `tailwind.config.js` aranmaz; CSS `@theme` değişkenleri `src/index.css` dosyasındadır.
   - **shadcn `components/ui/*` Dokunulmazdır:** Bileşenleri doğrudan düzenlemek yerine `cn(...)`, slot'lar veya üst wrapper'lar ile stil verilir.


