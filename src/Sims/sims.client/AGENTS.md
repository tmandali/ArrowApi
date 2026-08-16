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

2. **Gömülü Python AI Sidecar & MCP Tool Calling (`binaries/main`):**
   - Masaüstü modunda yerel Python ajanı (`binaries/main`) bir child process (sidecar) olarak başlatılır.
   - Ajan ile React arayüzü `sys.stdin` / `sys.stdout` JSON akışı üzerinden haberleşir.
   - **Tool Registry (`@/lib/tool-registry`):** Frontend'deki yetenekler (örn: `update_report_filters`) sisteme kaydedilir. Ajan stdout'a `{"type": "tool_call", "tool": "...", "arguments": {...}}` bastığında dinamik olarak yürütülür ve rapor/state otomatik güncellenir.
   - Web ortamında `useAgentBridge` otomatik olarak `browser_fallback` simülasyon moduna geçer.

3. **Native Auto-Updater & İşletim Sistemi Menüsü:**
   - **React UI Temizliği:** Güncelleme denetimi, indirme ve yeniden başlatma işlemleri React arayüzünde buton kalabalığı yaratmaz.
   - **Native OS Menüsü:** Yalnızca macOS Apple / Help menüsünde ve Windows Pencere Menüsünde (`Check for Updates...`) native olarak çalışır (`src-tauri/src/lib.rs`).
   - **Native Dialogs (`tauri-plugin-dialog`):** Güncelleme onayları ve hata bilgilendirmeleri işletim sisteminin native MessageBox pencereleri üzerinden gösterilir.
   - **Açılışta Sessiz Kontrol:** Uygulama açıldığında 3 saniye sonra arka planda sessizce yeni sürüm olup olmadığı kontrol edilir; sadece yeni sürüm varsa kullanıcıya native onay çıkar.
